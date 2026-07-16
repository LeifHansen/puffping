# Textblast.io

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
- **Fully automated A2P 10DLC registration** — one minimal form drives the full Twilio pipeline (TrustHub customer profile → A2P trust product → brand → messaging service → campaign), idempotent and resumable.
- **Toll-free verification** and **number shopping** (search + bulk purchase, auto-pooled).
- **Two-way inbox** with threaded conversations, unread tracking, MMS replies, and STOP/START opt-out compliance.
- **Reporting dashboard** — delivery/reply/opt-out rates and a 30-day volume chart fed by Twilio status callbacks.

## Multi-tenancy (framework laid, single-tenant today)

The schema and every query are already tenant-scoped so the jump to full multi-tenant SaaS is a small, localized change:

- **Schema** — `Tenant`, `User`, and `Membership` models; every messaging-domain row carries a `tenantId`; uniqueness is per-tenant (`@@unique([tenantId, phone])`, `[tenantId, name]`, …). Each tenant can hold its own Twilio subaccount / messaging-service SID.
- **One chokepoint** — `src/lib/tenant.ts` decides which tenant a request belongs to. Today `resolveTenant()` returns the default tenant (single-tenant mode). To go multi-tenant, change **only** that function (subdomain → `acme.textblast.io`, session, or JWT). Every route already calls `currentTenantId(req)` and scopes reads/writes accordingly.
- **Sending** — `tenantMessagingServiceSid(tenant)` prefers the tenant's own messaging service and falls back to the global env var; the 10DLC pipeline writes the created messaging service back onto the tenant automatically.
- **Inbound routing** — the inbound webhook maps the destination number to its owning tenant (falls back to default).

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
| `TWILIO_MESSAGING_SERVICE_SID` | Global fallback; per-tenant SIDs (set by the 10DLC flow) take precedence |
| `APP_BASE_URL` | Public URL of this app — Twilio webhooks must be reachable here |
| `ANTHROPIC_API_KEY` | Enables the AI copy assistant |

### Deploy (Fly.io)

`Dockerfile` + `fly.toml` are included and deploy to the **`textblast`** Fly app (`https://fly.io/apps/textblast`). Set the Twilio + Anthropic secrets on that app (`fly secrets set …`) and point the GitHub deploy connection at it. SQLite auto-migrates on boot; uncomment the `[mounts]` volume block for data that survives deploys. Keep one machine always running so the send worker never pauses mid-campaign.

## Scaling beyond SQLite

SQLite handles 100k-contact lists for a single-tenant deployment. For real multi-tenant / heavier concurrency, switch the Prisma datasource to Postgres and consider a dedicated worker process (the queue schema already supports it — workers claim rows by flipping `pending → sending`).
