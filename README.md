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

Health: `GET /health` (liveness), `GET /api/health` (readiness). Catalogue: `GET /api/products`.

**Demo accounts** (ephemeral demo mode ONLY, do not use with real customers):

- \`shopper@kasidrop.test\` / \`Demo@12345\`
- \`admin@kasidrop.test\` / \`Demo@12345\`

## Health checks and Render monitoring (October 2026)

- `GET /health`: public **liveness** probe, always returns HTTP 200 with `status: "ok"`, `service`, and `uptime` while Express is serving requests. It deliberately does not depend on MongoDB.
- `GET /api/health`: public **readiness** probe; returns HTTP 200 with `status: "ready"` in demo mode or when Mongoose is connected (`readyState === 1`). In persistent mode, it returns HTTP 503 with `status: "not_ready"` if MongoDB is disconnected. Includes `service` and `database` (`demo`, `connected`, or `disconnected`).
- Both responses include `Cache-Control: no-store`. They intentionally omit sensitive environment values and database connection strings.
- `render.yaml` specifies `healthCheckPath: /health`. **Existing Render services may not automatically inherit blueprint changes**; inspect the service's Settings → Health Check Path and set `/health` there.
- Run `npm test` for automated checks, `npm run lint` and `npm run build` before deploying. The Render service must be active to verify public URLs.

## Account favourites

Authenticated customers' favourites are stored as `favoriteProductIds` on their MongoDB user documents. All favourites routes require authentication:

- `GET /api/favorites`
- `PUT /api/favorites/:productId`
- `DELETE /api/favorites/:productId`
- `POST /api/favorites/merge` with `{ "productIds": ["product-id"] }`

The frontend loads account favourites on sign-in, merges any locally saved guest selections, and isolates accounts. **Guest-only** favourites use browser localStorage; demo-mode server data is temporary and resets on restart.

## Formatting

Run `npm run format` to apply pinned Prettier formatting or `npm run format:check` to verify it.

## Core routes

- \`GET /api/meta\`, \`GET /api/products\`, \`GET /api/products/:id\`
- \`POST /api/auth/register\`, \`POST /api/auth/login\`, \`GET /api/auth/me\`
- \`POST /api/auth/logout\`, \`POST /api/auth/session\` (exchange a Bearer token for the session cookie)

**Sessions:** login and register set an httpOnly \`kasi_session\` cookie (\`SameSite=Lax\`, \`Path=/api\`, \`Secure\` when \`NODE_ENV=production\`, 7 days), so browser scripts never see the token. Cookie-authenticated \`POST\`/\`PUT\`/\`PATCH\`/\`DELETE\` requests must send an \`X-KasiDrop-CSRF\` header. Login and register return only the user, never the token. An \`Authorization: Bearer\` header is still accepted, so tokens stored by UIs released before the cookie keep working until \`POST /api/auth/session\` swaps them for it; Bearer requests need no CSRF header.

- \`POST /api/orders/checkout\`, \`GET /api/orders\`, \`GET /api/orders/:id\`
- \`GET /api/admin/summary\`, \`GET /api/admin/orders\`, \`PATCH /api/admin/orders/:id\`
- \`POST /api/admin/products\`, \`PATCH /api/admin/products/:id\`
- \`POST /api/ai/chat\`, \`POST /api/admin/ai/listing\`
- \`POST /api/payfast/notify\`

## Mode and payment boundaries

The starter Render blueprint enables **DEMO_MODE=true**. Data is ephemeral and payments are simulated when checkout uses \`paymentMethod=demo\`. **No real payment happens, and no actual order fulfilment should occur in demo mode.** Never store real customer details in public demo mode.

For persistent deployment set \`DEMO_MODE=false\`, \`MONGODB_URI\`, a strong \`JWT_SECRET\`, and provision a trusted admin via \`SEED_ADMIN_EMAIL\` / \`SEED_ADMIN_PASSWORD\` with \`npm run seed\` (do not commit secrets). Then configure PayFast sandbox keys and \`PUBLIC_API_URL\`. Only sandbox PayFast is enabled. Actual payments, refunds, ITN failure recovery, security review and live-mode gateway verification need further hardening **before production commerce**.

PayFast checkout **reserves stock** when the order is created. A `FAILED`/`CANCELLED` ITN releases it, and unpaid orders release it after `PAYFAST_RESERVATION_MINUTES` (default 30) with status `expired`. If a `COMPLETE` ITN arrives after expiry, stock is taken again, or the order becomes `requires_review` if it has sold out.

Chat uses Google Gemini (`GEMINI_API_KEY`, default `gemini-3.1-flash-lite`) when configured; otherwise uses a grounded catalogue fallback. Product search is lexical with South African contextual synonyms; vector embeddings are a later enhancement and **not yet implemented**.

## Deployment

Render Node Web Service: \`npm ci && npm run build\`, start \`npm start\`, health path \`/health\`. Region Frankfurt is preferred for SA audiences if available. Set \`CLIENT_URL\` to the actual Netlify site. Never expose keys in the UI.

See [UI repository](https://github.com/oboikanyego/kasi-drop-ui).

## MongoDB configuration

MongoDB-backed mode (set `DEMO_MODE=false`) requires `MONGODB_URI` (cluster connection string) and `MONGODB_DB_NAME` (database name, e.g. `kasidrop`). Both the API and `npm run seed` pass the database name explicitly to Mongoose. With `DEMO_MODE=true`, the database is not accessed, and data is temporary.

## Persistent catalogue seeding (VibeSA-style sample content)

The API includes **12 curated sample South African products** (categories: Food & Drink, Fashion, Home & Living and Crafts). They are illustrative demo listings, **not verified sellers, stock or active offers**.

With `DEMO_MODE=true` the same products exist **in memory only**. Every Render restart resets accounts, stock and order history. Nothing is written to Atlas.

To persist sample products to MongoDB Atlas, configure the real `MONGODB_URI` and `MONGODB_DB_NAME=kasidrop` plus a strong `JWT_SECRET` in Render; set `DEMO_MODE=false`. On successful MongoDB connection, the API **automatically upserts only missing products**, then starts serving them. Each product uses a stable `id` and a unique index. Subsequent startups **preserve edited names, prices, images, inventory and availability**. Partial seeds are repaired without deleting any records. The startup log reports seed totals; `/health` reports liveness only.

A manual alternative (after configuring MongoDB env vars): `npm run seed`. This CLI always connects to MongoDB, even if `DEMO_MODE=true`, and uses the same insert-only behaviour. An admin is optionally created _once_ when `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are both configured for the CLI. Do not expose these values in Git, enable shared demo admin credentials, or seed actual customer information.

**Important:** The public demo payment option only works while `DEMO_MODE=true`. In MongoDB-backed mode, the existing checkout requires correctly configured PayFast sandbox credentials. Do not enable real payments or fulfilment before payment reconciliation, image rights and inventory validation are production-ready.

### Confirm Atlas content

Once configured, check `/api/health` for `status:"ready"` and `database:"connected"`. Query `/api/products` and Atlas to verify catalogue totals. The collections are `kasiproducts`, `kasiusers`, `kasiorders` in the selected `kasidrop` database. You can verify `kasiproducts` counts directly in Atlas Data Explorer. Avoid treating public demo records as real customer data.

## Optional database-backed demo accounts and orders

Set `SEED_DEMO_USERS=true` **only in a controlled testing environment**. Supply two different strong secrets in the server's environment:

- `SEED_DEMO_ADMIN_PASSWORD` (minimum 16 characters, demo admin)
- `SEED_DEMO_CUSTOMER_PASSWORD` (minimum 16 characters, shared by the three demo customers)

The following fictional accounts are created if missing:

| Role          | Email                       |
| ------------- | --------------------------- |
| Demo admin    | `demo.admin@kasidrop.test`  |
| Demo customer | `thandi.demo@kasidrop.test` |
| Demo customer | `sipho.demo@kasidrop.test`  |
| Demo customer | `naledi.demo@kasidrop.test` |

The five illustrative orders use fixed IDs `KDTEST01-ORDER` through `KDTEST05-ORDER`, with statuses pending_payment, paid, processing, shipped and delivered. All have `demoSeed:true`, payment method `demo_seed`, clearly synthetic delivery addresses, and products drawn from the sample catalogue. **These orders have never been paid, shipped or fulfilled**.

On app startup in database mode, `seedDemoUsersAndOrders()` inserts missing demo users and orders. It never overwrites existing passwords, user roles or orders, never charges a customer, and never subtracts product stock. It stops rather than taking over a conflicting non-demo account or order. Run `npm run seed` manually for the same idempotent behaviour.

Startup logs describe demo seeding; the health endpoints do not report demo account or order counts. Admin statistics exclude simulated payments from **real revenue** while reporting `simulatedRevenue` and `demoOrders` separately. The customer/admin orders API includes the `demoSeed` marker for prominent test labels. Once the initial seed has succeeded, change `SEED_DEMO_USERS=false` to stop future automatic demo account creation. This does not delete existing records; remove only specifically marked demo data deliberately, never by wiping live collections.

**Security:** Never publish demo admin credentials, use a common publicly known password, expose seed secrets to the frontend or include them in Git. Remove demo accounts before opening admin access to real users. If the public storefront remains online, do not advertise these accounts on its login page.

## Gemini AI setup (replaces Anthropic)

Get a free-tier Gemini API key from https://aistudio.google.com/api-keys and set `GEMINI_API_KEY` on the **Render API service** under Environment. Do not set it on Netlify or in Angular.
Optional `GEMINI_MODEL=gemini-3.1-flash-lite` (default). Remove obsolete `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` variables after verifying the new integration.

Gemini is used by `POST /api/ai/chat` (product-aware, validated catalogue and cart suggestions) and `POST /api/admin/ai/listing` (factual product listing drafts). The shopping assistant still falls back to catalogue search when no key is configured. Limits on AI calls remain in effect. The provider's free tier has request/usage quotas and may use inputs to improve Google products; do not send customer PII, secrets, order details or other sensitive information. Check Google's current free-tier eligibility and limits before relying on it in production.

The deployment can be built and run **without** the key; AI features only become active once the secret is added to Render.

**Model access:** Older Gemini 2.5 models can return 404 to new Google AI projects even with a valid key. Use `gemini-3.1-flash-lite` as the default free-tier model. Check `GEMINI_MODEL` in Render if Google's API reports 404. Never log API keys or complete customer prompts.

## Groq fallback for Gemini

Configure `GROQ_API_KEY` and `GROQ_MODEL` on the Render API service (not in Angular). The default model is `llama-3.3-70b-versatile`. Gemini remains primary. If Gemini fails, Groq answers shopping chat and admin listing requests. If both providers fail, shopping chat falls back to catalogue search without any cart actions. Usage is subject to Groq account limits. Never commit API keys.

### Retail-style mock products and images (October 2026)

The seed also includes **12 additional retailer-style SKUs** (`mock-*`) for common products such as rooibos tea packs, 100 g biltong, household ceramics, everyday apparel, accessories and hand-crafted homewares. These are representative **product categories and formats commonly stocked by retailers**, not offers by any named store. All names, prices, availability and sellers are illustrative; photography is representative and might not show exact packaging. Do not imply endorsement or authentic stock.

Existing seeded product IDs remain unchanged because orders and demo fixtures use them. MongoDB upsert-on-insert **adds only missing new IDs**, leaving previous and manually edited items untouched. After merging/deploying in persistent mode, the automatic seed inserts the 12 `mock-*` products; it does not replace the pre-existing 12 product records.

Photos use direct images.unsplash.com CDN URLs, with size/quality parameters. Unsplash licensing generally permits free commercial use, but respect applicable brand/likeness restrictions. The API's CI includes a **live image URL audit** (`npx tsx scripts/audit-catalogue-images.ts`), validating HTTP success and image content type for every unique seeded image. A passing CI checks availability at that moment, not a permanent guarantee against future CDN changes. Store copies in controlled asset hosting if long-term availability is essential.

## Controlled retail demo catalogue refresh

Use this **only in a controlled demo/staging environment**, not against a production shop with real stock.

Run `npm run refresh:catalogue` in the API environment to produce a **read-only dry-run**. It shows the 12 retail `mock-*` SKU IDs that are missing, unchanged legacy items eligible to hide, and legacy items protected from changes.

After reviewing the plan and taking an Atlas backup, explicitly apply using `CONFIRM_DEMO_CATALOGUE_REFRESH=YES npm run refresh:catalogue -- --apply`.

The apply path inserts missing retail products without replacing existing products, then **deactivates (does not delete)** original legacy seed items only if every tracked field, including price, photo, tags and stock, still matches the original seed and they are not referenced by unsettled orders. Previously modified stock/prices or content are protected. Accounts, orders and custom products are never edited. This is deliberately conservative: not all 12 legacy products will disappear if they were edited or still have unsettled orders. Resolve those cases manually after reviewing order state.

The original `npm run seed` remains insert-only and does not reactivate retired entries. This refresh never runs automatically on deployment; it must be explicitly applied to the database connected to the correct Render service. Refresh the storefront after the operation to see the latest active listings.


## Analytics and early-tester feedback

Public, rate-limited routes:
- `POST /api/analytics/events` with `{"name":"page_view","page":"shop"}`; permitted names are `page_view`, `product_search`, `ai_chat`, `add_to_cart`, `checkout_started`, `checkout_created`, `api_error`. Only a broad, fixed page label may be attached; **do not transmit search text, AI messages, personal information, or full URLs**.
- `POST /api/feedback` with `{"category":"experience","rating":4,"message":"Your feedback here"}`; 10–1500 characters; optional 1–5 rating.

Admin-authenticated reporting:
- `GET /api/admin/analytics`: counts over the last 30 days and checkout-creation/start ratio. **Page views are not unique visitors**, checkout creation is **not a completed payment**, and the rate is not a user-level conversion rate.
- `GET /api/admin/feedback`: latest 100 feedback submissions (handle as potentially sensitive untrusted content).

Analytics events automatically expire after 90 days in persistent MongoDB mode, with an in-memory bounded fallback for demo mode. Free-text feedback is retained until deliberately deleted; establish a retention policy before broad public launch. All metrics are informational, not certified financial reports. The application records HTTP 5xx counts without request bodies, addresses, or IPs.

