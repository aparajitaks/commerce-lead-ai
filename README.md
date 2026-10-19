# Commerce Lead AI

An AI-powered commerce and payments demo that helps shoppers discover products, get personalized recommendations, build bundles, and check out using PayPal Sandbox.

## Features

- Product catalog with search and category filtering
- AI-powered product recommendations with explanations
- Budget-aware recommendations and bundle suggestions
- Shopping cart and PayPal Sandbox checkout
- Server-side product and price validation
- Payment capture recovery and duplicate-capture safeguards
- Checkout receipts and order history
- Automated backend tests

## Architecture

- **Frontend:** React and Vite
- **Backend:** Node.js and Express
- **Database:** PostgreSQL through Supabase
- **ORM:** Prisma
- **AI:** Groq API
- **Payments:** PayPal Sandbox

## Local Development

### Prerequisites

Install Node.js and npm, and prepare PostgreSQL, Groq, and PayPal Sandbox credentials.

### Backend

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Configure the backend environment variables in `backend/.env` using the names and requirements documented in your local configuration. Never commit credentials.

### Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, typically `http://localhost:5173`.

## Tests and Production Build

Backend tests:

```bash
cd backend
npm test
```

Frontend production build:

```bash
cd frontend
npm run build
```

## Demo Limitations and Security

**This project is a hackathon demo, not a production-ready commerce system.**

- PayPal checkout uses Sandbox transactions, not real payments.
- The current `GET /api/orders` endpoint returns recent completed store transactions without customer authentication. The history is shared and must not be treated as private customer data.
- A production deployment must authenticate customers and enforce server-side authorization so customers can access only their own orders.
- Payment recovery and idempotency safeguards reduce duplicate-capture risks but do not replace production monitoring, reconciliation, and operational controls.
- Secrets must remain in backend environment variables and must never be exposed through frontend code or committed to version control.

## Project Status

The backend automated test suite and frontend production build have passed in the current development checkpoint. A successful end-to-end PayPal Sandbox checkout should still be verified manually in the browser.
