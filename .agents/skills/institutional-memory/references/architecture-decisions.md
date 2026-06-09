---
name: architecture-decisions
description: Key technical decisions in Grade.IQ and the reasoning behind them — why grading, image handling, usage tracking, identity, and the build pipeline work the way they do.
---

# Architecture Decisions

Durable record of *why* Grade.IQ is built the way it is. For how things currently work, defer to the L1 / L3 agents. This file is for rationale and the gotchas that came out of each decision.

---

### Image Transport — Strip the data URI prefix before sending images
**Date:** June 2026
**Decision:** The client sends images to the server as **raw base64 strings** (e.g. `/9j/4AAQ...`), never as a `data:image/jpeg;base64,...` data URI. Every server image endpoint guards with a `startsWith("data:")` check and re-adds the prefix if missing before handing the image to sharp/Claude.
**Why:** Replit's deployment proxy/WAF silently started returning a `403` HTML page (before the request ever reached Express) for any POST whose body contained the literal string `data:image/jpeg;base64,`. Base64 data URIs in POST bodies are a known attack vector, so the WAF flags the pattern. This broke grading overnight with no code change on our side — Replit changed the security layer underneath us.
**Alternatives considered:** Reducing image size (tried first, did nothing — see things-tried.md); moving uploads off the proxy entirely (the long-term S3 direction).
**Watch out for:**
- A 5-byte fake payload with the prefix still triggers the 403 — it is the *pattern*, not the size.
- The server fix and client fix must stay in lockstep. There was a window where the server was updated to accept raw base64 but the client still sent the prefix, so grading stayed broken. If you ever reintroduce the prefix on the client, you break production.
- The 403 is always Replit's bare `<!doctype html>...<title>403</title>` page — if you see HTML instead of JSON from a POST, suspect the proxy/WAF, not Express (Express only ever returns JSON; quota is 429, errors are 500, there is no 403 path in our code).

---

### Image Size — Cap client images at 1024px
**Date:** June 2026
**Decision:** Images are resized to max 1024px on-device before upload. Production had briefly used 2048px (`uploadMaxDim`).
**Why:** Two 2048px JPEGs as base64 JSON come to ~8–12MB, which exceeds Replit's proxy body limit (~10MB) and gets rejected before reaching Express. The server's resize uses `withoutEnlargement: true` and never upscales past 1024px anyway, so Claude sees the same quality either way — there was no benefit to the larger upload.
**Alternatives considered:** Keeping 2048px (rejected — over the proxy limit); raw/uncompressed uploads (blocked by the same limit — see product-evolution.md for the S3 direction).
**Watch out for:** The ~10MB limit only applies to bodies routed *through the proxy to Express*. It is the reason any "send the full raw photo to the server" idea cannot use a plain POST.

---

### Usage Quota — Server-authoritative, with claim-and-clear on the client recorder
**Date:** June 2026
**Decision:** Free-tier grade limits are enforced server-side (returns 429 when exceeded). On the client, the `recordUsage` callback is "claimed and cleared" — captured into a local variable and the ref set to `null` *before* it is invoked — so only the first caller can ever record a usage count.
**Why:** On Android, backgrounding the app during the 30–60s grade wait fires AppState "active", which restarts `startPollingForJob`. In-flight poll requests keep running, so multiple overlapping poll ticks all saw the job "completed" and each called `recordUsage(1)`. A single grade was logged 2–3 times, jumping the count 0→3 instantly and slamming free users into the paywall after one grade.
**Alternatives considered:** Raising the free limit from 3→5 (this was tried as a "fix" and was wrong — the limit was never the problem; see things-tried.md).
**Watch out for:** Any new code path that records usage must respect the same claim-and-clear discipline, or the double-count race comes back. The free limit is deliberately **3** quick grades/month — do not "fix" symptoms by changing it.

---

### Identity — Stable UUID (Keychain + AsyncStorage) as the canonical user key
**Date:** 2026 (pre-existing, reaffirmed June 2026)
**Decision:** A stable UUID generated once on first launch is the canonical identity for history and usage. It is stored in the iOS Keychain (survives reinstall since iOS 10.3+) and AsyncStorage (covered by Android Auto Backup). The RevenueCat anonymous ID is secondary; on startup the stable UUID re-keys/claims existing server rows.
**Why:** The RC anonymous ID changes on reinstall, so anything keyed only to it resets when the user deletes and reinstalls. Free-tier grade counts and grading history both need to survive reinstalls, device switches, and the RC ID churning.
**Alternatives considered:** Keying solely on the RC anonymous ID (rejected — does not survive reinstall).
**Watch out for:** Persistence depends entirely on grades actually *reaching the server*. During the WAF outage, grades never hit the server, so there was nothing to restore on reinstall and history was lost. Server-side persistence is only as good as the write path that feeds it.

---

### Delivery — Kill-safe background grading via DB `delivered` flag + polling
**Date:** 2026 (pre-existing)
**Decision:** Grade jobs run server-side and are persisted to `grading_jobs` with an explicit `delivered` flag keyed by RC user ID. The client polls `GET /api/pending-grades` and acknowledges via `POST /api/grade-job/:id/acknowledge`. Polling (not a held connection) is intentional.
**Why:** The phone should be able to close, be killed, or switch devices mid-grade without losing the result. The server does 100% of the AI work; the phone just checks in periodically. On next launch the completed-but-unacknowledged job is recovered.
**Alternatives considered:** Holding a connection open for the duration of grading (rejected — not kill-safe).
**Watch out for:** Collection scan jobs use a *separate* path that is deliberately **not** kill-safe — acceptable because it is a free feature. Do not assume all job types share the recovery guarantees of grading jobs.

---

### Grading — Single Claude call for identification + condition
**Date:** 2026 (pre-existing)
**Decision:** One Claude Sonnet call both identifies the card (set/number/name, language) and assesses condition (centering, corners, edges, surface) in a single structured response.
**Why:** Simpler, cheaper, and faster than separate identify-then-grade calls; the model has all context in one pass.
**Watch out for:** `detect-bounds` failing/falling back to Sobel is normal and does **not** affect grading — do not mistake Sobel fallback logs for a grading outage. A real grading outage shows up as zero `grade-job` POSTs reaching the server (the WAF signature), not as detect-bounds failures.

---

### Build Pipeline — Android via GitHub Actions, iOS via Replit Expo Launch
**Date:** June 2026
**Decision:** Android AABs are built and submitted to the Play Store internal track by a GitHub Actions workflow in `MarcusHughes321/GradeIQ-build` (triggered on push to main). iOS goes through Replit's Expo Launch (the Publish button) — there is no iOS GitHub workflow.
**Why:** This is the pipeline that exists and works. Android automation lives in the build repo; iOS submission is Replit-managed.
**Alternatives considered:** Running EAS CLI directly (forbidden per project rules — iOS publishing is Expo Launch only).
**Watch out for:**
- Pushing files one at a time triggers a *separate* build per push. Intermediate runs fail on versionCode collisions or `"This Edit has been deleted"` Play API races — **only the last run matters**. Push all changed files together where possible.
- `EXPO_PUBLIC_DOMAIN` is hardcoded in `eas.json` as `grade-iq.replit.app`; every store build calls that URL. If the deployment domain changes, builds break silently.
- Bump versionCode (Android) and buildNumber (iOS) every build, or the store rejects the submission.

---

### Legal — EULA governing law set to England and Wales
**Date:** June 2026
**Decision:** The custom App Store EULA names Marceus Hughes as the individual UK developer and sets governing law to England and Wales.
**Why:** Apple requires apps with auto-renewable subscriptions to expose a Terms of Use / EULA link from the App Store listing (App Information → License Agreement), not just in-app. Using the developer's home jurisdiction (UK) is standard and correct; a vague or foreign jurisdiction could work against an indie developer.
**Watch out for:** This is App Store Connect *metadata*, not a code change — a rejection on this is automated and resubmitting after adding the EULA does not reset the review queue. Support email `support@gradeiq.app` was a placeholder; confirm it is real before relying on it.
