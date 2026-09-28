# PuffPing

High-volume SMS/MMS marketing platform with an accompanying marketing site.
Built with Next.js 15, Prisma + PostgreSQL (Neon in production), Twilio, and the Anthropic / OpenAI APIs.

## Structure

The app is split into two Next.js route groups under `src/app`:

- **`(marketing)`** — the public marketing site: landing page (`/`), pricing (`/pricing`), privacy, and terms, with its own header/footer layout.
- **`(app)`** — the authenticated product with the sidebar layout: `/dashboard`, `/campaigns`, `/inbox`, `/contacts`, `/audiences`, `/automations`, `/media` (library + templates), `/numbers`, `/compliance`, `/settings`.
- **`/login`, `/signup`** — auth pages; **`/l/<code>/<contactId>`** — tracked short-link redirects.
- **`/api/*`** — REST endpoints shared by the app (tenant-scoped ones are gated by `src/middleware.ts`).

## Features

- **Campaigns at scale** — send to hundreds or 100,000+ contacts. Sends are enqueued instantly and drained by a durable background worker with bounded concurrency, Twilio 429 backoff, atomic row claims (multi-machine safe), and crash-resume on restart.
- **Contacts & CSV import** — auto-detected columns, E.164 auto-formatting, dedupe, suppression-aware, and extra columns become dynamic fields.
- **Dynamic fields** — `{{first_name|there}}` with fallbacks plus any custom CSV column; live preview with SMS segment/encoding estimates.
- **Templates & media library** with an inline AI assistant (Claude) that writes compliant copy, and AI "Optimize for Mobile" for MMS images.
- **MMS** — media on templates, campaigns, and inbox replies.
- **Scheduling & automations** — scheduled campaigns, keyword auto-responders, and multi-step drip sequences.
- **Link tracking** — per-contact short links with click logging and CTR.
- **Segments & suppression** — saved audience filters and a DNC list mirrored onto every send.
- **Number slot marketplace** — dedicated local numbers on PuffPing's carrier-approved A2P 10DLC campaigns (see below); no per-customer registration. A workspace can't send until it has one.
- **Toll-free verification** for workspaces that own toll-free numbers. (A self-serve per-tenant 10DLC registration pipeline lives in `src/lib/tendlc.ts`, disabled.)
- **Two-way inbox** with threaded conversations, unread tracking, MMS replies, and STOP/START opt-out compliance.
- **Reporting dashboard** — delivery/reply/opt-out rates and a 30-day volume chart fed by Twilio status callbacks.
- **Workspaces, team roles, and Stripe billing** (billing activates when Stripe keys are set).

## A2P 10DLC (platform-managed)

PuffPing's numbers send under carrier-approved A2P 10DLC campaigns on the main Twilio account. The first:

| Resource | SID |
|---|---|
| Messaging Service | `MG1dc1a3f40c323aabf6cf26770330a6da` |
| A2P campaign (approved) | `CM00d14a209e1c83c112c73c91d1e1eed5` |

The service is built in (`src/lib/twilio.ts`) and becomes **Campaign 1** of the number-slot inventory on first boot; `TWILIO_MESSAGING_SERVICE_SID` overrides it only for a dev/staging Twilio account. More approved campaigns are added on `/admin`.

- **Number slots** — numbers are sold as slots on the approved campaigns (see [Number slots](#number-slots)); a claimed number is registered on its slot's campaign and can send once carriers confirm it.
- **Sending** — every message goes out from one of the workspace's own numbers (`src/lib/sender.ts`): `from` = the number, `messagingServiceSid` = that number's campaign. Selection is sticky per contact (the thread's number, else a stable hash). Nothing ever goes out from a shared pool.
- **No number, no sending** — a workspace can send only once it has a registered number on a paid slot. `sendingNumberStatus()` (`src/lib/send.ts`, also returned as `sending` by `GET /api/numbers`) says whether it can and, if not, what to do: wait for registration, claim a number into a slot, fix a failed registration or past-due payment, or buy a slot. Sending a campaign, scheduling one (create or reschedule), and inbox replies return `409` with `code: "NO_SENDING_NUMBER"` and that reason; the send route checks before claiming, so the campaign is left untouched. A scheduled campaign that fires without a number is marked `failed` with a `failureReason` (shown on the Campaigns page); automation steps (drips, keyword auto-replies) wait and retry hourly instead of being skipped; already-queued rows fail with `errorCode` `NO_SENDING_NUMBER`. Drafts can still be created without a number, and the app shows why it can't send on every page that sends.
- The old self-serve 10DLC wizard (`src/lib/tendlc.ts`, `/api/registration/10dlc`) is disabled behind `REGISTRATION_DISABLED`, kept for a future per-tenant ISV model.

## Multi-tenancy

- **Schema** — `Tenant`, `User`, `Membership`, `Session`, `Invitation`; every messaging-domain row carries a `tenantId`, and uniqueness is per-tenant (`@@unique([tenantId, phone])`, …).
- **One chokepoint** — `src/lib/tenant.ts` resolves the tenant from the signed-in session (`currentTenantId()` / `resolveTenant()`), and throws when there's no valid session. Every route scopes reads and writes by that id. Users can belong to several workspaces and switch between them.
- **Inbound routing** — the inbound webhook maps the destination (`To`) number to its owning tenant (falls back to the default tenant). A number belongs to exactly one workspace.

## Number slots

Numbers are sold as **slots** on PuffPing's approved A2P 10DLC campaigns (`src/lib/slots.ts`):

- **Inventory** — each `MessagingCampaign` (a Twilio Messaging Service with a VERIFIED A2P campaign) provides 49 `NumberSlot`s. Platform admins (`PLATFORM_ADMIN_EMAILS`) add campaigns on `/admin`; the approved service above becomes "Campaign 1" on first boot, with numbers already in its sender pool moved into free (comped) slots.
- **Buying** — `POST /api/slots/purchase` atomically reserves a slot (never oversells) and opens a $25/mo Stripe Checkout (one subscription per slot). The Stripe webhook activates it; abandoned checkouts return the slot to inventory.
- **Claiming** — `POST /api/slots/:id/claim` buys the chosen local number, attaches it to the slot's campaign, and records it `pending_registration`. Twilio Event Streams' number-registration events (`/api/webhooks/twilio/events`, connected from `/admin`) flip it to `active`, which is when it can send.
- **Billing states** — `past_due` pauses sending from the number; cancelling keeps the slot until the paid period ends, then the number is released and the slot goes back on sale.
- **Stripe webhook events** — enable `checkout.session.completed`, `checkout.session.expired`, and `customer.subscription.created|updated|deleted`.

## Getting started

```bash
npm install
cp .env.example .env   # set DATABASE_URL (local Postgres) + Twilio / AI keys
npx prisma db push     # create the schema; the default tenant is created on first boot
npm run dev
```

### Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (production: Fly secret `NEON_PRODUCTION_DATABASE_URL`, mapped at container start) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio API credentials (also used to verify webhook signatures) |
| `TWILIO_MESSAGING_SERVICE_SID` | Optional override of the built-in approved service that seeds "Campaign 1" (dev/staging only) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Billing (plans + number slots) |
| `STRIPE_PRICE_NUMBER_SLOT` | Recurring $25/mo Stripe price for one number slot |
| `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_GROWTH` | Stripe prices for the paid plans |
| `PLATFORM_ADMIN_EMAILS` | Comma-separated emails allowed to manage slot inventory at `/admin` |
| `APP_BASE_URL` | Public URL of this app — Twilio webhooks and signatures use it |
| `ANTHROPIC_API_KEY` | Enables the AI copy assistant |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Image "Optimize for Mobile" |
| `MEDIA_DIR` | Upload directory (mount a volume on Fly so media survives deploys) |

### Deploy (Fly.io)

`Dockerfile` + `fly.toml` deploy to the Fly app named in `fly.toml` (`textblast`, which serves puffping.com). Set the Twilio, AI, and `NEON_PRODUCTION_DATABASE_URL` secrets with `fly secrets set …`. On boot the container runs `prisma db push` (non-destructive) against Neon, then starts the server. Keep one machine always running so the send worker and scheduler never pause.

## Scaling

The send worker and scheduler run inside the web process. Campaign sends, scheduled launches, drip steps, and queue rows all use atomic conditional claims, and only stale queue claims (from a dead machine) are ever requeued, so running several machines is safe. For heavier load, move the worker into a dedicated process; it already claims rows by flipping `pending → sending`.
