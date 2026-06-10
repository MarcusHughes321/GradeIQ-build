---
name: Admin settings endpoint must stay password-gated
description: Why the admin_settings read/write endpoints require the admin password, and the client storage that backs it.
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
- Residual gap (not yet closed): `/api/admin/financials` and
  `/api/admin/analytics` are still unauthenticated and leak revenue/usage data.
