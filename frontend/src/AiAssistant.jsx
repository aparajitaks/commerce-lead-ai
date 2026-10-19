import { useState, useRef, useEffect } from "react";

const API_URL = "http://localhost:3000";

const SUGGESTED_PROMPTS = [
  "Work-from-home setup under $120",
  "Desk setup under $60",
  "Audio gear for focus",
  "Gifts under $40",
];


export default function AiAssistant({
  products,
  addToCart,
  addBundleToCart,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      sender: "assistant",
      text: "👋 Hi! I'm Commerce AI — your smart shopping assistant powered by Groq.\n\nTell me what you need, your budget, or who you're shopping for, and I'll recommend the right products, explain why each one fits, and help you build the perfect bundle.",
      recommendations: [],
    },
  ]);

  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [addedBundleIds, setAddedBundleIds] = useState([]);
  const messagesEndRef = useRef(null);

  function handleAddBundle(message) {
    if (addedBundleIds.includes(message.id)) return;

    addBundleToCart(message.recommendations);

    setAddedBundleIds((current) =>
      current.includes(message.id) ? current : [...current, message.id]
    );

    setTimeout(() => {
      setAddedBundleIds((current) =>
        current.filter((id) => id !== message.id)
      );
    }, 2000);
  }

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  async function handleSend(userText) {
    const query = (userText || input).trim();
    if (!query || isTyping) return;

    // Snapshot the current history BEFORE adding the new user message so we
    // don't include the message we're about to send in the context array.
    // We keep only the last 10 turns (5 pairs) to stay within token limits,
    // and send only role + text — never product objects or prices.
    const MAX_HISTORY_TURNS = 10;
    const history = messages
      .filter((m) => m.sender === "user" || m.sender === "assistant")
      .slice(-MAX_HISTORY_TURNS)
      .map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        text: m.text,
      }));

    const userMessage = {
      id: "u-" + Date.now(),
      sender: "user",
      text: query,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    try {
      const response = await fetch(`${API_URL}/api/ai/recommend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: query, history }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "AI request failed");
      }

      setMessages((prev) => [
        ...prev,
        {
          id: "a-" + Date.now(),
          sender: "assistant",
          text: data.message || "Here are a few products you might like.",
          recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
          isBundle: data.isBundle === true,
          bundleTotal: typeof data.bundleTotal === "number" ? data.bundleTotal : null,
          budget: typeof data.budget === "number" ? data.budget : null,
        },
      ]);
    } catch (error) {
      console.error("AI Assistant request error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: "a-" + Date.now(),
          sender: "assistant",
          text: "I couldn't reach the AI assistant. Please try again.",
          recommendations: [],
          isBundle: false,
          bundleTotal: null,
          budget: null,
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  return (
    <>
      {/* Floating Launcher Button */}
      <button
        className="ai-chat-launcher"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Open AI Shopping Assistant"
      >
        <span className="ai-launcher-icon">✦</span>
        <span className="ai-launcher-text">AI Assistant</span>
      </button>

      {/* Assistant Modal / Drawer */}
      {isOpen && (
        <div className="ai-chat-drawer" role="dialog" aria-label="AI Shopping Assistant">
          <div className="ai-chat-header">
            <div className="ai-chat-header-title">
              <span className="ai-badge-icon">✦</span>
              <div>
                <h3>Commerce AI</h3>
                <span className="ai-status">Online · Powered by Groq</span>
              </div>
            </div>
            <button
              className="ai-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Close assistant"
            >
              ✕
            </button>
          </div>

          <div className="ai-chat-body">
            {messages.map((m) => (
              <div key={m.id} className={`ai-message ${m.sender}`}>
                <div className="ai-message-bubble">
                  <p>{m.text}</p>

                  {m.recommendations && m.recommendations.length > 0 && (
                    <div className="ai-recs-grid">
                      {m.recommendations.map((item) => (
                        <div key={item.id} className="ai-rec-card">
                          <span className="ai-rec-emoji">{item.emoji || "🛍️"}</span>
                          <div className="ai-rec-info">
                            <strong>{item.name}</strong>
                            <span>${Number(item.price).toFixed(2)}</span>
                            {item.reason && (
                              <div className="ai-rec-explanation">
                                <span className="ai-rec-badge">✦ Why this fits</span>
                                <p className="ai-rec-reason">{item.reason}</p>
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            className="ai-add-btn"
                            onClick={() => addToCart(item)}
                          >
                            + Cart
                          </button>
                        </div>
                      ))}

                      {m.isBundle && m.bundleTotal !== null && m.recommendations.length > 1 && (
                        <div className="ai-bundle-summary">
                          <div className="ai-bundle-totals">
                            <span className="ai-bundle-label">Bundle Total</span>
                            <span className="ai-bundle-price">
                              ${m.bundleTotal.toFixed(2)}
                              {m.budget !== null && m.budget > 0 && (
                                <span className="ai-bundle-budget">
                                  {" "}/ ${m.budget.toFixed(2)} budget
                                </span>
                              )}
                            </span>
                          </div>

                          {m.budget !== null && m.budget > 0 && (
                            <div className="ai-budget-tracker">
                              <div className="ai-budget-labels">
                                <span>Budget used</span>
                                <strong>
                                  {Math.round((m.bundleTotal / m.budget) * 100)}%
                                </strong>
                              </div>

                              <div
                                className="ai-budget-track"
                                role="progressbar"
                                aria-label="Bundle budget used"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.min(
                                  100,
                                  Math.round((m.bundleTotal / m.budget) * 100)
                                )}
                              >
                                <div
                                  className={`ai-budget-fill ${
                                    m.bundleTotal > m.budget ? "over-budget" : ""
                                  }`}
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      (m.bundleTotal / m.budget) * 100
                                    )}%`,
                                  }}
                                />
                              </div>

                              <p
                                className={`ai-budget-remaining ${
                                  m.bundleTotal > m.budget ? "over-budget" : ""
                                }`}
                              >
                                {m.bundleTotal > m.budget
                                  ? `$${(m.bundleTotal - m.budget).toFixed(2)} over budget`
                                  : `$${(m.budget - m.bundleTotal).toFixed(2)} remaining`}
                              </p>
                            </div>
                          )}

                          <button
                            type="button"
                            className="ai-bundle-add-btn"
                            disabled={addedBundleIds.includes(m.id)}
                            onClick={() => handleAddBundle(m)}
                          >
                            {addedBundleIds.includes(m.id)
                              ? "✓ Bundle Added to Cart"
                              : "🛒 Add Entire Bundle to Cart"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            ))}

            {isTyping && (
              <div className="ai-message assistant">
                <div className="ai-message-bubble typing">
                  <span>●</span>
                  <span>●</span>
                  <span>●</span>
                </div>
              </div>
            )}
            {/* Demo capability teaser — visible only before first user message */}
            {messages.length === 1 && (
              <div className="ai-demo-teaser">
                <p className="ai-demo-teaser-label">✦ What I can do</p>
                <ul className="ai-demo-teaser-list">
                  <li>🎯 Understand your budget and filter products to fit</li>
                  <li>📦 Build multi-item bundles with explainable reasoning</li>
                  <li>💳 Guide you to PayPal checkout in one click</li>
                </ul>
                <p className="ai-demo-teaser-hint">
                  Try:{" "}
                  <em
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSend("Work-from-home setup under $120")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        handleSend("Work-from-home setup under $120");
                      }
                    }}
                  >
                    "Work-from-home setup under $120"
                  </em>
                </p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts */}
          <div className="ai-prompts-bar">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="ai-prompt-chip"
                onClick={() => handleSend(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Chat Input */}
          <form
            className="ai-chat-input-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <input
              type="text"
              placeholder="e.g. 'Work-from-home setup under $120'..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Message to AI assistant"
            />

            <button type="submit" disabled={!input.trim() || isTyping}>
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
