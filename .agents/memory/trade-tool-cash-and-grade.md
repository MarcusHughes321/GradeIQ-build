---
name: Trade-eval tool needs cash + grade as first-class inputs
description: Why the AI deal/trade evaluator hallucinated cards and mispriced graded cards, and the contract that fixes it
---

# Trade/purchase evaluation tool design

The TCG Advisor `evaluate_trade` tool (in `/api/pokemon-chat`) originally modelled only `{ gave: string[], received: string[] }`. Two failure modes followed:

1. **Phantom card on the empty side.** When the user described a pure cash purchase ("I got A and B for £1275"), the model invented a junk card (e.g. "Whiscash") to fill the `gave` array, because the schema gave it no other way to represent the money and a one-sided trade felt "incomplete" to it.
2. **Raw price for graded cards.** With no grade field, every card was priced from the raw catalog price even when the user clearly said "PSA 10", massively understating value.

**The fix / rule:** a trade or purchase evaluator must treat **cash** and **grade** as first-class, explicit inputs — never something the model has to encode inside the card list.

**Why:** an LLM filling a required-but-empty structured field will fabricate plausible-looking data rather than leave it blank. Remove the structural incentive (make cash its own field, make only the truly-required side required) and the hallucination stops. Confirmed: after adding `gaveCash`/`receivedCash`/`grade` and a prompt that explicitly forbids inventing cards, the phantom card never reappeared across tests.

**How to apply:**
- Schema: per-side cash fields + a `grade` field; require only the side that must exist.
- Prompt: explicitly forbid inventing cards; tell the model to put money in the cash field and keep grade OUT of the card-name search query (it pollutes keyword matching).
- Pricing: map the grade string → an `EbayAllGrades` tier key and price via `fetchEbayGradedPrices`; fall back to raw catalog price ONLY when no grade is given. Keep the grade→tier map covering **every** tier the price fetcher returns (psa10/9/8/7, bgs10/9.5/9/8.5/8, ace/tag 10/9/8, cgc10/9.5/9/8) — a partial map silently reverts unmapped grades (e.g. "BGS 10") to raw, which is badly wrong.
- A side "has content" if it has cards OR cash; completeness/verdict must accept cash-only sides.

**Variant/number-aware matching (now implemented):** `searchOneCard` scores on rarity and card number, not just name+set. Variant words ("sir"/"special illustration", "alt"/"illustration"→IR+SIR, "secret"/"rainbow", "gold"/"hyper", "full art", "vmax", "vstar") map to rarity LIKE patterns and add a small boost; an exact card-number match adds a larger boost; ties break by `price_usd DESC` so a bare query surfaces the most valuable printing. `evaluate_trade` attaches `alternatives[]` (all same-name+set printings) to each priced card so the client deal card can show an inline picker and the user can correct the variant with one tap (which re-asks with `#<number>`, resolved deterministically by the number boost).

**Two gotchas that bit us:**
1. **Number token must come from the card-name portion only** (before "from/in/of"), or digit-only SET names like "151" get mistaken for a card number and +boost every card whose number is literally 151.
2. **For trades, never branch to `present_card_options`.** It dedupes candidates via `searchOneCard` to <2 and returns an empty picker — a dead end. The prompt must force `evaluate_trade` (best-guess variant + inline alternatives) for any trade/purchase, reserving disambiguation for single-card price/profit questions.
