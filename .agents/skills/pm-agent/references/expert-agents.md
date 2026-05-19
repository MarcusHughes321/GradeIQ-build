# Grade.IQ Expert Agent Map

These are the proposed expert agents for the Grade.IQ project. Each one knows a specific slice of the app deeply — the files, patterns, data flows, and gotchas that matter in that area. When a new feature touches one of these areas, the relevant expert agent can tell the build agent exactly how to implement it correctly.

Build them one at a time using the PM agent in **methodology mode**.

---

## Tier 1 — Build first (highest impact, most complex areas)

### 1. Backend & Database Expert
**What it covers:** The full Express.js server (`server/routes.ts` — 13,000+ lines), all PostgreSQL tables, caching patterns, and how data flows from external APIs into the database.

**Why it matters:** Almost every new feature touches the backend. This agent prevents incorrect table design, missed indexes, and routes that don't follow existing patterns.

**Key things it knows:**
- All 15+ PostgreSQL tables and their schemas (grading_history, card_catalog, ebay_price_cache, usage_tracking, top_picks_precomputed, grading_jobs, ai_cost_log, admin_settings, and more)
- The two-tier caching pattern (in-memory + DB) used for eBay prices and set data
- How background jobs are scheduled and run (daily sync, top picks job)
- The stable_user_id pattern for reinstall-safe data
- How AI cost logging works and which modes are tracked

**Suggested skill location:** `.agents/skills/backend-db-expert/SKILL.md`

---

### 2. Quick Grade Expert
**What it covers:** The end-to-end Quick Grade flow — from tapping "Quick Grade" in the hub through camera capture, server-side processing, AI analysis, and the results screen.

**Why it matters:** Quick Grade is the core feature of the app. Any new grading feature or change to the analysis pipeline must fit this flow. Getting it wrong breaks the primary user journey.

**Key things it knows:**
- Camera UI and image capture flow (`app/(tabs)/grade.tsx`, `app/grading.tsx`)
- Auto-crop, AI boundary detection (Claude Sonnet for edges), and Sobel gradient fallback
- Server-side image optimisation: resizing (max 1024px), JPEG compression, HEIF/HEIC conversion
- The single AI call architecture: one Claude call handles card identification AND condition grading
- Deductive grading logic: starts at 10, deducts for visible flaws
- Background job system: `grading_jobs` table, kill-safe delivery, polling, and `delivered` flag
- Results screen structure: sub-grades, card name, set name, variant badge (Holo/RH/Non-Holo)

**Suggested skill location:** `.agents/skills/quick-grade-expert/SKILL.md`

---

### 3. Subscription & Paywall Expert
**What it covers:** The full RevenueCat integration, all subscription tiers, feature gating patterns, and paywall screens.

**Why it matters:** Almost every new feature needs a decision about who can access it. This agent ensures gating is consistent, the paywall is triggered correctly, and RevenueCat is never misconfigured.

**Key things it knows:**
- Tier structure: Free / Grade Curious (£2.99) / Grade Enthusiast (£5.99) / Grade Obsessed (£9.99)
- `lib/subscription.tsx` — the central subscription context, all exported values (`isSubscribed`, `isGateEnabled`, `isAdminMode`, `canDeepGrade`, `canBulk`, etc.)
- The gating pattern: `isGateEnabled && !isSubscribed && !isAdminMode`
- How admin mode bypasses gates (for testing)
- Paywall screen patterns and upsell screen patterns (like `tcg-advisor-info.tsx`)
- RevenueCat SDK behaviour in Expo Go (Preview API Mode — mocks native calls)
- Usage tracking: free-tier grade count, stable_user_id for reinstall safety

**Suggested skill location:** `.agents/skills/subscription-expert/SKILL.md`

---

## Tier 2 — Build after Tier 1

### 4. Values & Pricing Expert
**What it covers:** Everything on the Values tab — the set browser, top grading picks, card profit screen, eBay price fetching, and the card catalog database.

**Why it matters:** Pricing data comes from four different sources (TCGPlayer, eBay, PokeTrace, Cardmarket). Each source has different caching, rate limits, and data shapes. Getting prices wrong damages user trust.

**Key things it knows:**
- TCGPlayer prices: from pokemontcg.io and TCGCSV API, stored in `card_catalog.prices_json`
- eBay last-sold prices: fetched via PokeTrace, cached in `ebay_price_cache` (in-memory + DB), per-grade stats (avg1d/7d/30d, low, high, saleCount)
- Japanese prices: Cardmarket NM EUR prices via PokeTrace, converted to user currency
- `card_catalog` table: 33,000+ EN cards, 13,500+ JP cards, `lang` column, `prices_json` JSONB
- Top Picks system: `top_picks_precomputed` table, daily job, scoring algorithm, EN + JP variants
- Set browser: EN uses pokemontcg.io, JP uses TCGdex API, both enriched with price status
- Profit screen: company pill switcher (PSA/BGS/ACE/TAG/CGC), sparkline trend SVG, eBay deep-link

**Suggested skill location:** `.agents/skills/values-pricing-expert/SKILL.md`

---

### 5. Grading History Expert
**What it covers:** How grading results are stored, synced, and recovered — including the stable UUID system, AsyncStorage, server sync, and photo backup.

**Why it matters:** History is the user's most personal data. Losing it or breaking the sync causes real frustration. This area has several non-obvious patterns that are easy to break.

**Key things it knows:**
- Stable UUID (`lib/stable-user-id.ts`): generated once, stored in iOS Keychain + AsyncStorage, survives reinstalls
- `grading_history` DB table: keyed by both stable UUID and RC user ID
- Bidirectional sync on startup: `POST /api/history/claim` re-keys rows after reinstall
- Photo backup: front + back images uploaded to Replit Object Storage at 400px/60% JPEG
- Recovery flow: on reinstall, images restore from server URL via `GET /api/grading-image/:uuid`
- Retroactive upload: `retroactiveImageUpload()` runs on startup for existing users whose images weren't yet backed up
- Delete propagation: local deletes sync to server

**Suggested skill location:** `.agents/skills/history-expert/SKILL.md`

---

### 6. Collection Tools Expert
**What it covers:** The three tools in the Grade hub's "Collection Tools" section — Collection Scan, TCG Advisor (Card Advisor), and Centering Tool.

**Why it matters:** These are free-tier features that drive engagement and upsell. They use different AI models (Haiku vs Sonnet) and have their own rate limiting and data flows separate from grading.

**Key things it knows:**
- Collection Scan: Claude Haiku, front+back per card, returns condition + card identity + price, CSV export, rate-limited via `collection_scan_usage` table (100/session, 300/month), screens: `collection-scan.tsx` / `collection-results.tsx`
- TCG Advisor (deal-advisor.tsx): 2-phase architecture (search → advice), Claude Haiku for advice, voice TTS via server `/api/pokemon-chat/tts`, gated to Pro subscribers
- Card Advisor search: keyword scoring against `card_catalog` (name ×3, set_name ×1)
- Centering Tool: interactive draggable lines with pinch-to-zoom, no AI, no backend
- AI cost logging for both Haiku tools: mode `deal_advisor` and `collection`
- Known network quirk: `expo/fetch` returns 404 for plain JSON POSTs in deal-advisor — use XMLHttpRequest instead

**Suggested skill location:** `.agents/skills/collection-tools-expert/SKILL.md`

---

## Tier 3 — Build when the area needs frequent changes

### 7. Deep Grade Expert
**What it covers:** The Deep Grade mode — 12-16 photo pipeline, corner close-up capture, server-side image enhancement, and the modified AI prompt.

**Why it matters:** Deep Grade is the premium flagship feature. Changes to it need to maintain accuracy and the structured multi-photo flow.

**Key things it knows:**
- Photo set: front, back, 4 angled shots, 8 corner close-ups (16 total for full deep grade)
- Server-side enhancement: sharpening, brightness, contrast boost applied before AI analysis
- Modified AI prompt: more granular defect analysis, greater weight on corner and edge close-ups
- Pro-gated: `canDeepGrade` from subscription context
- Progress UI: animated progress bar with mode-specific stage labels
- Usage tracking: separate `recordDeepUsage` / `remainingDeepGrades` from quick grade

**Suggested skill location:** `.agents/skills/deep-grade-expert/SKILL.md`

---

### 8. Admin & Finance Expert
**What it covers:** The admin panel, finance tab, AI cost tracking, and analytics.

**Why it matters:** Financial decisions about the business depend on this data being accurate. Admin routes are sensitive and must remain auth-protected.

**Key things it knows:**
- Admin auth: `ADMIN_PASSWORD` env secret, session-based protection
- Finance endpoint: `GET /api/admin/financials` — P&L calculation, gross MRR from RC tier counts, platform fee (Apple SBP 15% / standard 30%), RC fee, AI costs from `ai_cost_log`
- `admin_settings` table: editable fields for investment tracking, monthly costs, platform fee
- AI cost log: every Claude call logs model, mode, token counts, cost — pricing at $3/M input, $15/M output for Sonnet; Haiku rates separate
- Monthly cost tracking: Replit subscription + PokeTrace API (£15/month)
- Investment breakdown: real totals for Replit (£870.42), Apple licence (£75), Google Play (£20), other
- Stats tab: daily active users graph, grading volume — backed by `grading_history` table queries

**Suggested skill location:** `.agents/skills/admin-finance-expert/SKILL.md`

---

### 9. Crossover Grade Expert
**What it covers:** The Crossover Grade mode — grading already-slabbed cards by photo or cert lookup.

**Why it matters:** Crossover is a niche but high-value feature for serious collectors. The slab detection logic and cert lookup integrations have specific quirks.

**Key things it knows:**
- Photo mode: Claude Sonnet detects the physical card top inside the slab using aspect ratio analysis
- Cert lookup: available for ACE, BGS, and TAG via web scraping (Playwright-based on server) — Pro only
- Slab centering: uses aspect ratio rather than standard card boundary detection
- Free vs Pro split: photo-only for free users, cert lookup for pro subscribers
- Known limitation: BGS Beckett cert lookup requires a browser session (cannot curl)

**Suggested skill location:** `.agents/skills/crossover-expert/SKILL.md`

---

## Recommended build order

1. **Backend & Database Expert** — underpins everything
2. **Quick Grade Expert** — the core user journey
3. **Subscription & Paywall Expert** — touched by every new feature
4. **Values & Pricing Expert** — second most complex area
5. **Grading History Expert** — critical for user trust
6. **Collection Tools Expert** — active development area
7. **Deep Grade Expert** — changes less frequently
8. **Admin & Finance Expert** — internal tooling
9. **Crossover Grade Expert** — most specialised, lowest change frequency
