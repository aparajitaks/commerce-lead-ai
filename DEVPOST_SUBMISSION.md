# Devpost Submission Kit — Commerce Lead AI

This document contains ready-to-paste submission copy, the demo video recording sequence, and the final submission audit for Devpost.

---

## 📋 Devpost Submission Fields

### Project Name
**Commerce Lead AI**

### Tagline (under 120 characters)
> Intelligent, budget-aware shopping assistant that turns natural conversations into one-click bundles and PayPal checkout.

### Elevator Pitch / Summary
Commerce Lead AI bridges the gap between conversational AI and transactional commerce. Instead of navigating endless catalog categories and manually calculating prices, shoppers express what they need and how much they want to spend. The assistant recommends complementary products grounded in trusted catalog data, explains why each item fits, visualizes budget utilization, and enables one-click bundle purchasing directly into a secure PayPal Sandbox checkout with instant receipts.

---

## 📝 Main Submission Content (Markdown)

### 💡 Inspiration
Online shopping often feels tedious and fragmented. When someone searches for a "work-from-home setup under $120" or "travel essentials", they are forced to open multiple browser tabs, search across distinct categories, calculate totals in their head, and guess which products are compatible.

We built **Commerce Lead AI** to make e-commerce conversational, consultative, and reliable. We wanted an AI shopping assistant that doesn't just chat, but actively respects budgets, explains its reasoning transparently, and moves shoppers straight to checkout with one click.

---

### 🚀 What It Does

1. **Conversational Discovery with Guardrails:** Shoppers chat naturally with an AI assistant powered by Groq. The assistant extracts user intent, budget limits, and context.
2. **Server-Grounded Catalog Integrity:** The AI cannot invent fake products or prices. Every item recommendation is validated against the store's authoritative catalog on the server.
3. **Budget Tracker & Enforcement:** Shoppers see a live visual progress bar showing bundle cost, percentage of budget utilized, and remaining balance. If an item exceeds budget constraints, backend filtering safely trims it.
4. **"Why this fits" Explainability:** Transparent badges explain why each specific product was selected for the bundle.
5. **Atomic One-Click Bundles:** Customers add an entire recommended bundle to the cart with one click, complete with animated confirmation feedback.
6. **Robust PayPal Checkout:** Shoppers complete purchases using PayPal Sandbox with server-side price validation, duplicate-capture prevention, and network recovery safeguards.
7. **Instant Digital Receipts & Order History:** Completed orders are persisted in Supabase (PostgreSQL) via Prisma, rendering immediate verified digital receipts and an updated order history.

---

### 🛠️ How We Built It

- **Frontend:** React 19, Vite, and custom Vanilla CSS with responsive design, micro-animations, and zero layout shift.
- **Backend:** Node.js, Express, and structured REST endpoints.
- **AI Engine:** Groq API (`openai/gpt-oss-20b`) returning structured JSON with strict prompt guardrails and conversation turn history limits.
- **Database & ORM:** Supabase PostgreSQL with Prisma ORM for structured order management and payment tracking.
- **Payments:** PayPal Sandbox REST API and `@paypal/react-paypal-js` Smart Payment Buttons.
- **Testing:** 24 automated Node test runner regression tests validating budget boundaries, conversation history truncation, order integrity, and idempotency.

---

### ⚡ Challenges We Ran Into

- **Preventing AI Hallucinations:** LLMs can easily invent products, alter prices, or miscalculate totals. We solved this by implementing strict server-side resolution: the LLM suggests IDs and explanations, but the backend maps every item against the trusted catalog and computes the definitive pricing.
- **Budget Boundaries:** An AI might suggest items that together slightly exceed the customer's stated budget. We built algorithmic trimming in the backend to ensure recommended bundles never exceed the requested budget cap.
- **Double-Capture Safeguards:** In payment integrations, rapid double-clicks or flaky networks can cause duplicate capture calls. We implemented status verification and atomic transitions (`captureStartedAt`, `COMPLETED`) so payments cannot be double-captured.
- **Cart State Synchronization:** Adding multiple items simultaneously can trigger state thrashing. We engineered an atomic `addBundleToCart` batch handler that consolidates duplicates and applies a single state update.

---

### 🏆 Accomplishments That We're Proud Of

- **End-to-End Execution:** Seamless flow from a natural language prompt to a verified PayPal Sandbox capture and database persistence.
- **Explainable AI:** Giving customers real reasons ("Why this fits") rather than black-box recommendations.
- **Zero Hallucinated Pricing:** 100% server-validated catalog prices.
- **Solid Engineering:** 24 automated backend tests passing consistently, paired with a clean production build.
- **Security-First Architecture:** Complete isolation of API keys, PayPal secrets, and database credentials on the backend.

---

### 📚 What We Learned

- How to structure LLM system prompts and JSON schemas for deterministic commercial recommendations.
- How to implement idempotent payment state machines with PayPal REST APIs.
- The importance of visual feedback (animated badges, budget meters) in transforming raw AI responses into delightful user experiences.

---

### 🔮 What's Next for Commerce Lead AI

- **Authenticated Customer Profiles:** Adding JWT authentication so shoppers can save personalized preferences and access private purchase histories.
- **Cross-Session Memory:** Storing customer taste profiles and past purchases to provide even more tailored recommendations over time.
- **Inventory & Fulfillment Sync:** Real-time warehouse inventory tracking and automated post-purchase shipping updates.
- **Multi-Currency Support:** Automated FX conversion for global PayPal checkouts.

---

## 🎬 2-Minute Demo Video Recording Script

| Time | Scene | On-Screen Action | Voiceover Cue |
| :--- | :--- | :--- | :--- |
| **0:00 - 0:20** | **Intro & Problem** | Show modern storefront at `http://localhost:5173`. Scroll past products. | *"Welcome to Commerce Lead AI. Traditional e-commerce search leaves shoppers with tab fatigue. Today, we're showing how conversational AI and PayPal transform this experience."* |
| **0:20 - 0:45** | **AI Assistant & Prompt** | Click the floating AI launcher. Point to the "✦ What I can do" teaser, then click the *"Work-from-home setup under $120"* suggestion chip. | *"Our assistant opens instantly. Let's ask for a work-from-home setup under $120. In seconds, Groq AI analyzes our catalog and builds a tailored bundle."* |
| **0:45 - 1:10** | **Explainability & Budget** | Highlight "Why this fits" badges on Headphones, Desk Lamp, and Charger. Highlight the Visual Budget Tracker ($104.97 / $120.00, 87% used). | *"Notice two key innovations: first, transparent explainability badges showing why each item fits. Second, our visual budget tracker proves the bundle stays strictly within budget."* |
| **1:10 - 1:30** | **One-Click Bundle Add** | Click *"Add Complete Bundle to Cart ($104.97)"*. Show button switch to *"✓ Bundle Added to Cart"*. Show floating cart badge update to 3. | *"Instead of adding products one by one, one click adds the entire bundle atomically to the cart with instant feedback."* |
| **1:30 - 1:50** | **PayPal Sandbox Checkout** | Scroll to Cart. Click PayPal button. In PayPal sandbox modal, approve payment. | *"At checkout, prices are verified server-side. We complete payment via PayPal Sandbox with built-in double-capture protection."* |
| **1:50 - 2:00** | **Receipt & Persistence** | Return to store. Show the instant digital receipt and the newly updated entry in Order History. | *"Payment captured! An instant verified receipt appears, and the order is permanently persisted in Supabase PostgreSQL. Thank you!"* |

---

## ✅ Final Submission Audit Checklist

- [x] **Repository Public:** GitHub repository is accessible at `https://github.com/aparajitaks/commerce-lead-ai`.
- [x] **README.md Polished:** Contains problem statement, feature breakdown, mermaid architecture diagram, setup guide, and env tables.
- [x] **Zero Hardcoded Secrets:** `backend/.env` and `frontend/.env` are in `.gitignore`; sanitized `.env.example` templates provided.
- [x] **Automated Tests Passing:** 24/24 backend tests pass (`npm test`).
- [x] **Frontend Builds Cleanly:** Production build succeeds without errors (`npm run build`).
- [x] **Demo Flow Verified:** Tested end-to-end with `"Work-from-home setup under $120"` -> Bundle Add -> PayPal Sandbox -> Supabase receipt.
- [x] **Demo Script & Guide:** Documented in both `DEMO_GUIDE.md` and `DEVPOST_SUBMISSION.md`.
