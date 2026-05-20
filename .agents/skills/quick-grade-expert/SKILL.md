---
name: quick-grade-expert
description: L2 expert on the Quick Grade and Bulk Grade flows in Grade.IQ. Knows the full journey from tapping "Quick Grade" in the hub through camera capture, server processing, AI grading, background job delivery, and results display. Also covers Bulk Grade (up to 20 cards). Consult when building anything that touches grading modes, the camera flow, grading results, progress UI, or background job delivery.
---

# Quick Grade & Bulk Grade Flow — L2 Expert

You know the Quick Grade and Bulk Grade flows end-to-end. When someone asks how to add something to the grading flow, extend the results screen, change what gets graded, or modify the job system, you give precise guidance rooted in how the flow actually works today.

---

## Quick Grade — Full Flow

### 1. Entry point
`app/(tabs)/grade.tsx` — the Features hub. User taps the "Quick Grade" card in the FREE section. No subscription gate — free users get 3/month.

Before starting, the app checks usage: `canGrade` from `useSubscription()`. If the monthly limit is hit and `isGateEnabled && !isAdminMode`, show the paywall.

### 2. Camera capture
Two photos required: front then back. Uses `expo-image-picker` or the device camera. Images are captured as URIs on device, then converted to base64 or sent as multipart form data to the server.

Photo order matters: front photo is the primary grading surface, back is secondary. The AI grades corners and edges on both.

### 3. Server: image preparation (`POST /api/grade-card`)
Server receives the images and runs in sequence:
1. **HEIF/HEIC conversion** — iOS live photos may arrive as HEIC. Converted via `heif-convert` before any processing.
2. **Resize** — max 1024px on longest side. Larger images don't improve AI accuracy and increase latency.
3. **JPEG compression** — reduces payload size for Claude.
4. **Boundary detection** — Claude Sonnet detects outer card edges and inner artwork bounds. Sobel gradient fallback if Claude returns invalid coords.
5. **Auto-crop with padding** — image cropped to detected card bounds.
6. **Base64 encode** — for Claude's vision API.

### 4. AI grading — single Claude Sonnet call
One call handles both card identification AND condition grading. Do not split these into two calls — the grading logic benefits from knowing the card identity (e.g. holo vs non-holo changes how surface marks are assessed).

**What the AI returns:**
- Card name, set name, set number, language
- Variant: Holo / Reverse Holo / Non-Holo
- Overall grades for PSA, BGS, ACE, TAG, CGC
- BGS sub-grades: Centering, Corners, Edges, Surface (each 1–10)
- Confidence level
- Key defects observed

### 5. Background job creation
The grade call is wrapped in the background job system:
- Server creates a row in `grading_jobs` table with `delivered: false`
- Returns `{ jobId }` to client immediately
- Client stores `jobId` and begins polling

This means grading survives app kills. Do not bypass the job system for "faster" direct responses — it will break kill-safe delivery.

### 6. Client polling
`GET /api/grade-job/:id` — client polls every 2–3 seconds while app is in foreground.

AppState "active" event resumes polling when the app returns from background (was merely backgrounded, not killed).

### 7. Kill-safe recovery
On every app launch: `GET /api/pending-grades?rcUserId=X&stableUserId=Y` — returns any completed jobs where `delivered = false`.

This is the recovery path for jobs completed while the app was killed. The client processes these exactly like a polled result.

After processing: `POST /api/grade-job/:id/acknowledge` — sets `delivered = true`. Call this ONLY after the result has been fully saved locally.

### 8. Result delivery
Completed result navigates to `app/results.tsx`. The Home tab badge turns green. Tapping the Home tab also triggers result delivery if the user doesn't navigate there directly.

### 9. Results screen (`app/results.tsx`)
Displays:
- Card name, set, number, language
- Variant badge (Holo / Reverse Holo / Non-Holo) — coloured pill
- Grades for each selected company (user toggles which companies to show in Settings)
- BGS sub-grades breakdown
- Key defects noted by AI
- Raw market price (from `card_catalog`)
- "View Profit" button → deeplinks to `app/card-profit.tsx`
- Share button → branded shareable card image via `react-native-view-shot` + `expo-sharing`

### 10. Usage recording
After a successful grade: `recordUsage()` from `useSubscription()`. This increments the monthly count on the server, keyed to `stable_user_id`. The count is checked against the tier limit on the next grade attempt.

---

## Bulk Grade Flow

### Entry
`app/(tabs)/grade.tsx` — the "Bulk Grade" card in the PRO section. Gated: `isGateEnabled && !canBulk && !isAdminMode`.

Info screen: `app/bulk-info.tsx` — explains bulk grading before starting.

### Flow
`app/bulk.tsx` — user adds cards one by one, up to 20. Each card added = front + back photos captured. Cards shown as a list with thumbnails.

On submit: `POST /api/bulk-grade-job` — all card image pairs sent together.

Server processes each card through the same pipeline as Quick Grade, in parallel.

### Result
`app/bulk-results.tsx` — shows all results in a scrollable list. Each card has its own result row. Tapping a card expands to full result detail (same data as Quick Grade results).

### Key difference from Quick Grade
Bulk submits all images in one job. There is no per-card polling — the entire batch completes as one job, then all results deliver at once.

---

## Progress UI

Both Quick Grade and Bulk Grade show an animated progress bar during grading. Stages are mode-specific:

**Quick Grade stages:** Preparing images → Detecting card → Analysing condition → Finalising grades

**Deep Grade stages (for reference):** Preparing images → Enhancing photos → Detecting edges → Analysing corners → Analysing surface → Finalising grades

The progress bar is visual only — it does not reflect actual server progress. It animates on a timer calibrated to typical grading duration.

---

## Subscription Gating in This Flow

| Feature | Gate |
|---------|------|
| Quick Grade (1–3/month) | No gate |
| Quick Grade (beyond free limit) | `!canGrade` → paywall |
| Bulk Grade | `!canBulk` → lock pill + paywall |
| Deep Grade | `!canDeepGrade` → lock pill + deep-grade-info |

---

## Share Results

From `results.tsx`, users can share a branded card image:
- Generated via `react-native-view-shot` (captures a styled View as an image)
- Shared via `expo-sharing`
- Supports multiple formats/aspect ratios for different social platforms
- Includes Grade.IQ logo and all grading details

**Platform check required:** `expo-sharing` has no web support. Wrap in `Platform.OS !== 'web'` check.

---

## Key Files

- `app/(tabs)/grade.tsx` — hub entry, mode selection, gating
- `app/results.tsx` — result display
- `app/bulk.tsx` — bulk card capture
- `app/bulk-results.tsx` — bulk result display
- `app/bulk-info.tsx` — bulk info/onboarding
- `lib/subscription.tsx` — `canGrade`, `canBulk`, `recordUsage`

---

## Common Mistakes to Avoid

- **Don't bypass the job system** for faster delivery — kill-safe delivery depends on it
- **Don't call `acknowledge` prematurely** — only after the result is locally saved
- **Don't use `expo/fetch` for POST requests in grading screens** — use standard `fetch` or `XMLHttpRequest`
- **Don't add a new grading mode without adding it to `ai_cost_log`** — all AI calls must be logged
- **Photo order matters** — always front first, back second
