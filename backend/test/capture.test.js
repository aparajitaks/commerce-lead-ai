import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

test("payment capture route recovery checks", async (t) => {
    const state = {
        order: null,
        paypalLookupError: null,
        paypalOrder: null,
        captureCalls: 0,
        updateManyCalls: [],
    };

    const prisma = {
        paymentOrder: {
            findUnique: async () => state.order,
            updateMany: async (args) => {
                state.updateManyCalls.push(args);
                return { count: 1 };
            },
        },
    };

    const paypal = {
        createPayPalOrder: async () => {
            throw new Error("Unexpected PayPal order creation in test");
        },
        capturePayPalOrder: async () => {
            state.captureCalls += 1;
            throw new Error("Unexpected capture call in recovery test");
        },
        getPayPalOrderDetails: async () => {
            if (state.paypalLookupError) {
                throw state.paypalLookupError;
            }

            return state.paypalOrder;
        },
    };

    class FakeGroq {
        constructor() {
            this.chat = {
                completions: {
                    create: async () => ({
                        choices: [{ message: { content: "{}" } }],
                    }),
                },
            };
        }
    }

    process.env.GROQ_API_KEY ||= "test-key-not-used";

    mock.module("../src/lib/prisma.js", {
        defaultExport: prisma,
    });

    mock.module("../src/lib/paypal.js", {
        namedExports: paypal,
    });

    mock.module("groq-sdk", {
        defaultExport: FakeGroq,
    });

    const { app } = await import("../src/index.js");

    const server = app.listen(0);
    await once(server, "listening");

    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    t.after(async () => {
        server.closeAllConnections();
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    });

    await t.test("unknown order returns 404", async () => {
        state.order = null;
        state.captureCalls = 0;

        const response = await fetch(
            `${baseUrl}/api/orders/UNKNOWN_ORDER_XYZ/capture`,
            { method: "POST" },
        );

        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), {
            error: "Order not found",
        });
        assert.equal(state.captureCalls, 0);
    });

    await t.test("completed order returns saved capture details", async () => {
        state.order = {
            id: "local-test-1",
            paypalOrderId: "PAYPAL_TEST_1",
            status: "COMPLETED",
            captureId: "CAPTURE_TEST_1",
            amount: "54.98",
            currency: "USD",
        };
        state.captureCalls = 0;

        const response = await fetch(
            `${baseUrl}/api/orders/PAYPAL_TEST_1/capture`,
            { method: "POST" },
        );

        assert.equal(response.status, 200);

        const body = await response.json();
        assert.equal(body.status, "COMPLETED");
        assert.equal(body.captureId, "CAPTURE_TEST_1");
        assert.equal(body.localOrderId, "local-test-1");
        assert.equal(body.paypalOrderId, "PAYPAL_TEST_1");
        assert.equal(body.amount, "54.98");
        assert.equal(body.currency, "USD");
        assert.equal(state.captureCalls, 0);
    });

    await t.test("PayPal lookup failure does not initiate another capture", async () => {
        state.order = {
            id: "local-test-2",
            paypalOrderId: "PAYPAL_TEST_2",
            status: "PROCESSING",
            captureStartedAt: new Date(Date.now() - 120_000),
            amount: "49.99",
            currency: "USD",
        };
        state.paypalLookupError = new Error("Simulated PayPal lookup failure");
        state.captureCalls = 0;

        const response = await fetch(
            `${baseUrl}/api/orders/PAYPAL_TEST_2/capture`,
            { method: "POST" },
        );

        assert.equal(response.status, 502);
        assert.equal(state.captureCalls, 0);
    });
});
