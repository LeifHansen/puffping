# PuffPing build roadmap

Living checklist for the current work stream. Update as phases land.

## Feature phases (in order)

- [x] **Phase 1 — Scheduling & Automations**
      Scheduled campaigns + a background scheduler; keyword-triggered
      auto-responders and multi-step drip sequences (`/automations`).
- [x] **Phase 2 — Link tracking & short links**
      Short `/l/<code>/<contactId>` links, per-contact click logging, CTR on
      campaigns.
- [x] **Phase 3 — Segments & suppression**
      Saved segments (lists / tags / engagement) resolved at send time; DNC
      list mirrored onto `optedOut` so every send excludes it.
- [x] **Phase 4 — Multi-tenant core** (buildable parts done)
      Session-driven tenant resolution (already in place), workspace switching
      (`Session.activeTenantId`), team invites + roles (owner/admin/member),
      create-workspace, and a `/settings` page. Billing scaffolding (plans,
      usage meter, Stripe Checkout + webhook) that activates on keys.

      **Still infra-gated (need user-provided config, cannot run/verify here):**
      - **Postgres migration** — flip the Prisma datasource `provider` to
        `postgresql` and set `DATABASE_URL` to a managed Postgres (Neon / Fly
        Postgres). Schema is already relational and Postgres-ready. Do this
        before real multi-tenant launch (SQLite can't handle the concurrency).
      - **Stripe billing go-live** — set `STRIPE_SECRET_KEY`,
        `STRIPE_WEBHOOK_SECRET`, and the plan price IDs (`STRIPE_PRICE_STARTER`,
        `STRIPE_PRICE_GROWTH`). Until then the app stays on the free plan and
        the upgrade button reports "billing not configured."

## Queued AFTER all four phases

- [ ] **Retro-chic UX redesign matched to the logo.**
      Brief: "make it look like a website from the 1990s but modern at the same
      time — retro chic," themed to the PuffPing cloud logo. Apply across the
      marketing site AND the app.

      **Logo palette** (from the supplied mark):
      - Forest / dark green (wordmark "Puff", outlines): ~`#1E5631`
      - Leaf / lime green ("Ping", speech bubble fill): ~`#7AB648` / `#8CC63F`
      - Violet accent (ping/wifi waves, the dot on the "i"): ~`#6C2FD6`
      - Cream cloud background: ~`#F5EFE0`
      - White cloud highlights

      Direction: clean, whitespaced "retro-chic" — chunky rounded display type,
      cream backdrop, soft bevels, tasteful pixel/retro accents used sparingly
      (not full GeoCities kitsch). Keep it legible and modern.

      **Logo asset TODO:** the logo was shared as a chat image, which does not
      land on disk. Drop the real file into `branding/` and copy the
      web-served version to `public/brand/` (e.g. `public/brand/puffping-logo.png`
      + an SVG mark) so the header/sidebar/favicon can reference it.
