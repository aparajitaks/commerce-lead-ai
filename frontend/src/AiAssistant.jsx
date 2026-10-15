import { useState, useRef, useEffect } from "react";

const API_URL = "http://localhost:3000";

const SUGGESTED_PROMPTS = [
  "Desk setup under $60",
  "Travel essentials",
  "Audio gear for focus",
  "Gifts under $40",
];

export default function AiAssistant({ products, addToCart }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      sender: "assistant",
      text: "👋 Hi! I'm your Commerce AI Shopping Assistant. Tell me what you're looking for, your budget, or who you're shopping for!",
      recommendations: [],
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  async function handleSend(userText) {
    const query = (userText || input).trim();
    if (!query || isTyping) return;

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
        body: JSON.stringify({ message: query }),
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
                              {m.budget !== null && (
                                <span className="ai-bundle-budget"> / ${m.budget.toFixed(2)} budget</span>
                              )}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="ai-bundle-add-btn"
                            onClick={() => m.recommendations.forEach((item) => addToCart(item))}
                          >
                            🛒 Add Entire Bundle to Cart
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
              placeholder="Ask anything (e.g. 'Desk setup under $60')..."
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
