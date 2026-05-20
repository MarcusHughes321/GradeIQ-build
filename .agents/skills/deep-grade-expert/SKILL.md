---
name: deep-grade-expert
description: L2 expert on the Deep Grade flow in Grade.IQ. Knows the 12-16 photo pipeline, server-side image enhancement, modified AI prompt, and Pro subscription gating. Consult when building anything that changes the Deep Grade photo capture, image enhancement pipeline, AI accuracy for premium grades, or Deep Grade usage limits.
---

# Deep Grade Flow — L2 Expert

You know the Deep Grade flow end-to-end. Deep Grade is the premium accuracy grading mode — 12 to 16 photos instead of 2, server-side image enhancement before AI analysis, and a modified prompt that weights corner and edge close-ups more heavily.

---

## What Makes Deep Grade Different from Quick Grade

| Aspect | Quick Grade | Deep Grade |
|--------|-------------|------------|
| Photos | 2 (front + back) | 12–16 |
| Image enhancement | None | Sharpening, brightness, contrast boost |
| AI prompt | Standard | Modified — greater weight on corner/edge close-ups |
| Subscription gate | Free (3/month) | Pro only |
| Usage tracked by | `recordUsage` | `recordDeepUsage` |
| Remaining shown by | `remainingGrades` | `remainingDeepGrades` |
| Monthly limits | 3 / 15 / 50 / unlimited | 0 / 2 / 7 / 30 |

---

## Full Flow

### 1. Entry
`app/(tabs)/grade.tsx` — "Deep Grade" card in the PRO section.

Gate check: `isGateEnabled && !canDeepGrade && !isAdminMode` → show lock pill + redirect to `app/deep-grade-info.tsx`.

The info screen explains what Deep Grade is and what photos are needed before the user starts capturing.

### 2. Photo set — 12 to 16 photos

Required photos (in order):
1. Front — full card, flat
2. Back — full card, flat
3. Front angled — left-side light (catches edge and surface under angled light)
4. Front angled — right-side light
5. Front angled — top-down
6. Back angled — left-side light
7–14. Corner close-ups — 4 corners × front + back (8 total)

Optional (brings total to 16):
15. Front at 45° angle
16. Back at 45° angle

The UI guides the user through each photo with an indicator showing which shot is next. Each capture is previewed before the user confirms and moves to the next.

### 3. Server: image enhancement (`POST /api/deep-grade-job`)
Before the images are sent to Claude, the server runs an enhancement pipeline on each photo:
- **Sharpening** — increases definition of edges, corners, and surface texture
- **Brightness adjustment** — lifts shadows to reveal surface scratches
- **Contrast boost** — makes subtle defects more visible to the AI

This enhancement runs on all photos in the set. The order (enhancement before AI, not after) is important — Claude analyses the enhanced versions.

### 4. AI grading — modified prompt
Same single-call architecture as Quick Grade (card ID + grading together), but the prompt is modified:
- Corner close-up images are explicitly referenced and weighted more heavily
- The AI is instructed to reconcile any differences between the flat shot and the close-ups (close-ups take precedence for corner/edge grades)
- Surface analysis draws from both the flat front and the angled shots

The AI returns the same output shape as Quick Grade (grades for all 5 companies, sub-grades, defects) but with higher accuracy, especially for corners and edges.

### 5. Background job and delivery
Identical to Quick Grade — background job in `grading_jobs` table, client polling, kill-safe recovery via `GET /api/pending-grades`. Same `acknowledge` flow.

### 6. Results screen
Same `app/results.tsx` as Quick Grade. The result shape is identical — the Deep Grade modifier is purely on the input side (more photos, enhancement, better prompt). The output displayed to the user looks the same.

### 7. Usage recording
`recordDeepUsage()` from `useSubscription()`. Separate counter from Quick Grade. Checks against `deepGradeLimit` for the user's tier.

---

## Subscription Limits

| Tier | Deep Grade limit |
|------|-----------------|
| Free | 0 (not available) |
| Grade Curious | 2/month |
| Grade Enthusiast | 7/month |
| Grade Obsessed | 30/month |

Remaining count shown in the hub card: `remainingDeepGrades` from `useSubscription()`.

---

## Key Files

- `app/deep-grade-info.tsx` — info/onboarding screen
- `app/(tabs)/grade.tsx` — hub entry, gate check
- `app/results.tsx` — result display (shared with Quick Grade)
- `lib/subscription.tsx` — `canDeepGrade`, `recordDeepUsage`, `remainingDeepGrades`

---

## Common Mistakes to Avoid

- **Don't reuse the Quick Grade prompt** — Deep Grade has its own modified prompt that references close-up images. Using the standard prompt wastes the extra photos.
- **Enhancement runs before Claude, not after** — the AI must see the enhanced images, not the originals.
- **Usage tracking is separate** — use `recordDeepUsage` not `recordUsage`. Mixing them corrupts both counters.
- **The info screen is not optional** — first-time users need to understand the 12-photo requirement before starting. Don't remove or skip it.
