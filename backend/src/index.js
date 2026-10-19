import "dotenv/config";
import express from "express";
import cors from "cors";

import Groq from "groq-sdk";
import prisma from "./lib/prisma.js";
import products from "./data/products.js";
import {
    createPayPalOrder,
    capturePayPalOrder,
    getPayPalOrderDetails,
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

// List completed orders for the hackathon demo.
app.get("/api/orders", async (_req, res) => {
    try {
        const orders = await prisma.paymentOrder.findMany({
            where: { status: "COMPLETED" },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                amount: true,
                currency: true,
                description: true,
                captureId: true,
                paypalOrderId: true,
                createdAt: true,
            },
            take: 100,
        });

        return res.json({ orders });
    } catch (error) {
        console.error("Order history lookup failed:", error.message);
        return res.status(500).json({
            error: "Unable to retrieve order history.",
        });
    }
});

// Create a local order and its corresponding PayPal order.
app.post("/api/orders", async (req, res) => {
    try {
        const { items } = req.body || {};

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                error: "Invalid order request: 'items' must be a non-empty array.",
            });
        }

        const currency = process.env.PAYPAL_CURRENCY || "USD";
        let totalCents = 0;
        const itemSummaries = [];

        for (const item of items) {
            if (
                !item ||
                typeof item !== "object" ||
                Array.isArray(item) ||
                typeof item.id !== "string" ||
                !item.id.trim()
            ) {
                return res.status(400).json({
                    error: "Each item must be an object with a valid product id and quantity.",
                });
            }

            const product = products.find((p) => p.id === item.id.trim());
            if (!product) {
                return res.status(400).json({
                    error: `Unknown product ID: ${item.id}`,
                });
            }

            if (
                typeof item.quantity !== "number" ||
                !Number.isInteger(item.quantity) ||
                item.quantity < 1 ||
                item.quantity > 99
            ) {
                return res.status(400).json({
                    error: `Invalid quantity for product '${product.name}'. Quantity must be an integer between 1 and 99.`,
                });
            }

            const priceInCents = Math.round(Number(product.price) * 100);
            totalCents += priceInCents * item.quantity;
            itemSummaries.push(`${item.quantity}x ${product.name}`);
        }

        if (totalCents <= 0) {
            return res.status(400).json({
                error: "Order total must be greater than zero.",
            });
        }

        const amount = (totalCents / 100).toFixed(2);
        let description = itemSummaries.join(", ");
        if (description.length > 120) {
            description = description.slice(0, 117) + "...";
        }

        const localOrder = await prisma.paymentOrder.create({
            data: {
                amount,
                currency,
                description,
                status: "PENDING",
            },
        });

        let paypalOrder;
        try {
            paypalOrder = await createPayPalOrder(amount, description);
            if (!paypalOrder || !paypalOrder.id) {
                throw new Error("PayPal did not return an order ID");
            }
        } catch (paypalError) {
            console.error("PayPal order creation failed:", paypalError.message);
            try {
                await prisma.paymentOrder.update({
                    where: { id: localOrder.id },
                    data: { status: "FAILED" },
                });
            } catch (dbError) {
                console.error("Failed to mark local order as FAILED:", dbError.message);
            }
            return res.status(502).json({
                error: "Unable to create payment order with PayPal.",
            });
        }

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
                captureId: localOrder.captureId,
                localOrderId: localOrder.id,
                paypalOrderId: orderId,
                amount: localOrder.amount ? localOrder.amount.toString() : undefined,
                currency: localOrder.currency,
            });
        }

        if (
            localOrder.status === "PROCESSING" ||
            localOrder.status === "APPROVED"
        ) {
            let paypalOrder;

            try {
                paypalOrder = await getPayPalOrderDetails(orderId);
            } catch (error) {
                console.error("PayPal reconciliation lookup failed:", error.message);

                return res.status(502).json({
                    error: "Unable to verify payment status with PayPal. Please retry later.",
                });
            }

            if (paypalOrder.status === "COMPLETED") {
                const purchaseUnits =
                    paypalOrder.purchase_units || paypalOrder.purchaseUnits;

                const capture = purchaseUnits?.[0]?.payments?.captures?.[0];

                if (capture?.status !== "COMPLETED" || !capture.id) {
                    return res.status(409).json({
                        error: "PayPal reports a completed order, but verified capture details are unavailable.",
                    });
                }

                const capturedAmount = capture.amount?.value;
                const capturedCurrency = capture.amount?.currency_code;

                const expectedAmount = Number(localOrder.amount).toFixed(2);
                const actualAmount = Number(capturedAmount).toFixed(2);

                if (
                    capturedAmount == null ||
                    !Number.isFinite(Number(capturedAmount)) ||
                    actualAmount !== expectedAmount ||
                    capturedCurrency !== localOrder.currency
                ) {
                    console.error("Reconciliation amount/currency mismatch", {
                        localOrderId: localOrder.id,
                        captureId: capture.id,
                        expectedAmount,
                        expectedCurrency: localOrder.currency,
                        actualAmount: capturedAmount,
                        actualCurrency: capturedCurrency,
                    });

                    return res.status(409).json({
                        error: "PayPal capture does not match the expected order amount and currency.",
                    });
                }

                const reconciled = await prisma.paymentOrder.updateMany({
                    where: {
                        id: localOrder.id,
                        status: localOrder.status,
                    },
                    data: {
                        status: "COMPLETED",
                        captureId: capture.id,
                    },
                });

                if (reconciled.count !== 1) {
                    const latestOrder = await prisma.paymentOrder.findUnique({
                        where: { id: localOrder.id },
                    });

                    if (latestOrder?.status === "COMPLETED") {
                        return res.json({
                            status: "COMPLETED",
                            message: "Payment was already captured",
                            captureId: latestOrder.captureId,
                            localOrderId: latestOrder.id,
                            paypalOrderId: orderId,
                        });
                    }

                    return res.status(409).json({
                        error: "Payment status changed during reconciliation. Check the order status.",
                    });
                }

                return res.json({
                    status: "COMPLETED",
                    message: "Payment status reconciled with PayPal",
                    captureId: capture.id,
                    localOrderId: localOrder.id,
                    paypalOrderId: orderId,
                    amount: localOrder.amount ? localOrder.amount.toString() : undefined,
                    currency: localOrder.currency,
                });
            }

            if (paypalOrder.status === "VOIDED") {
                const cancelled = await prisma.paymentOrder.updateMany({
                    where: {
                        id: localOrder.id,
                        status: localOrder.status,
                    },
                    data: {
                        status: "CANCELLED",
                    },
                });

                if (cancelled.count !== 1) {
                    const latestOrder = await prisma.paymentOrder.findUnique({
                        where: { id: localOrder.id },
                    });

                    if (latestOrder?.status === "COMPLETED") {
                        return res.json({
                            status: "COMPLETED",
                            message: "Payment was already captured",
                            captureId: latestOrder.captureId,
                            localOrderId: latestOrder.id,
                            paypalOrderId: orderId,
                        });
                    }

                    return res.status(409).json({
                        error: "Order status changed during cancellation. Check the order status.",
                    });
                }

                return res.status(409).json({
                    status: "CANCELLED",
                    error: "The PayPal order has been voided.",
                });
            }

            return res.status(409).json({
                status: paypalOrder.status,
                error: "Payment is not confirmed as completed. Automatic recapture is disabled while the order is in recovery.",
            });
        }

        if (localOrder.status !== "PENDING") {
            return res.status(409).json({
                error: "Order is not in a capturable state",
            });
        }

        // Atomically allow only one request to claim this pending order.
        const claim = await prisma.paymentOrder.updateMany({
            where: {
                id: localOrder.id,
                status: "PENDING",
            },
            data: {
                status: "PROCESSING",
                captureStartedAt: new Date(),
            },
        });

        if (claim.count !== 1) {
            const latestOrder = await prisma.paymentOrder.findUnique({
                where: { id: localOrder.id },
            });

            if (latestOrder?.status === "COMPLETED") {
                return res.json({
                    status: "COMPLETED",
                    message: "Payment was already captured",
                    captureId: latestOrder.captureId,
                    localOrderId: latestOrder.id,
                    paypalOrderId: orderId,
                    amount: latestOrder.amount ? latestOrder.amount.toString() : undefined,
                    currency: latestOrder.currency,
                });
            }

            return res.status(409).json({
                error: "Another request is processing this payment. Please check its status before retrying.",
            });
        }

        const result = await capturePayPalOrder(orderId, localOrder.id);

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

        // Verify the actual captured amount and currency before marking the
        // local order as completed.
        const capturedAmount = capture.amount?.value;
        const capturedCurrency = capture.amount?.currency_code;

        const expectedAmount = Number(localOrder.amount).toFixed(2);
        const actualAmount = Number(capturedAmount).toFixed(2);

        if (
            capturedAmount == null ||
            !Number.isFinite(Number(capturedAmount)) ||
            actualAmount !== expectedAmount ||
            capturedCurrency !== localOrder.currency
        ) {
            console.error("PayPal capture amount/currency mismatch", {
                localOrderId: localOrder.id,
                expectedAmount,
                expectedCurrency: localOrder.currency,
                actualAmount: capturedAmount,
                actualCurrency: capturedCurrency,
            });

            return res.status(409).json({
                error: "Captured payment amount or currency does not match the order.",
            });
        }

        const completed = await prisma.paymentOrder.updateMany({
            where: {
                id: localOrder.id,
                status: "PROCESSING",
            },
            data: {
                status: "COMPLETED",
                captureId: capture.id,
            },
        });

        if (completed.count !== 1) {
            console.error("Capture succeeded but local completion update needs reconciliation", {
                localOrderId: localOrder.id,
                captureId: capture.id,
            });

            return res.status(409).json({
                error: "Payment may have succeeded. Please check the order status before retrying.",
            });
        }

        res.json({
            localOrderId: localOrder.id,
            paypalOrderId: orderId,
            captureId: capture.id,
            amount: localOrder.amount ? localOrder.amount.toString() : undefined,
            currency: localOrder.currency,
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
        const rawHistory = req.body?.history;

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

        // Validate and sanitise conversation history.
        // Each entry must be { role: "user"|"assistant", text: string }.
        // We cap the array at 10 turns and trim individual messages to 500 chars
        // so context never inflates the token count significantly.
        const MAX_HISTORY_TURNS = 10;
        const MAX_TURN_LENGTH = 500;

        const priorMessages = [];

        if (Array.isArray(rawHistory)) {
            const validRoles = new Set(["user", "assistant"]);
            const kept = rawHistory.slice(-MAX_HISTORY_TURNS);

            for (const entry of kept) {
                if (
                    entry &&
                    typeof entry === "object" &&
                    !Array.isArray(entry) &&
                    validRoles.has(entry.role) &&
                    typeof entry.text === "string" &&
                    entry.text.trim().length > 0
                ) {
                    priorMessages.push({
                        role: entry.role,
                        content: entry.text.trim().slice(0, MAX_TURN_LENGTH),
                    });
                }
            }
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

CONVERSATION CONTEXT:
You may receive prior conversation turns before this message. Use them to understand follow-up
questions such as "show me something cheaper", "what about for travel?", or "add the bottle to
that setup". Maintain continuity across turns.
Never carry over product prices or IDs from history — always resolve products from the current
catalog supplied above, not from prior assistant messages.

Return only valid JSON in this format:
{
  "message": "A brief, helpful response tailored to the shopper's request",
  "recommendations": [
    {
      "id": "headphones-001",
      "reason": "A concise explanation of why this product fits the shopper's stated needs"
    }
  ],
  "isBundle": false
}

Rules for recommendations:
- Each recommendation must be an object containing "id" and "reason".
- The "id" must exactly match a product ID in the catalog.
- Explain relevance using only the shopper's request and the supplied catalog.
- Never claim unsupported features, compatibility, discounts, stock, or performance.
- Keep each reason to one concise sentence.
- Recommend at most 3 products for regular requests and at most 4 for bundles.
- Return an empty recommendations array if no catalog product is relevant.
- Set "isBundle" to true only for bundle, combo, setup, or multiple-item requests.
- Never invent prices; the backend will supply all displayed prices.

Catalog:
${JSON.stringify(catalog, null, 2)}
                    `,
                },
                // Inject prior conversation turns between the system prompt
                // and the current user message so the model has full context.
                ...priorMessages,
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

        const requestedRecommendations = Array.isArray(parsed.recommendations)
            ? parsed.recommendations.slice(0, maxItems)
            : [];

        let recommendedProducts = requestedRecommendations
            .map((recommendation) => {
                // Accept legacy string IDs as well as the new object format.
                const id =
                    typeof recommendation === "string"
                        ? recommendation
                        : recommendation &&
                            typeof recommendation === "object" &&
                            !Array.isArray(recommendation)
                          ? recommendation.id
                          : null;

                if (typeof id !== "string") {
                    return null;
                }

                // Resolve every recommendation against the trusted catalog.
                const product = products.find((item) => item.id === id);

                if (!product) {
                    return null;
                }

                const rawReason =
                    recommendation &&
                    typeof recommendation === "object" &&
                    !Array.isArray(recommendation) &&
                    typeof recommendation.reason === "string"
                        ? recommendation.reason.trim()
                        : "";

                return {
                    ...product,
                    price: Number(product.price),
                    reason: rawReason
                        ? rawReason.slice(0, 180)
                        : "Suggested from our catalog for your shopping request.",
                };
            })
            .filter(Boolean);

        // ── Layer 1: individual price cap ─────────────────────────────────────
        // When a budget is stated, remove any product whose price alone exceeds
        // it. This applies to both regular and bundle requests, and runs before
        // the bundle total-cap so the greedy pass only sees affordable items.
        if (budget !== null) {
            recommendedProducts = recommendedProducts.filter(
                (p) => p.price <= budget
            );
        }

        // ── Layer 2: bundle total cap ──────────────────────────────────────────
        // For bundle requests with a known budget, greedily trim products until
        // the running total fits within the budget (cheapest first to maximise
        // the number of items kept). The original AI-suggested order is restored
        // for the final result.
        let bundleTotal = null;
        if (isBundle && recommendedProducts.length > 0) {
            if (budget !== null) {
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

        // ── Layer 3: empty-result message ──────────────────────────────────────
        // When every candidate was removed by the budget filter, replace the
        // AI-generated message with a clear, honest explanation so the frontend
        // always has useful text to display rather than an empty list with a
        // misleading success message.
        let responseMessage =
            typeof parsed.message === "string"
                ? parsed.message
                : "Here are a few products you might like.";

        if (recommendedProducts.length === 0 && budget !== null) {
            responseMessage = `Sorry, none of our current products fit within your $${budget.toFixed(2)} budget. Try raising your budget or browsing the full catalog.`;
        } else if (recommendedProducts.length === 0) {
            responseMessage = "I couldn't find a matching product in our catalog for that request. Try a different description or browse all products.";
        }

        return res.json({
            message: responseMessage,
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

/**
 * Return a consistent JSON response for unknown routes.
 * Register after all API routes.
 */
app.use((req, res) => {
    return res.status(404).json({
        error: "Route not found.",
        path: req.originalUrl,
    });
});

/**
 * Handle malformed JSON and unexpected Express errors.
 * Must have four parameters to be recognized as error middleware.
 */
app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        return res.status(400).json({
            error: "Invalid JSON request body.",
        });
    }

    console.error("Unhandled API error:", err.message);

    return res.status(500).json({
        error: "Internal server error.",
    });
});

import { fileURLToPath } from "node:url";

const isMainModule =
    process.argv[1] &&
    fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`));

if (isMainModule) {
    const port = process.env.PORT || 3000;

    app.listen(port, () => {
        console.log(`Commerce Lead AI API running on http://localhost:${port}`);
    });
}

export { app };