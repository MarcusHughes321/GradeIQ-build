---
name: history-expert
description: L2 expert on the Grading History flow in Grade.IQ. Knows the stable UUID system, local AsyncStorage storage, bidirectional server sync, photo backup to Object Storage, and reinstall recovery. Consult when building anything that changes how grading results are stored, synced, displayed, or recovered after reinstall.
---

# Grading History Flow — L2 Expert

You know the Grading History flow end-to-end. History is the user's most personal data — every grade they've ever run. Getting this flow wrong causes real frustration, so it has multiple layers of redundancy: local storage, server sync, photo backup, and reinstall recovery.

---

## Identity: The Stable UUID

Everything in the history flow is keyed to the **stable UUID** — not the RevenueCat anonymous user ID, not the device ID.

**Why:** RevenueCat generates a new anonymous ID on reinstall. Using it as the history key means history disappears on reinstall.

**How the stable UUID works:**
- Generated once on first app launch using `Crypto.randomUUID()` from `expo-crypto`
- Stored in iOS Keychain (`expo-secure-store`) — survives reinstall on iOS
- Also stored in AsyncStorage as fallback — covered by Android Auto Backup / Google Drive
- File: `lib/stable-user-id.ts`

**On startup, the app loads the stable UUID and passes it to all server calls** that involve history or usage tracking.

---

## Local Storage

History items are stored locally in AsyncStorage, managed via `lib/storage.ts`.

Each `SavedGrading` object includes:
- `id` (local UUID)
- `stableId` (the stable UUID)
- `rcUserId` (RevenueCat anonymous ID at time of grading)
- All grade results (grades per company, sub-grades, card name, set, etc.)
- `frontImageUri` / `backImageUri` — local device file paths
- `frontImageUrl` / `backImageUrl` — server/Object Storage URLs (populated after backup)
- `createdAt` timestamp

**Image fallback:** When rendering history, always prefer local URI first. Fall back to server URL if local URI is empty (happens after reinstall).

---

## Server Sync

History syncs bidirectionally on startup. Managed in `lib/subscription.tsx` as part of the startup sequence.

### Claim flow (reinstall recovery)
`POST /api/history/claim` — sends `{ stableId, rcUserId }`.

The server re-keys any existing `grading_history` rows that have the old RC user ID but match this stable ID. This is how history survives a reinstall: the stable UUID identifies the same person even though RC gave them a new anonymous ID.

### Bulk upload (new items)
`POST /api/history/bulk` — sends all local history items not yet on the server.

### Pull from server
`GET /api/history?stableId=X` — fetches all history rows for this stable ID. Merged with local history. Server is the source of truth for items added on other devices.

### Delete propagation
When a user deletes a history item locally, the deletion is sent to `DELETE /api/history/:id`. The item is removed from both local storage and the server.

---

## Photo Backup

Front and back card photos are backed up to Replit Object Storage (`.private` bucket).

### Upload trigger
After a grading result is saved locally, `uploadGradingImages()` is called (from `lib/server-history.ts`). This fires async and does not block the UI.

**Photo spec:** Images resized to 400px wide, JPEG at 60% quality before upload. This balances storage cost against sufficient quality to recognise the card on reinstall.

### Storage path
Each image stored at a path based on the grading UUID: `{stableId}/{gradingId}/front.jpg` and `{stableId}/{gradingId}/back.jpg`.

### Recovery on reinstall
After pulling history from the server, image URLs (`front_image_url`, `back_image_url`) are present in the DB rows. The client updates local `SavedGrading` objects with these URLs.

When rendering: if `frontImageUri` is empty (local file gone after reinstall), display `frontImageUrl` (the Object Storage URL served via `GET /api/grading-image/:uuid`).

### Retroactive upload
On startup, `retroactiveImageUpload()` runs for users who had history before photo backup was introduced. It uploads up to 30 items that have local images but no server URL. Fire-and-forget — doesn't block startup.

---

## Home Tab Display (`app/(tabs)/index.tsx`)

The Home tab shows:
- Recent grading history list (most recent first)
- Each item: card name, grade, date, thumbnail image
- Active job indicator (red dot on tab) while grading is running
- Completed job indicator (green dot on tab) when a result is ready

Tapping a history item opens the full result in `app/results.tsx`.

Deleting a history item: swipe-to-delete or trash icon. Triggers local delete + server delete.

---

## Startup Sequence (Order Matters)

The history sync runs in a specific order to avoid race conditions:

1. `syncServerUsage(rcUserId)` — sync usage counts using RC user ID immediately
2. Load stable UUID from Keychain/AsyncStorage
3. `syncServerUsage(stableUserId)` — sync again with stable ID (overrides RC-keyed count)
4. `claimHistoryForStableId(stableId, rcUserId)` — re-key any history rows
5. `fetchServerHistory(stableId)` — pull history from server
6. `uploadBulkGradings(local, server)` — push any local items not on server
7. `retroactiveImageUpload()` — upload missing photos (fire-and-forget)

**Don't reorder these steps.** The stable UUID must be loaded before any stable-ID-keyed operation.

---

## Key Files

- `lib/stable-user-id.ts` — UUID generation and Keychain/AsyncStorage storage
- `lib/storage.ts` — local AsyncStorage operations for `SavedGrading`
- `lib/server-history.ts` — server sync functions (claim, fetch, upload, image backup)
- `lib/subscription.tsx` — startup sequence orchestration
- `app/(tabs)/index.tsx` — history display, job indicator
- `server/objectStorage.ts` — Object Storage upload/download

---

## Common Mistakes to Avoid

- **Never key history to RC anonymous user ID alone** — it changes on reinstall
- **Always fall back to server image URL** — local file paths don't survive reinstall
- **Don't skip the claim step** — without it, a reinstalled user appears as a new user with no history
- **Retroactive upload is fire-and-forget** — never await it in the startup sequence
- **Deletes must propagate to server** — local-only deletes reappear after the next sync
