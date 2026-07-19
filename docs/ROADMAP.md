# PuffPing build roadmap

Living checklist for the current work stream. Update as phases land.

## Feature phases (in order)

- [x] **Phase 1 — Scheduling & Automations**
      Scheduled campaigns + a background scheduler; keyword-triggered
      auto-responders and multi-step drip sequences (`/automations`).
- [ ] **Phase 2 — Link tracking & short links**
      Rewrite URLs in outbound campaigns to short `/l/<code>` links; log
      per-contact clicks; surface click-through rate on campaigns + dashboard.
- [ ] **Phase 3 — Segments & suppression**
      Saved audience segments (tags / field / engagement filters) resolved at
      send time; a suppression / DNC list auto-excluded from every send.
- [ ] **Phase 4 — Go multi-tenant for real**
      Session-driven `resolveTenant()`, team invites + roles, Stripe
      usage-based billing. **Migrate SQLite → Postgres as the first step here.**

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
