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

## MongoDB configuration

MongoDB-backed mode (set `DEMO_MODE=false`) requires `MONGODB_URI` (cluster connection string) and `MONGODB_DB_NAME` (database name, e.g. `kasidrop`). Both the API and `npm run seed` pass the database name explicitly to Mongoose. With `DEMO_MODE=true`, the database is not accessed, and data is temporary.

## Persistent catalogue seeding (VibeSA-style sample content)

The API includes **12 curated sample South African products** (categories: Food & Drink, Fashion, Home & Living and Crafts). They are illustrative demo listings, **not verified sellers, stock or active offers**.

With `DEMO_MODE=true` the same products exist **in memory only**. Every Render restart resets accounts, stock and order history. Nothing is written to Atlas.

To persist sample products to MongoDB Atlas, configure the real `MONGODB_URI` and `MONGODB_DB_NAME=kasidrop` plus a strong `JWT_SECRET` in Render; set `DEMO_MODE=false`. On successful MongoDB connection, the API **automatically upserts only missing products**, then starts serving them. Each product uses a stable `id` and a unique index. Subsequent startups **preserve edited names, prices, images, inventory and availability**. Partial seeds are repaired without deleting any records. The startup log and `GET /health` report the seed totals.

A manual alternative (after configuring MongoDB env vars): `npm run seed`. This CLI always connects to MongoDB, even if `DEMO_MODE=true`, and uses the same insert-only behaviour. An admin is optionally created *once* when `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are both configured for the CLI. Do not expose these values in Git, enable shared demo admin credentials, or seed actual customer information.

**Important:** The public demo payment option only works while `DEMO_MODE=true`. In MongoDB-backed mode, the existing checkout requires correctly configured PayFast sandbox credentials. Do not enable real payments or fulfilment before payment reconciliation, image rights and inventory validation are production-ready.

### Confirm Atlas content

Once configured, check `/health` for `mode:"database"` and non-zero `catalogue.activeProducts`. The collections are `kasiproducts`, `kasiusers`, `kasiorders` in the selected `kasidrop` database. You can verify `kasiproducts` counts directly in Atlas Data Explorer. Avoid treating public demo records as real customer data.
