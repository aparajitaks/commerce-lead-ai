import {
    Client,
    Environment,
    OrdersController,
    CheckoutPaymentIntent,
} from "@paypal/paypal-server-sdk";

const client = new Client({
    clientCredentialsAuthCredentials: {
        oAuthClientId: process.env.PAYPAL_CLIENT_ID,
        oAuthClientSecret: process.env.PAYPAL_CLIENT_SECRET,
    },
    environment: Environment.Sandbox,
});

const orders = new OrdersController(client);

export async function createPayPalOrder() {
    const response = await orders.createOrder({
        body: {
            intent: CheckoutPaymentIntent.Capture,
            purchaseUnits: [
                {
                    amount: {
                        currencyCode: "USD",
                        value: "10.00",
                    },
                    description: "Commerce Lead AI Sandbox Demo",
                },
            ],
        },
        prefer: "return=representation",
    });

    return response.result;
}

export async function capturePayPalOrder(orderId) {
    const response = await orders.captureOrder({
        id: orderId,
        prefer: "return=representation",
    });

    return response.result;
}