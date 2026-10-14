const PAYPAL_API = "https://api-m.sandbox.paypal.com";

async function getAccessToken() {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
        method: "POST",
        headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`PayPal auth failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    return data.access_token;
}

export async function createPayPalOrder() {
    const currency = process.env.PAYPAL_CURRENCY || "USD";
    const amount = "10.00";

    const token = await getAccessToken();

    const res = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
        },
        body: JSON.stringify({
            intent: "CAPTURE",
            purchase_units: [
                {
                    amount: {
                        currency_code: currency,
                        value: amount,
                    },
                    description: "Commerce Lead AI Sandbox Demo",
                },
            ],
        }),
    });

    const data = await res.json();

    if (!res.ok) {
        console.error("PayPal createOrder error:", JSON.stringify(data, null, 2));
        const detail = data?.details?.[0];
        throw new Error(
            detail
                ? `${detail.issue}: ${detail.description}`
                : data?.message || `PayPal error ${res.status}`
        );
    }

    console.log("PayPal order created:", JSON.stringify({
        id: data.id,
        status: data.status,
        currency,
        amount,
    }, null, 2));

    return data;
}

export async function capturePayPalOrder(orderId) {
    const token = await getAccessToken();

    const res = await fetch(
        `${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                Prefer: "return=representation",
            },
        }
    );

    const data = await res.json();

    if (!res.ok) {
        console.error("PayPal captureOrder error:", JSON.stringify(data, null, 2));
        const detail = data?.details?.[0];
        throw new Error(
            detail
                ? `${detail.issue}: ${detail.description}`
                : data?.message || `PayPal capture error ${res.status}`
        );
    }

    return data;
}