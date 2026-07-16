# 🍃 PuffPing

High-volume SMS/MMS marketing platform — hazy vibes, crisp delivery, fully compliant.

Built with Next.js 15, Prisma (SQLite dev / Postgres-ready), Twilio, and the Anthropic API.

## Features

- **Campaigns at scale** — send to hundreds or 100,000+ contacts. Sends are enqueued instantly and drained by a durable background worker with bounded concurrency, Twilio 429 backoff, and crash-resume on server restart.
- **Contacts & CSV import** — drop in any CSV; the phone column is auto-detected, numbers are auto-formatted to E.164 (`libphonenumber-js`), duplicates deduped, and every extra column becomes a dynamic field.
- **Dynamic fields** — `{{first_name|there}}`, `{{last_name}}`, `{{email}}`, plus any custom CSV column, with fallback support. Live preview with per-message SMS segment/encoding estimates.
- **Templates** — reusable message templates with MMS media.
- **MMS** — attach a media URL to any template, campaign, or inbox reply.
- **AI copywriter** — Claude drafts and refines compliant marketing copy (brand name + STOP language, single-segment preference) right in the composer.
- **Fully automated 10DLC registration** — one form with the absolute minimum Twilio requires (business + EIN, one contact, use case). PuffPing then automatically creates and submits the TrustHub secondary customer profile, A2P trust product, brand registration, messaging service (wired to the app's webhooks), and A2P campaign. Resumable at every step.
- **Toll-free verification** — buy a toll-free number, submit verification with the same minimal info, poll status.
- **Number shopping** — search local numbers by area code/pattern or toll-free, buy one or many in a click; purchases auto-join the messaging service pool.
- **Two-way inbox** — inbound webhook records conversations, threads them per contact, tracks unread counts; reply (SMS or MMS) from the UI. STOP/START keywords sync opt-out state locally (Twilio Advanced Opt-Out enforces it at the carrier).
- **Reporting dashboard** — delivery rate, reply rate, opt-out rate, unread count, and a 30-day volume chart fed by real Twilio delivery callbacks.

## Getting started

```bash
npm install
cp .env.example .env   # fill in Twilio + Anthropic credentials
npx prisma db push     # creates dev.db
npm run dev
```

### Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `file:./dev.db` for dev; point at Postgres in production (change `provider` in `prisma/schema.prisma`) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio API credentials |
| `TWILIO_MESSAGING_SERVICE_SID` | Set automatically by the 10DLC flow (shown on the Compliance page) or paste an existing one |
| `APP_BASE_URL` | Public URL of this app — Twilio webhooks (`/api/webhooks/twilio/inbound` and `/status`) must be reachable here |
| `ANTHROPIC_API_KEY` | Enables the AI copy assistant |

### Go-live checklist

1. **Compliance → A2P 10DLC registration** — fill the one form; brand/campaign review is handled by Twilio (typically minutes–days). Use “Check status” to advance the pipeline; when it completes, copy the Messaging Service SID into `.env`.
2. *(or/and)* **Numbers → buy a toll-free number**, then **Compliance → Toll-free verification**.
3. **Numbers** — buy additional local numbers to raise throughput; they pool into the messaging service automatically.
4. **Contacts** — import your CSV into a list.
5. **Campaigns** — compose (AI-assisted), preview segments/audience, send.

## Architecture notes

- `src/lib/send.ts` — enqueue + background worker. Messages flow `pending → sending → queued/sent → delivered|undelivered|failed` (final states from Twilio status callbacks).
- `src/lib/tendlc.ts` — the 10DLC state machine; every Twilio SID is persisted so the pipeline is idempotent and resumable.
- `src/instrumentation.ts` — on boot, requeues messages stranded by a restart.
- Webhooks validate `X-Twilio-Signature`.
- Compliance guardrails: opted-out contacts are excluded from every audience query; STOP/HELP auto-replies are configured on the A2P campaign; opt-in keywords/messages registered with the campaign.

## Scaling beyond SQLite

SQLite comfortably handles 100k-contact lists for a single-tenant deployment. For multi-tenant or heavier concurrency, switch the Prisma datasource to Postgres and consider moving the send queue to a dedicated worker process (the queue schema already supports it — workers claim rows by flipping `pending → sending`).
