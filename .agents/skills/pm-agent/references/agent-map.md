# Grade.IQ Agent Map

Three levels. Each level knows its own territory deeply. When planning something new, start at L1 to understand the blast radius, then go to the relevant L2 for the flow, then L3 only if the underlying machinery needs to change.

---

## L1 — App Overview Agent

**One agent. Knows the whole app.**

**Skill file:** `.agents/skills/app-overview/SKILL.md`

This is the first agent you consult for any new idea. It understands how every feature connects to every other, what the subscription model gates, and what the overall shape of the app is. It can tell you which L2 and L3 agents you need to involve for any given change.

### What it knows
- The four-tab navigation structure (Home, Grade, Values, Settings) and what lives in each
- Every feature and which tier of subscription unlocks it
- How data flows between features (e.g. grading results → history → image backup → profit screen)
- The overall technical architecture: Expo RN frontend, Express/TypeScript backend, PostgreSQL, RevenueCat, Replit Object Storage
- The dark theme design system: colours, fonts, card layouts, navigation patterns
- All 15+ database tables at a high level — what each stores and why
- All external integrations and what each one is responsible for

### What it produces
A blast-radius assessment: which features are affected by a new idea, which L2 agents to consult, and any known conflicts with existing architecture.

---

## Institutional Memory Agent

**Not a level — a cross-cutting historian.**

**Skill file:** `.agents/skills/institutional-memory/SKILL.md`

Consult when you need to know *why* something works the way it does, whether an approach has been tried before, or what trade-offs were deliberately made. Complements L1 (which tells you *what* the app does) with context about *why* it was built that way.

---

## L2 — Feature Flow Agents

**One agent per major user journey. Knows a feature end-to-end.**

---

### L2-1: Quick Grade & Bulk Grade Flow
The core feature. Covers everything from tapping "Quick Grade" to seeing the results screen. Also covers Bulk Grade (up to 20 cards, Pro only).

**Skill file:** `.agents/skills/quick-grade-expert/SKILL.md`

**Knows:** Grade hub entry point → camera capture (front + back) → server-side image optimisation (resize, compress, HEIF conversion) → AI boundary detection → single Claude call for card ID + grading → background job creation → kill-safe delivery → results screen (grades, sub-grades, variant badge, market value, share). Also knows: bulk mode (up to 20 cards via `app/bulk.tsx`), progress bar stages, haptic feedback, and how results are handed to the History flow.

**Key files:** `app/(tabs)/grade.tsx`, `app/results.tsx`, `app/bulk.tsx`, `app/bulk-results.tsx`, `app/bulk-info.tsx`

---

### L2-2: Deep Grade Flow
The premium accuracy mode. Covers the 12–16 photo pipeline.

**Skill file:** `.agents/skills/deep-grade-expert/SKILL.md`

**Knows:** Deep grade info screen → photo set capture (front, back, 4 angled, 8 corner close-ups) → server-side image enhancement (sharpen, brightness, contrast) → modified AI prompt with greater corner/edge weight → Pro subscription gate (`canDeepGrade`) → usage tracking separate from quick grade → progress UI with deep-specific stage labels.

**Key files:** `app/deep-grade-info.tsx`, `app/(tabs)/grade.tsx`, `app/results.tsx`

---

### L2-3: Crossover Grade Flow
For grading cards that are already in a slab.

**Skill file:** `.agents/skills/crossover-grade-expert/SKILL.md`

**Knows:** Crossover info screen → photo-only mode (all subscribed users) → slab detection using aspect ratio → physical card top location → cert lookup for ACE, BGS, TAG (Pro only, server-side web scraping) → known limitation: BGS Beckett requires a browser session, PSA cert lookup not available.

**Key files:** `app/crossover-info.tsx`, `app/(tabs)/grade.tsx`

---

### L2-4: Values & Set Browser Flow
The full Values tab — finding cards and understanding their market price.

**Skill file:** `.agents/skills/values-pricing-expert/SKILL.md` (also covers L2-5 Card Profit)

**Knows:** Search bar → card search against `card_catalog` → set browser (EN via pokemontcg.io, JP via TCGdex) → EN/JP language toggle → per-set card list with variant prices (Holo/RH/Non-Holo) → Top Grading Picks section with price-tier filter pills → set image proxying → price status pre-population background task → WOTC 1st Edition / Unlimited split display.

**Key files:** `app/(tabs)/values.tsx`, `app/set-cards.tsx`

---

### L2-5: Card Profit Flow
Calculating whether grading a card makes financial sense.

**Skill file:** `.agents/skills/values-pricing-expert/SKILL.md` (combined with L2-4)

**Knows:** Card profit screen entry (from Values, grading results, TCG Advisor deeplink) → company pill switcher (PSA/BGS/ACE/TAG/CGC) → eBay last-sold price fetching on demand → per-grade stats (avg1d/7d/30d, low, high, sale count) → rolling-average sparkline SVG → eBay completed-listings deep-link per grade → raw price display → profit calculation logic → JP card support (Cardmarket EUR prices, currency conversion).

**Key files:** `app/card-profit.tsx`

---

### L2-6: Grading History Flow
How grading results are stored, synced, and recovered.

**Skill file:** `.agents/skills/history-expert/SKILL.md`

**Knows:** Local AsyncStorage storage → stable UUID generation (iOS Keychain + AsyncStorage, survives reinstall) → server sync on startup (`POST /api/history/claim` re-keys rows after reinstall) → bidirectional sync using stableId → photo backup to Object Storage (front + back, 400px/JPEG 60%) → image recovery on reinstall via server URL → retroactive upload for existing users → delete propagation to server → history display on Home tab.

**Key files:** `app/(tabs)/index.tsx`, `lib/stable-user-id.ts`, `lib/storage.ts`, `lib/server-history.ts`

---

### L2-7: Collection Tools Flow
The three lightweight tools under "Collection Tools" in the Grade hub.

**Skill file:** `.agents/skills/collection-tools-expert/SKILL.md`

**Knows:**
- **Collection Scan** — multi-card condition check (Claude Haiku), front+back per card, condition label + card ID + price with condition multiplier, CSV export, rate-limited (100/session, 300/month via `collection_scan_usage` table)
- **TCG Advisor** — AI chat for card investment/market questions (Pro only), 2-phase: search `card_catalog` → fetch real prices → Claude Haiku advice, voice TTS via server, playback controls, critical quirk: use `XMLHttpRequest` not `expo/fetch` for POSTs
- **Centering Tool** — interactive draggable lines, pinch-to-zoom (1x–4x), border ratio measurement, no AI, no backend

**Key files:** `app/collection-scan.tsx`, `app/collection-results.tsx`, `app/deal-advisor.tsx`, `app/tcg-advisor-info.tsx`, `app/centering-tool.tsx`

---

### L2-8: Subscription & Paywall Flow
Everything to do with tiers, gating, paywalls, and upgrade prompts.

**Skill file:** `.agents/skills/subscription-expert/SKILL.md`

**Knows:** Four tiers — Free / Grade Curious (£2.99) / Grade Enthusiast (£5.99) / Grade Obsessed (£9.99) → RevenueCat SDK (Preview API Mode in Expo Go) → `lib/subscription.tsx` central context → all exported values (`isSubscribed`, `isGateEnabled`, `isAdminMode`, `canDeepGrade`, `canBulk`, `canCrossover`, remaining counts) → gating pattern: `isGateEnabled && !isSubscribed && !isAdminMode` → paywall screen → feature upsell screens (e.g. `tcg-advisor-info.tsx`) → free-tier grade count → reinstall-safe usage via `stable_user_id`.

**Key files:** `lib/subscription.tsx`, `app/paywall.tsx`, `app/tcg-advisor-info.tsx`

---

### L2-9: Admin & Analytics Flow
The internal tooling for monitoring and managing the business.

**Skill file:** `.agents/skills/admin-finance-expert/SKILL.md`

**Knows:** Admin auth (session-based, `ADMIN_PASSWORD`) → analytics screen (stats tab: grading volume, active users; finance tab: P&L, MRR, costs, AI spend) → finance calculation: gross MRR from RC tier counts × prices, platform fee (Apple 15% / standard 30%), RC fee, net MRR, real AI costs from `ai_cost_log` → investment breakdown (Replit, Apple, Google Play, PokeTrace, other) → editable fields for all cost inputs → price flags screen → card variants admin.

**Key files:** `app/admin-analytics.tsx`, `app/admin-card-variants.tsx`, `app/admin-price-flags.tsx`

---

### L2-10: Settings & Account Flow
The Settings tab and first-time setup.

**Skill file:** `.agents/skills/settings-account-expert/SKILL.md`

**Knows:** Onboarding (first-use company selection) → Settings tab (subscription status, grading company toggles, preferences) → grading standards reference screen → grading fees reference screen → feedback screen → about/terms/privacy/disclaimer → What's New screen → company select screen.

**Key files:** `app/(tabs)/settings.tsx`, `app/onboarding.tsx`, `app/company-select.tsx`, `app/grading-standards.tsx`, `app/grading-fees.tsx`, `app/whats-new.tsx`

---

## L3 — Technical Subsystem Agents

**One agent per shared engine. Only consult these when the underlying machinery needs to change.**

---

### L3-1: Image Processing Pipeline
Everything that happens to an image before it reaches the AI.

**Skill file:** `.agents/skills/image-pipeline-expert/SKILL.md`

**Knows:** HEIF/HEIC conversion (`heif-convert`) → server-side resize (max 1024px, `sharp`) → JPEG compression → AI boundary detection via Claude Sonnet (outer card edges + inner artwork bounds) → multi-resolution Sobel gradient fallback → tilt detection and correction → auto-crop with padding → base64 encoding for Claude → Deep Grade enhancement (sharpen, brightness, contrast) → slab aspect-ratio detection for Crossover → `expo-file-system/legacy` import required on client.

**Key files:** `server/routes.ts` (image processing sections)

---

### L3-2: AI Grading Engine
The Claude prompts, scoring logic, and card identification.

**Skill file:** `.agents/skills/ai-grading-engine-expert/SKILL.md`

**Knows:** Single-call architecture (card ID + grading in one Claude Sonnet call) → deductive grading: starts at 10, deducts for visible flaws → leniency for minor back-only defects → variant detection (Holo / Reverse Holo / Non-Holo) → multi-language card reading (EN, JP, KR, CN) → vintage card identification via set symbols → set knowledge from `server/pokemon-sets.ts` → deep grade modified prompt → collection scan prompt (Claude Haiku) → TCG Advisor prompt (Claude Haiku) → **AI cost logging to `ai_cost_log` required for every AI call**.

**Key files:** `server/routes.ts` (AI prompt sections), `server/pokemon-sets.ts`

---

### L3-3: Pricing & Market Data Engine
How prices are fetched, cached, and served.

**Skill file:** `.agents/skills/pricing-engine-expert/SKILL.md`

**Knows:** TCGPlayer prices via TCGCSV API (stored in `card_catalog.prices_json` JSONB, per-variant: Holo/RH/Normal) → eBay last-sold prices via PokeTrace (two-tier cache: in-memory + `ebay_price_cache` table) → per-grade stats: avg1d/7d/30d, low, high, sale count → Cardmarket EUR prices for JP cards via PokeTrace → exchange rate fetching (daily) → Top Picks precomputed nightly job (`top_picks_precomputed` table, EN + JP) → pokemontcg.io for EN set data → TCGdex for JP/KR set data.

**Key files:** `server/routes.ts` (pricing sections), `server/jobs.ts`

---

### L3-4: Card Catalog System
The database of all known cards and their prices.

**Skill file:** `.agents/skills/card-catalog-expert/SKILL.md`

**Knows:** `card_catalog` table — 33,270 EN cards + 13,525 JP cards, `lang` column (`en`/`ja`), `prices_json` JSONB for variant prices → JP cards: `name_en`, `price_eur`, `set_name_en` → daily EN sync from pokemontcg.io → daily JP sync via TCGdex + PokeTrace → `card_variants` table (prerelease, staff stamp, pokemon-centre, build-and-battle, trick-or-trade) → keyword search scoring (name ×3, set_name ×1, rarity stop-words filtered) → set image proxying + pre-warming.

**Key files:** `server/routes.ts` (catalog sync sections), `server/jobs.ts`

---

### L3-5: Background Job System
How grading jobs run without blocking the UI and survive app kills.

**Skill file:** `.agents/skills/background-job-expert/SKILL.md`

**Knows:** `grading_jobs` DB table — stores `rc_user_id`, `stable_user_id`, job status, `delivered` flag → job creation → client polling → kill-safe delivery: `GET /api/pending-grades` on every launch checks for completed-but-unacknowledged jobs → `POST /api/grade-job/:id/acknowledge` sets delivered=true → AppState "active" resumes polling → bulk job handling → separate `collection_jobs` table for Collection Scan (no delivered flag).

**Key files:** `server/routes.ts` (job sections), `app/(tabs)/index.tsx`, `app/(tabs)/grade.tsx`

---

### L3-6: RevenueCat, Usage Tracking & User Identity
Subscription state management, free-tier enforcement, and the stable UUID identity system.

**Skill file:** `.agents/skills/revenuecat-usage-expert/SKILL.md`

**Knows:** Stable UUID generation (expo-crypto, stored in iOS Keychain + AsyncStorage, survives reinstall) → `lib/stable-user-id.ts` → RevenueCat SDK integration → `subscription_cache` DB table → `usage_tracking` table with `stable_user_id` partial unique index → reinstall-safe grade counts → startup sync sequence (RC ID first, then stable ID) → free-tier limits per mode → admin bypass.

**Key files:** `lib/stable-user-id.ts`, `lib/subscription.tsx`, `server/routes.ts` (usage sections)

---

### L3-7: Object Storage & Image Backup
How grading photos are backed up to the cloud and recovered.

**Skill file:** `.agents/skills/object-storage-expert/SKILL.md`

**Knows:** Replit Object Storage (`.private` bucket) → upload on grade completion: front + back at 400px/JPEG 60%, path `{stableId}/{gradingUUID}/front.jpg` → `front_image_url`/`back_image_url` stored in `grading_history` → `GET /api/grading-image/:uuid` serves images (auth-checked, never public) → retroactive upload on startup (30-item cap, fire-and-forget) → `expo-file-system/legacy` import required for all FileSystem operations.

**Key files:** `server/objectStorage.ts`, `lib/server-history.ts`, `server/routes.ts` (image backup sections)

---

### L3-8: AI Voice & Chat System
The voice and conversational AI features.

**Skill file:** `.agents/skills/voice-chat-expert/SKILL.md`

**Knows:** TCG Advisor 2-phase chat → Claude Haiku for advice, rolling conversation history (session-only) → TTS via `gpt-audio` model (NOT tts-1 — Replit proxy doesn't support tts-1, ~5–9s latency) → write-then-play: client writes base64 audio to `FileSystem.cacheDirectory` before playing via `expo-av` → playback controls (pause/resume/stop) → stop audio on screen blur → voice transcription → critical quirk: use `XMLHttpRequest` not `expo/fetch` for JSON POSTs in `deal-advisor.tsx` → AI cost logged as mode `deal_advisor`.

**Key files:** `app/deal-advisor.tsx`, `server/routes.ts` (pokemon-chat/card-advisor sections), `server/replit_integrations/audio/client.ts`

---

## How the levels connect

```
New idea arrives
      │
      ▼
L1 (App Overview) ── blast radius check ──► which L2s are affected?
      │
      ▼
L2 (Feature Flow) ── flow analysis ──► which L3s need to change?
      │
      ▼
L3 (Subsystem) ── implementation guidance ──► precise spec for build agent
```

The PM agent runs the interview, then identifies which level(s) to consult based on the scope of the idea. A small UI change might only need L2. A change to how images are processed needs L3-1. A new feature that crosses multiple areas needs L1 first.

---

## Build order

**Phase 1 — Foundation**
1. L1: App Overview Agent ← start here, informs everything else

**Phase 2 — Core flows (build in parallel)**
2. L2-1: Quick Grade Flow
3. L2-4: Values & Set Browser Flow
4. L2-8: Subscription & Paywall Flow

**Phase 3 — Remaining L2s**
5. L2-2: Deep Grade Flow
6. L2-3: Crossover Grade Flow
7. L2-5: Card Profit Flow
8. L2-6: Grading History Flow
9. L2-7: Collection Tools Flow
10. L2-9: Admin & Analytics Flow
11. L2-10: Settings & Account Flow

**Phase 4 — L3 subsystems (build as needed)**
12. L3-2: AI Grading Engine ← most frequently referenced
13. L3-3: Pricing & Market Data Engine
14. L3-1: Image Processing Pipeline
15. L3-4: Card Catalog System
16. L3-5: Background Job System
17. L3-6: RevenueCat & Usage Tracking
18. L3-7: Object Storage & Image Backup
19. L3-8: AI Voice & Chat System
