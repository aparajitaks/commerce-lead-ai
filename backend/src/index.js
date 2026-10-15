import "dotenv/config";
import express from "express";
import cors from "cors";

import Groq from "groq-sdk";
import prisma from "./lib/prisma.js";
import products from "./data/products.js";
import {
    createPayPalOrder,
    capturePayPalOrder,
} from "./lib/paypal.js";

const app = express();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "Commerce Lead AI" });
});

// Create a local order and its corresponding PayPal order.
app.post("/api/orders", async (req, res) => {
    try {
        const { items } = req.body;
        const currency = process.env.PAYPAL_CURRENCY || "USD";

        let amount = "10.00";
        let description = "Commerce Lead AI Sandbox Demo";

        if (Array.isArray(items) && items.length > 0) {
            let total = 0;
            const itemSummaries = [];

            for (const item of items) {
                const product = products.find((p) => p.id === item.id);
                if (!product) {
                    return res.status(400).json({ error: `Unknown product ID: ${item.id}` });
                }
                const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
                total += product.price * qty;
                itemSummaries.push(`${qty}x ${product.name}`);
            }

            amount = total.toFixed(2);
            description = itemSummaries.join(", ");
            if (description.length > 120) {
                description = description.slice(0, 117) + "...";
            }
        }

        const localOrder = await prisma.paymentOrder.create({
            data: {
                amount,
                currency,
                description,
                status: "PENDING",
            },
        });

        const paypalOrder = await createPayPalOrder(amount, description);

        console.log(
            "PayPal order created:",
            JSON.stringify({
                id: paypalOrder.id,
                status: paypalOrder.status,
                intent: paypalOrder.intent,
                amount,
                currency,
                links: paypalOrder.links?.map((link) => ({
                    rel: link.rel,
                    method: link.method,
                    href: link.href,
                })),
            }, null, 2)
        );

        if (!paypalOrder.id) {
            throw new Error("PayPal did not return an order ID");
        }

        await prisma.paymentOrder.update({
            where: { id: localOrder.id },
            data: { paypalOrderId: paypalOrder.id },
        });

        res.status(201).json({
            id: paypalOrder.id,
            localOrderId: localOrder.id,
            amount,
        });
    } catch (error) {
        console.error("Create order failed:", error.message);
        res.status(500).json({ error: "Unable to create payment order" });
    }
});

// Capture an approved PayPal order.
app.post("/api/orders/:orderId/capture", async (req, res) => {
    try {
        const { orderId } = req.params;

        const localOrder = await prisma.paymentOrder.findUnique({
            where: { paypalOrderId: orderId },
        });

        if (!localOrder) {
            return res.status(404).json({ error: "Order not found" });
        }

        if (localOrder.status === "COMPLETED") {
            return res.json({
                status: "COMPLETED",
                message: "Payment was already captured",
            });
        }

        if (localOrder.status !== "PENDING") {
            return res.status(409).json({
                error: "Order is not in a capturable state",
            });
        }

        const result = await capturePayPalOrder(orderId);

        if (result.status !== "COMPLETED") {
            return res.status(409).json({
                status: result.status,
                error: "PayPal has not confirmed completed payment",
            });
        }

        const purchaseUnits = result.purchase_units || result.purchaseUnits;
        const capture = purchaseUnits?.[0]?.payments?.captures?.[0];

        if (capture?.status !== "COMPLETED" || !capture.id) {
            return res.status(409).json({
                error: "Completed capture details were not returned",
            });
        }

        await prisma.paymentOrder.update({
            where: { id: localOrder.id },
            data: {
                status: "COMPLETED",
                captureId: capture.id,
            },
        });

        res.json({
            localOrderId: localOrder.id,
            paypalOrderId: orderId,
            captureId: capture.id,
            status: "COMPLETED",
        });
    } catch (error) {
        console.error("Capture failed:", error.message);
        res.status(500).json({ error: "Unable to capture payment" });
    }
});

// AI Product Recommendations Endpoint
app.post("/api/ai/recommend", async (req, res) => {
    try {
        const message = req.body?.message;

        if (typeof message !== "string" || !message.trim()) {
            return res.status(400).json({
                error: "Please enter a shopping request.",
            });
        }

        if (message.length > 1000) {
            return res.status(400).json({
                error: "Please keep your request under 1000 characters.",
            });
        }

        if (!process.env.GROQ_API_KEY) {
            return res.status(503).json({
                error: "GROQ_API_KEY is not configured in backend/.env",
            });
        }

        const catalog = products.map((product) => ({
            id: product.id,
            name: product.name,
            category: product.category,
            price: Number(product.price),
            description: product.description ?? "",
        }));

        const completion = await groq.chat.completions.create({
            model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
            messages: [
                {
                    role: "system",
                    content: `
You are the AI shopping assistant for Commerce Lead AI.

Help customers choose products from the provided catalog.
Only recommend products whose IDs exist in the catalog.
Never invent products, IDs, prices, discounts, stock, or features.
Use the catalog prices exactly.
Respect the customer's budget when possible.
If nothing fits, explain that politely.

BUNDLE DETECTION:
If the shopper's request contains words like "bundle", "combo", "setup", "complete kit", "full set",
"multiple items", or asks for several things within a budget, treat it as a bundle request.
For bundle requests, recommend 2-4 complementary products that work well together and collectively
fit within any mentioned budget.

Return only valid JSON in this format:
{
  "message": "A brief, helpful response",
  "recommendations": ["product-id-1", "product-id-2"],
  "isBundle": false
}

Set "isBundle" to true only for bundle/combo/setup requests; false otherwise.
The recommendations field must contain only catalog product IDs.
Recommend at most 4 products for bundles, at most 3 for regular requests.

Catalog:
${JSON.stringify(catalog, null, 2)}
                    `,
                },
                {
                    role: "user",
                    content: message.trim(),
                },
            ],
            temperature: 0.3,
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0]?.message?.content;

        if (!content) {
            throw new Error("The AI returned an empty response.");
        }

        let cleanContent = content.trim();
        if (cleanContent.startsWith("```")) {
            cleanContent = cleanContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
        }

        const parsed = JSON.parse(cleanContent);

        // Detect bundle intent from the AI flag OR from the raw message keywords
        const bundleKeywords = /\b(bundle|combo|setup|complete kit|full set|multiple items)\b/i;
        const isBundle = parsed.isBundle === true || bundleKeywords.test(message);

        // Extract budget from the shopper's message
        // Supports: "under $60", "up to $70", "budget of $40", "$50 budget"
        const budgetMatch =
            message.match(/(?:under|up to|budget of|max|within)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i) ||
            message.match(/\$(\d+(?:\.\d{1,2})?)\s*(?:budget|limit|max)?/i);
        const budget = budgetMatch ? parseFloat(budgetMatch[1]) : null;

        const maxItems = isBundle ? 4 : 3;
        const requestedIds = Array.isArray(parsed.recommendations)
            ? parsed.recommendations.slice(0, maxItems)
            : [];

        // Resolve IDs against the trusted server-side catalog
        let recommendedProducts = requestedIds
            .map((id) => products.find((product) => product.id === id))
            .filter(Boolean)
            .map((product) => ({
                ...product,
                price: Number(product.price),
            }));

        // For bundle requests with a known budget, trim products until total fits
        let bundleTotal = null;
        if (isBundle && recommendedProducts.length > 0) {
            if (budget !== null) {
                // Greedily keep products within budget (cheapest first to maximise item count)
                const sorted = [...recommendedProducts].sort((a, b) => a.price - b.price);
                let running = 0;
                const kept = [];
                for (const p of sorted) {
                    if (running + p.price <= budget) {
                        kept.push(p);
                        running += p.price;
                    }
                }
                // Preserve original AI-suggested order for kept items
                recommendedProducts = recommendedProducts.filter((p) =>
                    kept.some((k) => k.id === p.id)
                );
            }
            bundleTotal = recommendedProducts.reduce((sum, p) => sum + p.price, 0);
        }

        return res.json({
            message:
                typeof parsed.message === "string"
                    ? parsed.message
                    : "Here are a few products you might like.",
            recommendations: recommendedProducts,
            isBundle,
            ...(bundleTotal !== null && { bundleTotal: parseFloat(bundleTotal.toFixed(2)) }),
            ...(budget !== null && { budget }),
        });
    } catch (error) {
        console.error("AI recommendation error:", error.message);

        return res.status(500).json({
            error: "The AI assistant couldn't respond right now. Please try again.",
        });
    }
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`Commerce Lead AI API running on http://localhost:${port}`);
});