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
        updateManyCount: 1,
        latestOrder: null,
    };

    const prisma = {
        paymentOrder: {
            findUnique: async (args) => {
                if (args?.where?.id && state.latestOrder) {
                    return state.latestOrder;
                }

                return state.order;
            },
            updateMany: async (args) => {
                state.updateManyCalls.push(args);
                return { count: state.updateManyCount };
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

    await t.test("PROCESSING order reconciles a matching completed PayPal capture", async () => {
        state.order = {
            id: "local-reconcile-1",
            paypalOrderId: "PAYPAL_RECONCILE_1",
            status: "PROCESSING",
            amount: "49.99",
            currency: "USD",
        };
        state.paypalLookupError = null;
        state.paypalOrder = {
            status: "COMPLETED",
            purchase_units: [{
                payments: {
                    captures: [{
                        id: "CAPTURE_RECONCILE_1",
                        status: "COMPLETED",
                        amount: { value: "49.99", currency_code: "USD" },
                    }],
                },
            }],
        };
        state.captureCalls = 0;
        state.updateManyCalls = [];
        state.updateManyCount = 1;

        const response = await fetch(
            `${baseUrl}/api/orders/PAYPAL_RECONCILE_1/capture`,
            { method: "POST" },
        );

        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.status, "COMPLETED");
        assert.equal(body.captureId, "CAPTURE_RECONCILE_1");
        assert.equal(body.amount, "49.99");
        assert.equal(body.currency, "USD");
        assert.equal(state.captureCalls, 0);
        assert.equal(state.updateManyCalls.length, 1);
        assert.equal(state.updateManyCalls[0].data.status, "COMPLETED");
    });

    await t.test("PROCESSING order is cancelled when PayPal reports VOIDED", async () => {
        state.order = {
            id: "local-voided-1",
            paypalOrderId: "PAYPAL_VOIDED_1",
            status: "PROCESSING",
            amount: "49.99",
            currency: "USD",
        };
        state.paypalLookupError = null;
        state.paypalOrder = { status: "VOIDED" };
        state.captureCalls = 0;
        state.updateManyCalls = [];
        state.updateManyCount = 1;

        const response = await fetch(
            `${baseUrl}/api/orders/PAYPAL_VOIDED_1/capture`,
            { method: "POST" },
        );

        assert.equal(response.status, 409);
        const body = await response.json();
        assert.equal(body.status, "CANCELLED");
        assert.equal(state.captureCalls, 0);
        assert.equal(state.updateManyCalls.length, 1);
        assert.equal(state.updateManyCalls[0].data.status, "CANCELLED");
    });

    await t.test("reconciliation rejects a capture with mismatched amount", async () => {
        state.order = {
            id: "local-mismatch-1",
            paypalOrderId: "PAYPAL_MISMATCH_1",
            status: "PROCESSING",
            amount: "49.99",
            currency: "USD",
        };
        state.paypalLookupError = null;
        state.paypalOrder = {
            status: "COMPLETED",
            purchase_units: [{
                payments: {
                    captures: [{
                        id: "CAPTURE_MISMATCH_1",
                        status: "COMPLETED",
                        amount: { value: "39.99", currency_code: "USD" },
                    }],
                },
            }],
        };
        state.captureCalls = 0;
        state.updateManyCalls = [];

        const response = await fetch(
            `${baseUrl}/api/orders/PAYPAL_MISMATCH_1/capture`,
            { method: "POST" },
        );

        assert.equal(response.status, 409);
        assert.match(
            (await response.json()).error,
            /does not match the expected order amount and currency/,
        );
        assert.equal(state.updateManyCalls.length, 0);
        assert.equal(state.captureCalls, 0);
    });

    await t.test("concurrent reconciliation change does not falsely report success", async () => {
        state.order = {
            id: "local-race-1",
            paypalOrderId: "PAYPAL_RACE_1",
            status: "PROCESSING",
            amount: "49.99",
            currency: "USD",
        };
        state.latestOrder = {
            id: "local-race-1",
            paypalOrderId: "PAYPAL_RACE_1",
            status: "FAILED",
            amount: "49.99",
            currency: "USD",
        };
        state.paypalLookupError = null;
        state.paypalOrder = {
            status: "COMPLETED",
            purchase_units: [{
                payments: {
                    captures: [{
                        id: "CAPTURE_RACE_1",
                        status: "COMPLETED",
                        amount: { value: "49.99", currency_code: "USD" },
                    }],
                },
            }],
        };
        state.captureCalls = 0;
        state.updateManyCalls = [];
        state.updateManyCount = 0;

        const response = await fetch(
            `${baseUrl}/api/orders/PAYPAL_RACE_1/capture`,
            { method: "POST" },
        );

        assert.equal(response.status, 409);
        assert.match(
            (await response.json()).error,
            /status changed during reconciliation/,
        );
        assert.equal(state.captureCalls, 0);

        state.latestOrder = null;
    });
});
