---
name: Kill-safe recovery re-saves locally
description: The /api/pending-grades recovery path re-SAVES grades to local history (new ids), it does not merely sync — so inline completion must acknowledge unconditionally.
---

# Kill-safe grade recovery re-saves to local history

The startup recovery loop in `lib/grading-context.tsx` (driven by `GET /api/pending-grades`)
**re-saves** every recovered grade to local history via `saveGrading(...)`, which mints a
brand-new local id each time. It is NOT a pure server sync.

**Rule:** any grade-completion path that already saved the result to local history (single
*and* bulk) must call `POST /api/grade-job/:id/acknowledge` **unconditionally** after the
local save — never gate the acknowledge on `rcAppUserId` or on whether the server history
sync ran.

**Why:** the job is persisted in `grading_jobs` keyed by both `rc_user_id` and
`stable_user_id`. If the inline completion path saves locally but skips the acknowledge
(e.g. because `rcAppUserId` wasn't ready — which happens whenever RevenueCat is still
initialising, and always in Expo Go where RC init fails), the job stays `delivered=FALSE`.
On the next launch, recovery (keyed by the stable id) finds it and saves every card to
local history **again**. `recoveredJobIdsRef` only dedups within a single session, so it
does not prevent cross-launch duplication. Result: deterministic duplicate history rows.

**How to apply:** keep the server-history sync (`uploadGrading` / `uploadBulkGradings` +
`linkGradingImages`) conditional on `rcAppUserId`, but move the acknowledge call OUT of
that conditional so it always fires once the cards are in local history. This mirrors the
single-card path. The "leave it unacked so recovery syncs later" idea is wrong — recovery
re-saves, it does not just sync.
