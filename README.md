# KasiDrop API

Node.js + Express + TypeScript backend for the **KasiDrop** South African-made goods store.

## Start locally
1. Install Node.js 22+, run \`npm install\`.
2. Copy \`.env.example\` to \`.env\`.
3. Run \`npm run dev\`. In \`DEMO_MODE=true\`, no MongoDB is necessary.

\`\`\`bash
npm install
cp .env.example .env
npm run dev
npm run build
npm test
\`\`\`

Health: \`GET /health\`. Catalogue: \`GET /api/products\`.

**Demo accounts** (ephemeral demo mode ONLY, do not use with real customers):
- \`shopper@kasidrop.test\` / \`Demo@12345\`
- \`admin@kasidrop.test\` / \`Demo@12345\`

## Core routes
- \`GET /api/meta\`, \`GET /api/products\`, \`GET /api/products/:id\`
- \`POST /api/auth/register\`, \`POST /api/auth/login\`, \`GET /api/auth/me\`
- \`POST /api/orders/checkout\`, \`GET /api/orders\`, \`GET /api/orders/:id\`
- \`GET /api/admin/summary\`, \`GET /api/admin/orders\`, \`PATCH /api/admin/orders/:id\`
- \`POST /api/admin/products\`, \`PATCH /api/admin/products/:id\`
- \`POST /api/ai/chat\`, \`POST /api/admin/ai/listing\`
- \`POST /api/payfast/notify\`

## Mode and payment boundaries
The starter Render blueprint enables **DEMO_MODE=true**. Data is ephemeral and payments are simulated when checkout uses \`paymentMethod=demo\`. **No real payment happens, and no actual order fulfilment should occur in demo mode.** Never store real customer details in public demo mode.

For persistent deployment set \`DEMO_MODE=false\`, \`MONGODB_URI\`, a strong \`JWT_SECRET\`, and provision a trusted admin via \`SEED_ADMIN_EMAIL\` / \`SEED_ADMIN_PASSWORD\` with \`npm run seed\` (do not commit secrets). Then configure PayFast sandbox keys and \`PUBLIC_API_URL\`. Only sandbox PayFast is enabled. Actual payments, refunds, ITN failure recovery, security review, stock reservations and live-mode gateway verification need further hardening **before production commerce**.

Chat uses Claude if \`ANTHROPIC_API_KEY\` is configured; otherwise uses grounded catalogue fallback. Product search is lexical with South African contextual synonyms; vector embeddings are a later enhancement and **not yet implemented**.

## Deployment
Render Node Web Service: \`npm install && npm run build\`, start \`npm start\`, health path \`/health\`. Region Frankfurt is preferred for SA audiences if available. Set \`CLIENT_URL\` to the actual Netlify site. Never expose keys in the UI.

See [UI repository](https://github.com/oboikanyego/kasi-drop-ui).
