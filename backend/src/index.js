import "dotenv/config";
import express from "express";
import cors from "cors";

import prisma from "./lib/prisma.js";
import {
    createPayPalOrder,
    capturePayPalOrder,
} from "./lib/paypal.js";

const app = express();

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "Commerce Lead AI" });
});

// Create a local order and its corresponding PayPal order.
app.post("/api/orders", async (_req, res) => {
    try {
        const amount = "10.00";
        const currency = process.env.PAYPAL_CURRENCY || "USD";

        const localOrder = await prisma.paymentOrder.create({
            data: {
                amount,
                currency,
                description: "Commerce Lead AI Sandbox Demo",
                status: "PENDING",
            },
        });

        const paypalOrder = await createPayPalOrder();

        console.log(
            "PayPal order created:",
            JSON.stringify({
                id: paypalOrder.id,
                status: paypalOrder.status,
                intent: paypalOrder.intent,
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

const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`Commerce Lead AI API running on http://localhost:${port}`);
});