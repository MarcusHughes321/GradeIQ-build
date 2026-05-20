# Product Evolution

How the product thinking has changed over time — what started as one thing and became another.

---

### Grading scope — PSA-only → five companies
**Original thinking:** PSA is the dominant grading company, so PSA grades would be enough.
**What changed:** Users care about BGS (Beckett) for its sub-grade system, ACE Grading as the popular UK-based option, TAG for its niche following, and CGC as a growing challenger. Multi-company output became a core differentiator.
**Current state:** Every grading result shows estimated grades for PSA, BGS, ACE, TAG, and CGC simultaneously.

---

### Market value — "nice to have" → core feature
**Original thinking:** The grading estimate was the product. Prices were a secondary feature.
**What changed:** Users immediately wanted to know if grading was *worth it* economically — the raw cost vs graded value comparison. The Card Profit screen (grading economics calculator) became one of the most-used parts of the app.
**Current state:** eBay last-sold prices, per-grade stats, profitability sparklines, and the full profit screen are first-class features. Top Grading Picks was built specifically to surface the highest-ROI grading opportunities.

---

### Japanese cards — afterthought → full support
**Original thinking:** English-language Pokémon cards were the target market.
**What changed:** JP cards have a significant collector and investor audience, and many high-value cards are JP exclusives. Cardmarket EUR pricing was added for JP raw cards. TCGdex integration brought in JP set data. The set browser got a full EN/JP toggle.
**Current state:** Full JP support — 13,525 JP cards in the catalog, TCGdex set browser with 163 sets across 14 series, Cardmarket NM EUR prices with currency conversion, JP Top Grading Picks.

---

### Background grading — foreground-only → kill-safe background jobs
**Original thinking:** Grading happened while the user waited on screen. The result appeared when the API call returned.
**What changed:** Grading takes 15–45 seconds. Users backgrounded the app, killed it, or switched to other apps. Results were lost.
**What was built:** A full background job system. Results survive app kills, reinstalls, and device switches. The Home tab badge signals when a result is ready. Recovery happens automatically on every app launch.

---

### Subscription model — hard gate → soft gate with admin bypass
**Original thinking:** Free users would be hard-blocked from premium features.
**What changed:** Hard gates made testing painful and broke the admin's ability to use the app normally. A bypass pattern was added: `isAdminMode` from the subscription context skips all gates.
**Current state:** `isGateEnabled && !isSubscribed && !isAdminMode` is the universal gating pattern. The gate itself can be disabled entirely via env var for development builds.

---

### Grading history — local only → synced + photo backup
**Original thinking:** Grading history lived in AsyncStorage on the device. Simple, no backend needed.
**What changed:** Users reinstalled the app and lost everything. Support requests about lost history were the most common complaint.
**What was built:** Server-side `grading_history` table synced bidirectionally. Stable UUID for identity across reinstalls. Photo backup to Replit Object Storage with automatic recovery. Retroactive upload for users whose photos weren't yet backed up.

---

### Collection tools — standalone features → grouped hub section
**Original thinking:** Each tool (Centering Tool, Collection Scan, TCG Advisor) was a separate entry point.
**What changed:** The Features tab became crowded. Grouping lightweight collection-management tools into a "Collection Tools" section created a clearer hierarchy — grading modes at the top, supporting tools below.
**Current state:** Collection Tools section in the Features hub contains: Collection Scan, TCG Advisor, Centering Tool.

---

### TCG Advisor — free feature → Pro gated
**Original thinking:** The AI chat advisor would be a free feature to drive engagement.
**What changed:** TTS voice was added, making it a genuinely premium experience. The feature also uses real price data and Haiku AI calls that have real costs. Gating it to Pro creates a clear value reason to subscribe.
**Current state:** TCG Advisor shows a gold lock pill for free users and redirects to an upsell screen (`tcg-advisor-info.tsx`).

---

### Agent methodology — ad-hoc → structured leveled system
**Original thinking:** Each feature was built through direct conversation — describe what you want, build it, refine.
**What changed:** As the app grew more complex, context about how things worked had to be re-established at the start of each session. New features sometimes conflicted with existing patterns because that context wasn't captured anywhere.
**What's being built:** A leveled agent ecosystem — L1 (app overview), L2 (feature flows), L3 (technical subsystems) — plus a PM agent for structured feature planning and this Institutional Memory agent to capture decisions and history.
