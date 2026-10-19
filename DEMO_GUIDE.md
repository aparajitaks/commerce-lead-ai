# Commerce Lead AI — Judge Demo Guide & Presentation Script

This guide outlines the end-to-end demo flow for judges, the 2-minute pitch script, and the technical verification checklist.

---

## 🎯 2-Minute Judge Pitch

> **"Hello judges! Today, shopping online is fragmented:** customers spend hours searching for complementary products across dozens of tabs, guessing which items go well together and whether they will stay within budget.
>
> **Commerce Lead AI transforms e-commerce from passive catalog browsing into an active, consultative shopping experience.** Powered by Groq AI and integrated directly with PayPal, our assistant understands customer intent, enforces strict budget limits, explains *why* each item was chosen, and enables one-click bundle purchasing directly into a secure checkout flow.
>
> Behind the scenes, the architecture is rock-solid:
> - **AI with Guardrails:** Recommendations are resolved server-side against trusted catalog data with budget enforcement and conversational turn limits.
> - **Frictionless Bundles:** Shoppers can add an entire curated set in a single atomic action.
> - **Enterprise Payments:** PayPal Sandbox checkout with double-capture safeguards, order persistence in Supabase, and real-time receipts.
>
> Let me show you how it works in under 60 seconds."

---

## 🧭 Step-by-Step Judge Demo Journey

| Step | Action | What the Judge Sees | Technical Significance |
| :--- | :--- | :--- | :--- |
| **1. Storefront** | Open `http://localhost:5173` | Clean, modern e-commerce storefront with product cards, category filters, and live cart badge. | Responsive UI, polished CSS design system with micro-animations. |
| **2. AI Launcher** | Click **💬 Need help? Ask AI** (floating bottom-right) | Chat drawer smoothly opens showing welcome greeting, capability teaser, and quick prompts. | Interactive assistant drawer with zero layout shift. |
| **3. Intent & Budget** | Click **"Work-from-home setup under $120"** chip | AI analyzes catalog, finds complementary items (Headphones, Desk Lamp, Charger), and formats response. | Groq LLM integration with JSON structure, budget extraction, and server catalog resolution. |
| **4. Explainability** | Review AI response in chat | - "Why this fits" badges explain the rationale for each product.<br>- Visual budget bar displays **$104.97 / $120.00 (87% used)** with remaining balance. | Transparent, trustworthy AI that builds customer confidence and stays within spending limits. |
| **5. One-Click Bundle** | Click **"Add Complete Bundle to Cart ($104.97)"** | Button transitions to **"✓ Bundle Added to Cart"** for 2 seconds. Cart floating badge updates to 3 items. | Single atomic state update in `App.jsx`, preventing duplicate notification storms and race conditions. |
| **6. Cart Review** | Click cart button or scroll to **Shopping Cart** | Cart lists the 3 items with quantities, subtotal ($104.97), and live PayPal Smart Buttons. | Dynamic pricing calculated from trusted products. |
| **7. PayPal Checkout** | Click **PayPal** button in cart | Secure PayPal Sandbox modal opens. Log in with buyer sandbox credentials and approve payment. | Real PayPal SDK capture pipeline (`/api/orders/create` & `/api/orders/capture`). |
| **8. Receipt & History** | Return to store after approval | - Instant digital receipt showing Order ID, items, and capture status.<br>- **Order History** section updates immediately with the Supabase-persisted record. | Supabase PostgreSQL persistence, idempotency safeguards, and recovery against network interruptions. |

---

## 🛡️ Reliability & Security Highlights for Judges

1. **Server-Side Catalog Integrity:**
   The AI cannot hallucinate non-existent items or arbitrary prices. Every recommended item ID returned by the model is validated against the active catalog on the backend.
2. **Strict Budget Enforcement:**
   If the LLM recommends items exceeding the user's budget, the backend filter trims recommendations so the bundle never exceeds the requested maximum price.
3. **Double-Capture Safeguards:**
   The payment backend verifies order status before capture, preventing duplicate charges if a user double-clicks or experiences a flaky network connection.
4. **Credential Isolation:**
   All PayPal secrets, Supabase service keys, and Groq API keys remain strictly in backend environment variables. None are exposed to client-side bundles.
5. **Automated Test Coverage:**
   The backend includes 24 automated regression tests covering budget constraints, conversation history truncation, order creation, capture, and payment recovery.

---

## 🧪 Verification Commands

To verify all systems before a live demonstration:

```bash
# 1. Run backend automated regression suite (24 passing tests)
cd backend && npm test

# 2. Verify frontend production build
cd ../frontend && npm run build
```
