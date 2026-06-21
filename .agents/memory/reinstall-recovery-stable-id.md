---
name: Reinstall recovery anchored on stable UUID
description: Why reinstall persistence (history + free-tier credits + pending grades) must be decoupled from RevenueCat and keyed on the stable UUID, and how recovery stays idempotent.
---

# Reinstall recovery must not depend on RevenueCat init

**Rule:** All reinstall-survivable recovery (server usage sync, history sync, pending-grade recovery) must be anchored on the **stable UUID** (iOS Keychain + AsyncStorage) and must run independently of RevenueCat. Load the stable UUID once at provider mount and kick off read-recovery immediately; only run the write/link steps that genuinely need the RC id (history `claim`, image upload, retroactive upload) after the RC id resolves.

**Why:** Recovery logic used to live *inside* `initRevenueCat`, after an awaited `Purchases.getCustomerInfo()`. Any RC failure/timeout skipped ALL recovery, so reinstalled users lost history and saw free-tier credits reset. RC can fail or be slow in production; recovery cannot be hostage to it.

**Why (credits flash):** An RC-only-first `syncServerUsage(rcUserId)` returns 0 on a fresh reinstall (no rows under the new RC id yet), which briefly flashed credits to "full" before the stable-id sync corrected it. Sync usage with the stable id first. `syncServerUsage` only ever RAISES the local count (server > local wins), so a reinstall with local=0 restores the real server count.

## Pending-grade recovery is idempotent by design
- Server keys completed jobs on BOTH `rc_user_id` and `stable_user_id` (partial indexes); `/api/pending-grades` matches `rc_user_id OR stable_user_id`.
- The client pending-grades effect deps are `[rcAppUserId, stableUserId]`, so it fires twice on a normal launch (stable id resolves first, RC id later). Each recovered job is saved with a fresh random local id, so without guards this duplicates history.
- **How to apply:** keep two guards in the effect — an in-flight ref (no overlapping runs) AND a per-session `Set<job.id>` so a given server job is recovered at most once. Acknowledge (`POST /api/grade-job/:id/acknowledge`) is fire-and-forget and may not commit before the second run's fetch, so the dedupe set — not the ack — is the real defense against duplicates.

## Deliberately deferred (do not "fix" without weighing risk)
- `Purchases.logIn(stableId)` to unify RC identity across reinstalls: high-risk for paying users, unverifiable in Expo Go, and redundant once recovery is keyed on the stable id.
- Android device-id (SSAID via expo-application) fallback in `getStableUserId`: Android already restores AsyncStorage via the Auto Backup plugin (`plugins/withAndroidBackup`), and adding a native module through the npm-based package tool risks an SDK-version mismatch (no `expo install` resolution). The reported bug was iOS-only.
