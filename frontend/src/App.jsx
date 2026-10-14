
import { useState } from "react";
import {
  PayPalScriptProvider,
  PayPalButtons,
} from "@paypal/react-paypal-js";
import "./App.css";

const API_URL = "http://localhost:3000";

function Checkout() {
  const [message, setMessage] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("idle");

  async function createOrder() {
    console.log("STEP 1: Creating PayPal order...");

    setMessage("");
    setPaymentStatus("processing");

    try {
      const response = await fetch(`${API_URL}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      console.log("STEP 1: Create order response:", {
        status: response.status,
        data,
      });

      if (!response.ok || !data.id) {
        throw new Error(
          data.error || "Could not create PayPal order."
        );
      }

      console.log("STEP 1 SUCCESS: PayPal order ID:", data.id);

      return data.id;
    } catch (error) {
      console.error("STEP 1 FAILED: Create order error:", error);

      setPaymentStatus("error");
      setMessage(error.message || "Could not create the order.");

      throw error;
    }
  }

  async function capturePayment(data) {
    console.log("STEP 2: PAYPAL ON APPROVE TRIGGERED:", data);

    setMessage("Verifying your payment with PayPal...");
    setPaymentStatus("processing");

    try {
      const captureUrl =
        `${API_URL}/api/orders/` +
        `${encodeURIComponent(data.orderID)}/capture`;

      console.log("STEP 3: Sending capture request:", captureUrl);

      const response = await fetch(captureUrl, {
        method: "POST",
      });

      const result = await response.json();

      console.log("STEP 3: Capture response:", {
        status: response.status,
        data: result,
      });

      if (!response.ok || result.status !== "COMPLETED") {
        throw new Error(
          result.error || "PayPal has not confirmed your payment."
        );
      }

      setPaymentStatus("success");
      setMessage("Payment completed successfully!");

      console.log("PAYMENT SUCCESSFULLY CAPTURED");
    } catch (error) {
      console.error("STEP 3 FAILED: Capture error:", error);

      setPaymentStatus("error");
      setMessage(
        error.message || "Payment verification failed."
      );
    }
  }

  return (
    <main className="page">
      <nav className="navbar">
        <span className="brand">
          Commerce<span>Lead</span> AI
        </span>

        <span className="sandbox-tag">SANDBOX MODE</span>
      </nav>

      <section className="checkout-card">
        <div className="product-icon">✦</div>

        <p className="eyebrow">COMMERCE LEAD AI</p>

        <h1>Checkout</h1>

        <p className="subtitle">
          Test your commerce payment experience securely.
        </p>

        <div className="product-row">
          <div>
            <h2>Commerce AI Demo</h2>
            <p>Sandbox test purchase</p>
          </div>

          <strong>$10.00 USD</strong>
        </div>

        <div className="total-row">
          <span>Total</span>
          <strong>$10.00 USD</strong>
        </div>

        <div className="payment-section">
          <h3>Pay securely with PayPal</h3>

          <PayPalButtons
            style={{
              layout: "vertical",
              shape: "rect",
              label: "paypal",
              tagline: false,
            }}
            createOrder={createOrder}
            onApprove={capturePayment}
            onCancel={() => {
              console.log("PAYPAL CHECKOUT CANCELLED");

              setPaymentStatus("cancelled");
              setMessage(
                "Checkout cancelled. No payment was completed."
              );
            }}
            onError={(error) => {
              console.error(
                "PAYPAL CHECKOUT ERROR:",
                error
              );

              setPaymentStatus("error");
              setMessage(
                "Checkout encountered an error. Check the browser console."
              );
            }}
          />

          {message && (
            <div
              className={`status-message ${paymentStatus}`}
              role="status"
              aria-live="polite"
            >
              {message}
            </div>
          )}
        </div>

        <p className="sandbox-note">
          This is a Sandbox demo. Use your PayPal Sandbox
          buyer account, not your real PayPal account.
        </p>
      </section>

      <footer>
        Commerce Lead AI · Hackathon payment demo
      </footer>
    </main>
  );
}

export default function App() {
  const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
  const currency = import.meta.env.VITE_PAYPAL_CURRENCY || "USD";

  if (!clientId) {
    return (
      <main className="page">
        Missing Sandbox Client ID in frontend/.env.
      </main>
    );
  }

  return (
    <PayPalScriptProvider
      options={{
        clientId,
        currency,
        intent: "capture",
      }}
    >
      <Checkout />
    </PayPalScriptProvider>
  );
}
