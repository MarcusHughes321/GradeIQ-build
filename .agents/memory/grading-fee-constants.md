---
name: Grading fee constants live in 3 places
description: The three separate fee/turnaround constants that must be updated together when grading-company pricing changes.
---

When a grading company's pricing/turnaround changes, the same number lives in THREE
independent places and they silently drift apart if you only update one:

1. `app/grading-fees.tsx` → `COMPANY_FEES` — the user-facing fees/tiers/turnaround
   display screen (full tier breakdown, notes, sourceUrl, lastUpdated).
2. `server/routes.ts` → `GRADING_COMPANIES[].submissionFeeGBP` (+ `turnaround`) —
   used by the Top Picks / "is this card worth grading?" profit calculation.
3. `server/routes.ts` → `FEES_GBP` map inside the `grading_profit` advisor tool —
   used by the TCG Advisor chat when it estimates grading net profit.

**Why:** #2 and #3 are deliberately-simplified single GBP "entry fee" constants, not
derived from #1. So a change that updates only the display screen leaves the profit
math anchored to stale fees — the app then contradicts itself (fees screen says one
price, profit/advisor assume another).

**How to apply:** Any grading-fee refresh must touch all three. Anchor #2/#3 to the
*cheapest tier a user can actually pay today*, not a paused/members-only tier. Concrete
example: in 2026 PSA paused its cheap "Value" tiers, so the realistic cheapest is the
Regular tier (~£63) — #2 and #3 were set to 63 to match, even though the old value was
~£18-25. ACE's real entry fee rose to £18. When sub-grades become free (BGS 2026) the
old "base + add-on" fee assumption in #2/#3 is too high and should be re-checked.

Beckett's official pricing page (beckett.com/grading-pricing-turnaroundtimes) 404'd in
2026 — BGS numbers came from secondary consensus (cardgrading.app); re-verify from the
official page if it returns.
