import { useState, useRef, useEffect } from "react";
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
  const captureInFlight = useRef(false);

  const [receipt, setReceipt] = useState(null);
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);

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

  function addBundleToCart(items) {
    if (!Array.isArray(items) || items.length === 0) {
      setMessage("This bundle has no products to add.");
      return;
    }

    // Consolidate duplicate product IDs within the bundle.
    const bundleItems = new Map();

    for (const product of items) {
      if (!product?.id) continue;

      const existing = bundleItems.get(product.id);

      if (existing) {
        existing.quantity += 1;
      } else {
        bundleItems.set(product.id, {
          ...product,
          quantity: 1,
        });
      }
    }

    const additions = [...bundleItems.values()];

    if (additions.length === 0) {
      setMessage("No valid products were found in this bundle.");
      return;
    }

    // Merge the bundle into the current cart in one state update.
    setCart((currentCart) => {
      const updatedCart = currentCart.map((item) => ({ ...item }));

      for (const product of additions) {
        const existing = updatedCart.find(
          (item) => item.id === product.id
        );

        if (existing) {
          existing.quantity += product.quantity;
        } else {
          updatedCart.push(product);
        }
      }

      return updatedCart;
    });

    const itemCount = additions.reduce(
      (total, item) => total + item.quantity,
      0
    );

    setMessage(
      `Added complete ${itemCount}-item bundle to your cart.`
    );
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
    // Guard against duplicate invocations from the PayPal SDK.
    if (captureInFlight.current) return;
    captureInFlight.current = true;

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

      // Save verified receipt details before clearing the cart.
      setReceipt({
        amount: Number(result.amount) || cartTotal,
        currency: result.currency || "USD",
        items: cart.map((item) => ({ ...item })),
        localOrderId: result.localOrderId,
        paypalOrderId: result.paypalOrderId || data.orderID,
        captureId: result.captureId,
      });

      setCart([]);
      setPaymentStatus("success");
      setMessage("Payment completed successfully!");
    } catch (error) {
      setPaymentStatus("error");
      setMessage(error.message || "Payment verification failed.");
    } finally {
      captureInFlight.current = false;
    }
  }

  useEffect(() => {
    if (!showOrderHistory) return;

    let cancelled = false;

    async function loadOrders() {
      setOrdersLoading(true);
      setOrdersError("");

      try {
        const response = await fetch(`${API_URL}/api/orders`);
        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || "Unable to load your order history."
          );
        }

        if (!Array.isArray(result.orders)) {
          throw new Error("The server returned an unexpected response.");
        }

        if (!cancelled) {
          setOrders(result.orders);
        }
      } catch (error) {
        if (!cancelled) {
          setOrdersError(
            error.message || "Unable to load your order history."
          );
        }
      } finally {
        if (!cancelled) {
          setOrdersLoading(false);
        }
      }
    }

    loadOrders();

    return () => {
      cancelled = true;
    };
  }, [showOrderHistory, ordersRefreshKey]);

  return (
    <main className="store-page">
      <header className="store-navbar">
        <a className="store-brand" href="#home">
          Commerce<span>Lead</span> AI
        </a>

        <div className="store-nav-right">
          <span className="sandbox-tag">SANDBOX MODE</span>
          <button
            className="history-button"
            onClick={() => {
              setShowOrderHistory((visible) => !visible);
              setReceipt(null);
            }}
          >
            {showOrderHistory ? "Hide Orders" : "Order History"}
          </button>
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

      {receipt && (
        <section className="receipt-card" aria-labelledby="receipt-title">
          <p className="eyebrow">PAYMENT CONFIRMED</p>
          <h2 id="receipt-title">Thank you for your order!</h2>
          <p>Your PayPal Sandbox payment was completed successfully.</p>

          <div className="receipt-row">
            <span>Order total</span>
            <strong>
              {formatPrice(receipt.amount)}
            </strong>
          </div>

          <div className="receipt-row">
            <span>Payment currency</span>
            <strong>{receipt.currency}</strong>
          </div>

          <h3>Items purchased</h3>
          <ul>
            {receipt.items.map((item) => (
              <li key={item.id}>
                {item.name} × {item.quantity}
              </li>
            ))}
          </ul>

          {receipt.localOrderId && (
            <p className="receipt-reference">
              Commerce Lead AI order ID: {receipt.localOrderId}
            </p>
          )}

          <p className="receipt-reference">
            PayPal order ID: {receipt.paypalOrderId}
          </p>

          {receipt.captureId && (
            <p className="receipt-reference">
              PayPal capture ID: {receipt.captureId}
            </p>
          )}

          <button
            className="history-button"
            onClick={() => {
              setReceipt(null);
              setShowOrderHistory(true);
            }}
          >
            View Order History
          </button>
        </section>
      )}

      {showOrderHistory && (
        <section className="order-history" id="order-history">
          <div className="history-heading">
            <div>
              <p className="eyebrow">STORE TEST TRANSACTIONS</p>
              <h2>Order History</h2>
              <p>
                Sandbox demo: displays completed store test transactions, which may include purchases from other demo sessions. Production order history must be restricted to the authenticated customer.
              </p>
            </div>

            <button
              className="history-button"
              onClick={() => setOrdersRefreshKey((key) => key + 1)}
              disabled={ordersLoading}
            >
              {ordersLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {ordersLoading && (
            <p role="status" aria-live="polite">Loading completed orders...</p>
          )}

          {!ordersLoading && ordersError && (
            <div role="alert" className="history-error">
              <p>{ordersError}</p>
              <button
                className="history-button"
                onClick={() => setOrdersRefreshKey((key) => key + 1)}
              >
                Try again
              </button>
            </div>
          )}

          {!ordersLoading && !ordersError && orders.length === 0 && (
            <div className="history-empty">
              <h3>No completed orders yet</h3>
              <p>Your successful purchases will appear here.</p>
            </div>
          )}

          {!ordersLoading && !ordersError && orders.length > 0 && (
            <div className="order-list">
              {orders.map((order) => (
                <article className="order-card" key={order.id}>
                  <div className="order-card-heading">
                    <div>
                      <h3>Order #{order.id.slice(-8)}</h3>
                      <p className="order-date">
                        {new Date(order.createdAt).toLocaleString()}
                      </p>
                    </div>

                    <strong className="order-amount">
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: order.currency || "USD",
                      }).format(Number(order.amount))}
                    </strong>
                  </div>

                  <p className="order-description">
                    {order.description || "Commerce Lead AI purchase"}
                  </p>

                  {order.captureId && (
                    <p className="receipt-reference">
                      PayPal capture ID: {order.captureId}
                    </p>
                  )}

                  <p className="receipt-reference">
                    PayPal order ID: {order.paypalOrderId || "Unavailable"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <footer className="store-footer">
        Commerce Lead AI · Smart shopping, powered by PayPal Sandbox
      </footer>

      <AiAssistant
        products={products}
        addToCart={addToCart}
        addBundleToCart={addBundleToCart}
      />
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
