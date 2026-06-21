---
name: Grading fee constants — 1 client module + 2 server constants
description: The grading-company fee numbers live in one client module plus two server constants that must be updated together when pricing changes.
---

When a grading company's pricing/turnaround changes, the same number lives in
independent places and they silently drift apart if you only update one:

1. CLIENT — `constants/grading-fees.ts` is the SINGLE client source of truth.
   - `COMPANY_FEES` = the rich tier breakdown (notes, sourceUrl, lastUpdated). The
     Settings "Grading Fees" page (`app/grading-fees.tsx`) renders this directly.
   - `COMPANY_FEE_OPTIONS` = the simpler profit-calculator shape
     (`{label, amount, currency, turnaround}` keyed by screen ids PSA/Beckett/CGC/Ace/TAG).
     It is DERIVED from `COMPANY_FEES` at module load (parseFeePrice + tierToFeeOption),
     so editing a tier once updates both profit screens (`app/results.tsx`,
     `app/card-profit.tsx`). The module has NO React Native imports so it stays portable.
   - Also exports `COMPANY_COLORS`, `PROFIT_COMPANY_KEY`, `COMPANY_SUBMIT_URL`,
     `ACE_LABEL_ADDON_GBP`. The three client screens must import from here, never
     redefine local copies (that drift was the whole reason this module exists).
2. SERVER — `server/routes.ts` → `GRADING_COMPANIES[].submissionFeeGBP` (+ `turnaround`) —
   used by Top Picks / "is this card worth grading?" profit math.
3. SERVER — `server/routes.ts` → `FEES_GBP` map inside the `grading_profit` advisor tool —
   used by the TCG Advisor chat when it estimates grading net profit.

**Why:** the two server constants are deliberately-simplified single GBP "entry fee"
scalars, NOT derived from the client module (server has no need for the full tier data).
So a change that updates only the client leaves the server profit math anchored to stale
fees — the app then contradicts itself (fees screen says one price, profit/advisor assume
another). The client module header comment flags this dual-source sync requirement.

**How to apply:** Any grading-fee refresh must touch the client module AND both server
constants. Anchor the two server scalars to the *cheapest tier a user can realistically
pay today* (USD tier × ~0.79 GBP), NOT a paused/members-only tier. Concrete 2026 values:
PSA £63 (Regular $79.99 — the Value tiers are paused), BGS £20 (Standard $25), TAG £17
(Basic $22), CGC £16 (Economy $20 — Bulk $17 is dealer-only, skip it), ACE £18 (Basic,
public entry). When sub-grades become free (BGS 2026) the old "base + add-on" assumption
is too high — re-check.

The derived PSA list leads with paused tiers (suffixed "(paused)") and ACE with
member-only tiers ("(members)"); that's fine because the profit screens default
`selectedFeeOption` to null (nothing auto-selected) and the suffixes make status explicit.

Beckett's official pricing page (beckett.com/grading-pricing-turnaroundtimes) 404'd in
2026 — BGS numbers came from secondary consensus (cardgrading.app); re-verify from the
official page if it returns.
