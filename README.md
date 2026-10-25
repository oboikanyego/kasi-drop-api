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


## Optional database-backed demo accounts and orders

Set `SEED_DEMO_USERS=true` **only in a controlled testing environment**. Supply two different strong secrets in the server's environment:
- `SEED_DEMO_ADMIN_PASSWORD` (minimum 16 characters, demo admin)
- `SEED_DEMO_CUSTOMER_PASSWORD` (minimum 16 characters, shared by the three demo customers)

The following fictional accounts are created if missing:

| Role | Email |
| --- | --- |
| Demo admin | `demo.admin@kasidrop.test` |
| Demo customer | `thandi.demo@kasidrop.test` |
| Demo customer | `sipho.demo@kasidrop.test` |
| Demo customer | `naledi.demo@kasidrop.test` |

The five illustrative orders use fixed IDs `KDTEST01-ORDER` through `KDTEST05-ORDER`, with statuses pending_payment, paid, processing, shipped and delivered. All have `demoSeed:true`, payment method `demo_seed`, clearly synthetic delivery addresses, and products drawn from the sample catalogue. **These orders have never been paid, shipped or fulfilled**.

On app startup in database mode, `seedDemoUsersAndOrders()` inserts missing demo users and orders. It never overwrites existing passwords, user roles or orders, never charges a customer, and never subtracts product stock. It stops rather than taking over a conflicting non-demo account or order. Run `npm run seed` manually for the same idempotent behaviour.

The health endpoint reports demo account and order counts. Admin statistics exclude simulated payments from **real revenue** while reporting `simulatedRevenue` and `demoOrders` separately. The customer/admin orders API includes the `demoSeed` marker for prominent test labels. Once the initial seed has succeeded, change `SEED_DEMO_USERS=false` to stop future automatic demo account creation. This does not delete existing records; remove only specifically marked demo data deliberately, never by wiping live collections.

**Security:** Never publish demo admin credentials, use a common publicly known password, expose seed secrets to the frontend or include them in Git. Remove demo accounts before opening admin access to real users. If the public storefront remains online, do not advertise these accounts on its login page.
