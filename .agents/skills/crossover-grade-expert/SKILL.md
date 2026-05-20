---
name: crossover-grade-expert
description: L2 expert on the Crossover Grade flow in Grade.IQ. Knows the slab photo mode, cert number lookup (ACE/BGS/TAG, Pro only), slab detection using aspect ratio, and the distinction between free and Pro crossover access. Consult when building anything that changes the crossover grading flow, adds a new grading company's cert lookup, or modifies slab image analysis.
---

# Crossover Grade Flow — L2 Expert

You know the Crossover Grade flow end-to-end. Crossover Grade is for cards that are already in a grading slab — the user wants to know what grade a different company would give their card, or whether it's worth cracking out and re-submitting elsewhere.

---

## What Crossover Grade Does

A graded slab contains a card that has already been assessed by one company (e.g. PSA 9). The user photographs the slab, and the AI:
1. Detects the physical card inside the slab (not the slab itself)
2. Grades the card's condition as if it were raw
3. Shows estimated grades for all other companies

Use cases: "Would this PSA 9 be a BGS 9.5?" or "Is this ACE 8 worth cracking for a PSA 10 pop?"

---

## Full Flow

### 1. Entry
`app/(tabs)/grade.tsx` — "Crossover Grade" card in the hub.

Gate structure:
- **Photo mode** (free): `isGateEnabled && !isSubscribed` → locked, but crossover is available with photos at a lower tier? Actually: free users get 0 crossover grades. The `crossoverGradeLimit` for free is 0. Gate check: `isGateEnabled && !canCrossover && !isAdminMode` → lock pill + info screen.
- **Cert lookup** (Pro): additional gate within the crossover flow for cert lookup specifically.

Info screen: `app/crossover-info.tsx` — explains what crossover grading is and what photos are needed.

### 2. Photo mode (all subscribed users)
User photographs the slab — one photo of the front of the slab is the minimum. The card is visible through the slab's clear case.

**Slab detection** — different from raw card detection:
- Uses aspect ratio analysis to locate the physical card within the slab
- The slab itself has a distinctive shape (label at top, clear window for card)
- AI (Claude Sonnet) locates the physical card top using the label-to-card boundary
- Standard edge detection doesn't work on slabs because the slab edges are not the card edges

### 3. Cert number lookup (Pro only)
Available for: **ACE Grading, BGS (Beckett), TAG**. Not available for PSA or CGC.

User enters the cert number printed on the slab. Server looks up the cert via web scraping:
- **ACE:** `acegrading.com` — accessible via curl with browser User-Agent header
- **BGS:** `beckett.com` — requires a live browser session (Playwright). **Known limitation: this is unreliable.** BGS cert lookup may fail depending on site changes.
- **TAG:** accessible via server-side fetch

Cert lookup returns: the card's actual recorded grade and sub-grades from the grading company's database. This gives the AI more precise information about the card's condition than photos alone.

**PSA cert lookup is not implemented** — PSA's API requires a paid key. Photo-only for PSA slabs.
**CGC cert lookup is not implemented** — not a current priority.

### 4. AI grading
Same Claude Sonnet call as Quick Grade, but:
- The slab detection coordinates are used for cropping instead of standard card boundary detection
- If cert data was retrieved, it's included in the prompt as ground-truth context
- The AI is instructed to assess the card's condition as if it were raw, ignoring the slab

### 5. Background job and delivery
Identical to Quick Grade — `grading_jobs` table, polling, kill-safe recovery.

### 6. Results
Same `app/results.tsx`. If cert lookup was used, the actual recorded grade from the grading company is shown alongside the AI estimate.

### 7. Usage recording
`recordCrossoverUsage()` from `useSubscription()`. Separate counter from Quick and Deep Grade.

---

## Subscription Limits

| Tier | Crossover limit |
|------|----------------|
| Free | 0 |
| Grade Curious | 10/month |
| Grade Enthusiast | 25/month |
| Grade Obsessed | Unlimited |

---

## Key Files

- `app/crossover-info.tsx` — info/onboarding screen
- `app/(tabs)/grade.tsx` — hub entry, gate check
- `app/results.tsx` — result display
- `lib/subscription.tsx` — `canCrossover`, `recordCrossoverUsage`, `remainingCrossoverGrades`

---

## Known Limitations

- **BGS cert lookup is fragile** — Beckett's site requires a browser session. The implementation uses server-side Playwright, which can break when Beckett updates their site. If cert lookup for BGS fails, fall back to photo-only gracefully.
- **PSA cert lookup not available** — PSA requires a paid API. Users with PSA slabs must use photo mode.
- **Slab detection accuracy** — cards in heavily scratched or cloudy slabs may confuse the boundary detection. The AI handles most cases but very damaged slabs can produce poor results.

---

## Common Mistakes to Avoid

- **Don't use standard card boundary detection for slabs** — the slab edges are not the card edges. Use the aspect-ratio slab detection path.
- **Cert lookup is additive, not required** — the flow works without cert data. Never make cert lookup a blocking step.
- **Usage tracking is separate** — use `recordCrossoverUsage` not `recordUsage`.
