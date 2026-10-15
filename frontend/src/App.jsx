import { useState } from "react";
import {
  PayPalScriptProvider,
  PayPalButtons,
} from "@paypal/react-paypal-js";
import products from "./products";
import AiAssistant from "./AiAssistant";
import "./App.css";

const API_URL = "http://localhost:3000";

const formatPrice = (price) =>
  price.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

function Store() {
  const [category, setCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState([]);
  const [message, setMessage] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("idle");

  const categories = [
    "All",
    ...new Set(products.map((product) => product.category)),
  ];

  const visibleProducts = products.filter((product) => {
    const query = searchQuery.trim().toLowerCase();

    const matchesSearch =
      !query ||
      product.name.toLowerCase().includes(query) ||
      product.category.toLowerCase().includes(query) ||
      (product.description || "").toLowerCase().includes(query);

    const matchesCategory =
      category === "All" || product.category === category;

    return matchesSearch && matchesCategory;
  });

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const cartTotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  function addToCart(product) {
    setCart((currentCart) => {
      const existing = currentCart.find(
        (item) => item.id === product.id
      );

      if (existing) {
        return currentCart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...currentCart, { ...product, quantity: 1 }];
    });

    setMessage(`${product.name} added to your cart.`);
    setPaymentStatus("idle");
  }

  function changeQuantity(productId, change) {
    setCart((currentCart) =>
      currentCart
        .map((item) =>
          item.id === productId
            ? { ...item, quantity: item.quantity + change }
            : item
        )
        .filter((item) => item.quantity > 0)
    );

    setMessage("");
  }

  function removeFromCart(productId) {
    setCart((currentCart) =>
      currentCart.filter((item) => item.id !== productId)
    );
    setMessage("");
  }

  async function createOrder() {
    if (cart.length === 0) {
      setPaymentStatus("error");
      setMessage("Your cart is empty. Add a product before checkout.");
      throw new Error("Your cart is empty.");
    }

    setMessage("Creating your order...");
    setPaymentStatus("processing");

    const items = cart.map((item) => ({
      id: item.id,
      quantity: item.quantity,
    }));

    const response = await fetch(`${API_URL}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });

    const data = await response.json();

    if (!response.ok || !data.id) {
      const errorMessage = data.error || "Could not create PayPal order.";
      setPaymentStatus("error");
      setMessage(errorMessage);
      throw new Error(errorMessage);
    }

    console.log("Created cart order:", {
      orderId: data.id,
      amount: data.amount,
    });

    return data.id;
  }

  async function capturePayment(data) {
    setMessage("Verifying your payment with PayPal...");
    setPaymentStatus("processing");

    try {
      const response = await fetch(
        `${API_URL}/api/orders/${encodeURIComponent(data.orderID)}/capture`,
        { method: "POST" }
      );

      const result = await response.json();

      if (!response.ok || result.status !== "COMPLETED") {
        throw new Error(
          result.error || "PayPal has not confirmed your payment."
        );
      }

      setPaymentStatus("success");
      setMessage("Payment completed successfully!");
    } catch (error) {
      setPaymentStatus("error");
      setMessage(error.message || "Payment verification failed.");
    }
  }

  return (
    <main className="store-page">
      <header className="store-navbar">
        <a className="store-brand" href="#home">
          Commerce<span>Lead</span> AI
        </a>

        <div className="store-nav-right">
          <span className="sandbox-tag">SANDBOX MODE</span>
          <button
            className="cart-button"
            onClick={() =>
              document
                .getElementById("shopping-cart")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            🛒 Cart ({cartCount})
          </button>
        </div>
      </header>

      <section className="store-hero" id="home">
        <p className="eyebrow">SMARTER EVERYDAY SHOPPING</p>
        <h1>Find your next favorite.</h1>
        <p>
          Explore electronics, useful accessories, and lifestyle essentials.
        </p>
      </section>

      <section className="catalog-section">
        <div className="catalog-heading">
          <div>
            <p className="eyebrow">THE COLLECTION</p>
            <h2>Shop products</h2>
          </div>
          <span>{visibleProducts.length} products</span>
        </div>

        <div className="category-filters">
          {categories.map((item) => (
            <button
              key={item}
              className={`category-button ${
                category === item ? "active" : ""
              }`}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="product-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder="Search products, categories..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-label="Search products"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              Clear
            </button>
          )}
        </div>

        {visibleProducts.length === 0 ? (
          <div className="empty-search">
            <p>No products found matching &ldquo;{searchQuery}&rdquo;</p>
            <button
              type="button"
              className="clear-filters-btn"
              onClick={() => {
                setSearchQuery("");
                setCategory("All");
              }}
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="product-grid">
          {visibleProducts.map((product) => (
            <article className="product-card" key={product.id}>
              <div className="product-art" aria-hidden="true">
                {product.emoji}
              </div>

              <div className="product-info">
                <span className="product-category">
                  {product.category}
                </span>
                <h3>{product.name}</h3>
                <p>{product.description}</p>

                <div className="product-card-bottom">
                  <strong>{formatPrice(product.price)}</strong>
                  <button onClick={() => addToCart(product)}>
                    Add to Cart +
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
        )}
      </section>

      <section className="cart-section" id="shopping-cart">
        <div className="cart-panel">
          <p className="eyebrow">YOUR SELECTION</p>
          <h2>Shopping cart ({cartCount})</h2>

          {cart.length === 0 ? (
            <div className="empty-cart">
              <span>🛒</span>
              <h3>Your cart is empty</h3>
              <p>Add a few products to get started.</p>
            </div>
          ) : (
            <>
              <div className="cart-items">
                {cart.map((item) => (
                  <article className="cart-item" key={item.id}>
                    <div className="cart-item-emoji">
                      {item.emoji}
                    </div>

                    <div className="cart-item-details">
                      <h3>{item.name}</h3>
                      <p>{formatPrice(item.price)} each</p>

                      <div className="quantity-controls">
                        <button
                          aria-label={`Decrease ${item.name} quantity`}
                          onClick={() => changeQuantity(item.id, -1)}
                        >
                          −
                        </button>

                        <span>{item.quantity}</span>

                        <button
                          aria-label={`Increase ${item.name} quantity`}
                          onClick={() => changeQuantity(item.id, 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="cart-item-end">
                      <strong>
                        {formatPrice(item.price * item.quantity)}
                      </strong>
                      <button
                        className="remove-button"
                        onClick={() => removeFromCart(item.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="cart-summary">
                <span>Subtotal ({cartCount} items)</span>
                <strong>{formatPrice(cartTotal)}</strong>
              </div>
              <p className="cart-note">
                Shipping and taxes are not included in this demo.
              </p>
            </>
          )}

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
      </section>

      <section className="checkout-section" id="checkout">
        <div className="checkout-card">
          <p className="eyebrow">ORDER CHECKOUT</p>
          <h2>Pay securely with PayPal</h2>
          <p className="checkout-description">
            Review your cart total below. PayPal will use the amount calculated
            by our backend.
          </p>

          <div className="fixed-total">
            <span>Items ({cartCount})</span>
            <strong>{formatPrice(cartTotal)}</strong>
          </div>

          {cart.length === 0 ? (
            <p>Add products to your cart to enable checkout.</p>
          ) : (
            <PayPalButtons
              key={cart.map((item) => `${item.id}:${item.quantity}`).join("|")}
              style={{
                layout: "vertical",
                shape: "rect",
                label: "paypal",
                tagline: false,
              }}
              createOrder={createOrder}
              onApprove={capturePayment}
              onCancel={() => {
                setPaymentStatus("cancelled");
                setMessage("Checkout cancelled. No payment was completed.");
              }}
              onError={(error) => {
                console.error("PayPal checkout error:", error);
                setPaymentStatus("error");
                setMessage("Checkout encountered an error. Please try again.");
              }}
            />
          )}

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
      </section>

      <footer className="store-footer">
        Commerce Lead AI · Smart shopping, powered by PayPal Sandbox
      </footer>

      <AiAssistant products={products} addToCart={addToCart} />
    </main>
  );
}

export default function App() {
  const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;

  if (!clientId) {
    return (
      <main className="store-page">
        Missing Sandbox Client ID in frontend/.env.
      </main>
    );
  }

  return (
    <PayPalScriptProvider
      options={{
        clientId,
        currency: "USD",
        intent: "capture",
      }}
    >
      <Store />
    </PayPalScriptProvider>
  );
}
