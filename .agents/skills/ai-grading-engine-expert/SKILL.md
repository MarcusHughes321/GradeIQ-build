---
name: ai-grading-engine-expert
description: L3 expert on the AI grading engine in Grade.IQ. Knows the Claude prompts, scoring logic, card identification system, variant detection, multi-language support, and AI cost logging. Consult when changing the grading prompt, modifying how cards are identified, adding a new grading company, adjusting scoring logic, or debugging why a card graded incorrectly.
---

# AI Grading Engine — L3 Expert

You know the AI grading system in precise detail — the prompt architecture, scoring logic, how cards are identified, how variants are detected, and how costs are tracked. Every graded card passes through this engine.

---

## Core Architecture: Single Call

One Claude Sonnet call handles both card identification AND condition grading. Do not split these into two sequential calls.

**Why single call:** The grading logic benefits from knowing the card's identity. A Holo card's surface is expected to have holo scatter — that's not a defect. A non-holo card with holo-like shimmer might indicate a printing anomaly. Card identity provides essential context for accurate grading.

**What the single call returns:**
```json
{
  "cardName": "Charizard",
  "setName": "Base Set",
  "setNumber": "4/102",
  "language": "en",
  "variant": "Holo",
  "grades": {
    "psa": 9,
    "bgs": { "overall": 8.5, "centering": 9, "corners": 8, "edges": 8, "surface": 9 },
    "ace": 8,
    "tag": 8,
    "cgc": 9
  },
  "defects": ["light corner wear top-right", "minor surface scratch under holo layer"],
  "confidence": "high"
}
```

---

## Model Selection

| Use case | Model | Why |
|----------|-------|-----|
| Quick Grade | Claude Sonnet 4-6 | High accuracy for vision analysis |
| Deep Grade | Claude Sonnet 4-6 | Same — more photos, same model |
| Crossover Grade | Claude Sonnet 4-6 | Slab analysis needs full accuracy |
| Boundary detection | Claude Sonnet 4-6 | Coordinate precision |
| Collection Scan | Claude Haiku | High volume, lower stakes |
| TCG Advisor chat | Claude Haiku | Conversational, no vision needed |

**Never use Haiku for grading.** It cannot reliably identify cards from photos or assess fine defects.

---

## Deductive Grading Logic

The prompt instructs Claude to:
1. **Start at grade 10** (perfect card assumed)
2. **Deduct for each visible defect** — each defect reduces the grade by a defined amount
3. **Apply leniency for back-only defects** — minor defects on the back (e.g. light scratches) deduct less than equivalent defects on the front, because many grading companies grade the back less strictly
4. **Derive company-specific grades** — PSA, BGS, ACE, TAG, and CGC each have slightly different standards. The prompt encodes these differences so the AI produces different outputs per company from the same analysis

**Deduction scale (approximate):**
- Halo/whitening on corners: -0.5 to -1.5 per corner
- Edge chipping: -0.5 to -1.5 per affected edge
- Surface scratch (visible): -0.5 to -1.0
- Centering off: -0.5 (minor) to -2.0 (severe, >65/35)
- Print defect: -0.5 to -1.5 depending on visibility

---

## Card Identification System

Claude identifies cards using three signals:
1. **Visual appearance** — card artwork, borders, text layout
2. **Text on the card** — name, HP, set number, rarity symbol
3. **Set knowledge context** — provided via `server/pokemon-sets.ts`

### pokemon-sets.ts
This file contains a structured reference of every Pokémon TCG set: EN, JP, KR, and CN. It includes set names, set codes, approximate release dates, and known card counts. This data is injected into the card identification section of the prompt, giving Claude concrete anchors to identify which set a card belongs to even when text is partially obscured.

**Multi-language support:** Claude reads the card text in its original language (JP, KR, CN) but returns all identification fields in English. The `language` field in the response indicates what the card language was detected as.

**Vintage cards:** Identified via set symbols (the small icon on older WOTC-era cards). The prompt references known set symbols from Base Set through Expedition.

---

## Variant Detection

The AI identifies whether a card is:
- **Holo** — foil treatment on the artwork
- **Reverse Holo** — foil treatment on the card border/background, not artwork
- **Non-Holo** — no foil

This detection is done visually from the photo. The result is stored in the grading result and shown as a coloured badge on the results screen.

**When variant affects grading:** Holo cards have expected surface shimmer that is NOT a defect. The prompt explicitly instructs Claude to account for this. Telling it to expect holo shimmer prevents false surface defect deductions.

---

## Deep Grade Modified Prompt

For Deep Grade, the prompt is modified in two ways:
1. **Close-up images are referenced explicitly** — each of the 8 corner close-ups is described by position in the prompt (top-left front, top-right front, etc.)
2. **Close-ups take precedence** — if the flat shot and close-up disagree on corner condition, the close-up is authoritative
3. **Angled shots inform surface/edge analysis** — the prompt instructs Claude to use angled lighting shots to detect surface scratches that flat shots miss

---

## Collection Scan Prompt (Claude Haiku)

The collection scan uses a simplified prompt — no per-company grade breakdown, no sub-grades. Just:
- Card name (best guess from visual)
- Condition label: Mint / Near Mint / Lightly Played / Played / Heavily Played / Damaged
- Approximate raw price (based on card identification)

The condition label maps to the condition multiplier used in pricing:
| Condition | Multiplier |
|-----------|-----------|
| Mint | 100% |
| Near Mint | 95% |
| Lightly Played | 70% |
| Played | 50% |
| Heavily Played | 30% |
| Damaged | 10% |

---

## TCG Advisor Prompt (Claude Haiku)

The TCG Advisor uses Claude Haiku with a market analysis system prompt. Card price data (PokeTrace graded prices + raw price) is injected before the user message. The AI is instructed to:
- Give conversational investment/market advice
- Reference the actual prices provided
- Flag grading economics (is it worth grading at current prices?)
- Note market trends from the price data

This is not a grading prompt — Claude is not analysing images here. It is reasoning about market data.

---

## AI Cost Logging (Required for Every AI Call)

Every Claude call in the codebase MUST log to `ai_cost_log`. This is how the Finance tab shows real AI spend.

```typescript
await logAiCost({
  month: new Date().toISOString().slice(0, 7),  // "YYYY-MM"
  mode: 'quick',  // quick | deep | crossover | collection | deal_advisor
  model: 'claude-sonnet-4-6',
  inputTokens: response.usage.input_tokens,
  outputTokens: response.usage.output_tokens,
  costUsd: calculateCost(model, inputTokens, outputTokens)
});
```

**Cost rates:**
- Claude Sonnet 4-6: $3.00/M input tokens, $15.00/M output tokens
- Claude Haiku: ~$0.25/M input tokens, $1.25/M output tokens

**If you add a new AI feature and forget to log costs, the Finance tab will underreport AI spend. This is not optional.**

---

## Key Files

- `server/routes.ts` — prompt construction, Claude API calls, cost logging
- `server/pokemon-sets.ts` — set reference data injected into identification prompts
- `server/db.ts` — `logAiCost` helper

---

## Common Mistakes to Avoid

- **Never split card ID and grading into two calls** — it breaks the grading context and doubles cost
- **Never use Haiku for grading** — it fails on fine defect detection and card identification from photos
- **Never add a Claude call without logging to `ai_cost_log`** — the finance tab depends on complete data
- **Don't change the deductive prompt structure to an additive one** — starting from 10 and deducting is significantly more consistent than building up from 1
- **Don't remove the Back leniency rule** — many real cards have minor back wear from shuffling; over-penalising it makes grades misleadingly low
