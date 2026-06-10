---
name: Admin settings endpoint must stay password-gated
description: Why all /api/admin/* data/action routes require the admin password (x-admin-password header) and the client adminApiRequest helper that backs it.
---

# Keep admin_settings gated once any field is shown to end users

The `admin_settings` table is read/written through `/api/admin/settings`
(GET + POST). One of its keys (the Home "bulletin") is rendered on EVERY user's
Home screen via the public `/api/bulletin` endpoint.

**Why:** The moment an admin-authored value reaches all users, an unauthenticated
write to `/api/admin/settings` becomes a phishing/defacement vector (anyone could
publish a fake "re-verify your payment" banner). GET also leaks finance settings.
So both verbs require the admin password via an `x-admin-password` header,
matching the body-password pattern used by the other `/api/admin/*` endpoints.

**How to apply:**
- Never add a new public endpoint that surfaces an `admin_settings` field without
  confirming the write path stays password-gated.
- The client never persists the password from the verify step by default — it is
  stored in SecureStore (`lib/admin-auth.ts`) on successful admin verify and
  cleared when admin mode is disabled. Any new admin data call must send the
  header or it will 401.
- **All** `/api/admin/*` data/action routes are now gated by `isAdminRequest`,
  which is hoisted to the **top** of `registerRoutes` so every route shares one
  definition: analytics, financials, settings, `price-flags*`
  (count/list/resolve/apply-fix/manual-prices/respond), `scan-cache`,
  `card-variants*` (GET/POST/PATCH/DELETE/sync-tcgdex), `trigger-picks`,
  `trigger-jp-catalog-sync`.
- Open by design: `POST /api/admin/verify` (the login endpoint).
  `register-device` and `reset-usage` are protected by a **body** `password`
  field (not the header), so they were left untouched. `trigger-picks` /
  `trigger-jp-catalog-sync` ALSO keep a legacy hardcoded `x-admin-secret` header
  check (pre-existing smell, left as-is — they now require BOTH).
- Client: every admin screen calls `adminApiRequest(method, route, data?)` from
  `lib/admin-auth.ts`, which injects the `x-admin-password` header and throws a
  friendly "session expired" error on 401. It mirrors `apiRequest` from
  query-client (returns the raw Response), so it is a drop-in on admin endpoints.
  The Home-tab/Settings price-flags badge count is gated on admin mode, so the
  stored password is always present when it fires.
