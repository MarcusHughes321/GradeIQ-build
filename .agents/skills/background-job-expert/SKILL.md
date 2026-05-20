---
name: background-job-expert
description: L3 expert on the background job system in Grade.IQ. Knows the grading_jobs and collection_jobs tables, client polling, kill-safe delivery, acknowledgement flow, and AppState-based polling resumption. Consult when changing how grading jobs are created, delivered, or recovered, or when adding a new type of background job.
---

# Background Job System — L3 Expert

You know the background job system end-to-end. This system is one of the most critical pieces of infrastructure in Grade.IQ — it ensures grading results are never lost, even if the user kills the app mid-grade, reinstalls, or switches devices.

---

## Why a Background Job System?

Grading takes 15–45 seconds. Without a job system:
- If the user switches to another app, the HTTP request keeps running but the result has nowhere to go
- If the user kills the app, the result is permanently lost
- If the server restarts mid-grade, the result is lost

The job system decouples the HTTP request that starts the grade from the result delivery. The result is stored server-side until the client explicitly acknowledges it.

---

## grading_jobs Table

```sql
CREATE TABLE grading_jobs (
  id          TEXT PRIMARY KEY,          -- UUID
  rc_user_id  TEXT NOT NULL,             -- RevenueCat anonymous user ID at time of grading
  stable_user_id TEXT,                   -- Stable UUID (set when available)
  status      TEXT NOT NULL,             -- 'pending' | 'processing' | 'completed' | 'failed'
  mode        TEXT NOT NULL,             -- 'quick' | 'deep' | 'crossover' | 'bulk'
  result      JSONB,                     -- Grading result (null until completed)
  error       TEXT,                      -- Error message (null unless failed)
  delivered   BOOLEAN NOT NULL DEFAULT false,  -- Has client acknowledged?
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**`delivered` flag is the kill-safe mechanism.** A row stays in this table with `delivered = false` until the client explicitly acknowledges it. The `GET /api/pending-grades` endpoint returns all rows where `delivered = false` and `status = 'completed'` for a given user.

---

## Full Job Lifecycle

### 1. Job creation
Client sends grade request → server starts processing → immediately creates a `grading_jobs` row with `status = 'pending'` → returns `{ jobId }` to client.

The client does not wait for the grade to finish — it gets the job ID immediately and starts polling.

### 2. Server processing (async)
The grade runs asynchronously after the response is sent. When complete:
- `status` → `'completed'`
- `result` → grading result JSON
- `updated_at` → now

On failure:
- `status` → `'failed'`
- `error` → error message

### 3. Client polling
`GET /api/grade-job/:id`

Returns the current job row. Client polls every 2–3 seconds while the app is in the foreground.

**Poll response states:**
- `{ status: 'pending' | 'processing' }` → keep polling
- `{ status: 'completed', result: {...} }` → deliver result
- `{ status: 'failed', error: '...' }` → show error

### 4. Kill-safe recovery
On every app launch: `GET /api/pending-grades?rcUserId=X&stableUserId=Y`

Returns all completed-but-unacknowledged jobs for this user. The client processes these exactly like a polled result — navigates to the results screen and saves the result locally.

**Both identifiers are checked** — `rc_user_id` OR `stable_user_id` match returns the row. This handles the case where the user reinstalled (new RC ID) but has the same stable UUID.

### 5. Acknowledgement
After the client has fully processed and saved a result:

`POST /api/grade-job/:id/acknowledge`

Sets `delivered = true`. This row will no longer appear in `GET /api/pending-grades`.

**Critical:** Only call acknowledge after the result is saved to AsyncStorage. If acknowledge is called prematurely and the app crashes before saving, the result is permanently lost.

---

## AppState Polling Resumption

When the app is merely backgrounded (not killed), `AppState` change events fire.

```typescript
AppState.addEventListener('change', (state) => {
  if (state === 'active' && pendingJobId) {
    startPolling(pendingJobId);
  }
});
```

This resumes polling when the user returns to the app. Without this, a user who backgrounds the app mid-grade would return to find nothing had happened even though grading completed.

**AppState vs kill:** AppState 'active' fires when the app returns from background. A killed app does not fire AppState events — that's what `GET /api/pending-grades` on launch handles.

---

## Bulk Job Handling

Bulk grades (up to 20 cards) use the same `grading_jobs` table but the `result` field contains an array:

```json
{
  "cards": [
    { "cardIndex": 0, "cardName": "Charizard", "grades": {...} },
    { "cardIndex": 1, "cardName": "Blastoise", "grades": {...} }
  ]
}
```

Each card is processed in parallel server-side. The job `status` only moves to `'completed'` when all cards in the batch have finished (or failed).

---

## collection_jobs Table

Collection Scan uses a separate job system with a different schema — results are written per-card as they complete, rather than as a single batch result.

```sql
CREATE TABLE collection_jobs (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL,
  status    TEXT NOT NULL,     -- 'pending' | 'processing' | 'completed'
  cards     JSONB NOT NULL,    -- Array of { front, back, result } objects
  created_at TIMESTAMPTZ
);
```

The client polls `GET /api/collection/job/:jobId`. Individual card results are written to `cards[n].result` as they complete. This allows the results screen to show partial results while processing continues.

Individual card updates: `PUT /api/collection/job/:jobId/card/:idx`.

**collection_jobs does NOT have a `delivered` flag.** Collection Scan results are not kill-safe — if the user kills the app mid-scan, they lose the partial results. This is an acceptable trade-off for a free feature (not grading-critical data).

---

## Key Files

- `server/routes.ts` — job creation, status endpoint, pending-grades, acknowledge, collection job endpoints
- `app/(tabs)/index.tsx` — pending-grades check on launch, AppState listener
- `app/(tabs)/grade.tsx` — job ID storage, polling logic

---

## Common Mistakes to Avoid

- **Never skip the `delivered` flag** for any new grading job type — kill-safe delivery depends on it
- **Never call `acknowledge` before the result is locally saved** — premature acknowledgement causes permanent data loss
- **Check both `rc_user_id` AND `stable_user_id`** in pending-grades query — checking only one breaks recovery after reinstall
- **Don't re-use the grading_jobs table for collection scan** — collection scan has different result shape and different acknowledgement requirements; keep it in `collection_jobs`
- **Bulk job status is all-or-nothing** — don't set `status = 'completed'` until all cards in the batch have finished processing
