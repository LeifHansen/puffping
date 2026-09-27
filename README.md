# PuffPing

High-volume SMS/MMS marketing platform with an accompanying marketing site.
Built with Next.js 15, Prisma (SQLite dev / Postgres-ready), Twilio, and the Anthropic API.

## Structure

The app is split into two Next.js route groups under `src/app`:

- **`(marketing)`** — the public marketing site: landing page (`/`) and pricing (`/pricing`), with its own header/footer layout.
- **`(app)`** — the authenticated product with the sidebar layout: `/dashboard`, `/campaigns`, `/inbox`, `/contacts`, `/templates`, `/numbers`, `/compliance`.
- **`/api/*`** — REST endpoints shared by the app.

## Features

- **Campaigns at scale** — send to hundreds or 100,000+ contacts. Sends are enqueued instantly and drained by a durable background worker with bounded concurrency, Twilio 429 backoff, and crash-resume on server restart.
- **Contacts & CSV import** — auto-detected columns, E.164 auto-formatting, dedupe, and extra columns become dynamic fields.
- **Dynamic fields** — `{{first_name|there}}` with fallbacks plus any custom CSV column; live preview with SMS segment/encoding estimates.
- **Templates** with an inline AI assistant (Claude) that writes/refines compliant marketing copy.
- **MMS** — media on templates, campaigns, and inbox replies.
- **Number slot marketplace** — dedicated local numbers on PuffPing's carrier-approved A2P 10DLC campaigns (see below).
- **Toll-free verification** for workspaces that own toll-free numbers. (A self-serve per-tenant 10DLC registration pipeline lives in `src/lib/tendlc.ts`, disabled.)
- **Two-way inbox** with threaded conversations, unread tracking, MMS replies, and STOP/START opt-out compliance.
- **Reporting dashboard** — delivery/reply/opt-out rates and a 30-day volume chart fed by Twilio status callbacks.

## Multi-tenancy (framework laid, single-tenant today)

The schema and every query are already tenant-scoped so the jump to full multi-tenant SaaS is a small, localized change:

- **Schema** — `Tenant`, `User`, and `Membership` models; every messaging-domain row carries a `tenantId`; uniqueness is per-tenant (`@@unique([tenantId, phone])`, `[tenantId, name]`, …). Each tenant can hold its own Twilio subaccount / messaging-service SID.
- **One chokepoint** — `src/lib/tenant.ts` decides which tenant a request belongs to. Today `resolveTenant()` returns the default tenant (single-tenant mode). To go multi-tenant, change **only** that function (subdomain → `acme.puffping.io`, session, or JWT). Every route already calls `currentTenantId(req)` and scopes reads/writes accordingly.
- **Sending** — every message goes out from one of the workspace's own numbers (`src/lib/sender.ts`): `from` = the number, `messagingServiceSid` = that number's campaign. Selection is sticky per contact (the thread's number, else a stable hash).
- **Inbound routing** — the inbound webhook maps the destination number to its owning tenant (falls back to default). A number belongs to exactly one workspace.

## Number slots

Numbers are sold as **slots** on PuffPing's approved A2P 10DLC campaigns (`src/lib/slots.ts`):

- **Inventory** — each `MessagingCampaign` (a Twilio Messaging Service with a VERIFIED A2P campaign) provides 49 `NumberSlot`s. Platform admins (`PLATFORM_ADMIN_EMAILS`) add campaigns on `/admin`; the legacy `TWILIO_MESSAGING_SERVICE_SID` becomes "Campaign 1" on first boot, with existing numbers moved into free (comped) slots.
- **Buying** — `POST /api/slots/purchase` atomically reserves a slot (never oversells) and opens a $25/mo Stripe Checkout (one subscription per slot). The Stripe webhook activates it; abandoned checkouts return the slot to inventory.
- **Claiming** — `POST /api/slots/:id/claim` buys the chosen local number, attaches it to the slot's campaign, and records it `pending_registration`. Twilio Event Streams' number-registration events (`/api/webhooks/twilio/events`, connected from `/admin`) flip it to `active`, which is when it can send.
- **Billing states** — `past_due` pauses sending from the number; cancelling keeps the slot until the paid period ends, then the number is released and the slot goes back on sale.
- **Stripe webhook events** — enable `checkout.session.completed`, `checkout.session.expired`, and `customer.subscription.created|updated|deleted`.

## Getting started

```bash
npm install
cp .env.example .env   # fill in Twilio + Anthropic credentials
npx prisma db push     # creates dev.db and seeds nothing; the default tenant is created on first boot
npm run dev
```

### Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `file:./dev.db` for dev; point at Postgres in production (change `provider` in `prisma/schema.prisma`) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio API credentials |
| `TWILIO_MESSAGING_SERVICE_SID` | Legacy approved Messaging Service — seeds "Campaign 1" of slot inventory on first boot |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Billing (plans + number slots) |
| `STRIPE_PRICE_NUMBER_SLOT` | Recurring $25/mo Stripe price for one number slot |
| `PLATFORM_ADMIN_EMAILS` | Comma-separated emails allowed to manage slot inventory at `/admin` |
| `APP_BASE_URL` | Public URL of this app — Twilio webhooks must be reachable here |
| `ANTHROPIC_API_KEY` | Enables the AI copy assistant |

### Deploy (Fly.io)

`Dockerfile` + `fly.toml` are included and deploy to the **`puffping`** Fly app (`https://fly.io/apps/puffping`). Set the Twilio + Anthropic secrets on that app (`fly secrets set …`) and point the GitHub deploy connection at it. SQLite auto-migrates on boot; uncomment the `[mounts]` volume block for data that survives deploys. Keep one machine always running so the send worker never pauses mid-campaign.

## Scaling beyond SQLite

SQLite handles 100k-contact lists for a single-tenant deployment. For real multi-tenant / heavier concurrency, switch the Prisma datasource to Postgres and consider a dedicated worker process (the queue schema already supports it — workers claim rows by flipping `pending → sending`).
