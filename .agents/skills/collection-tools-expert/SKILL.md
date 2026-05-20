---
name: collection-tools-expert
description: L2 expert on the Collection Tools flow in Grade.IQ — Collection Scan, TCG Advisor (deal advisor), and Centering Tool. Knows the multi-card scan pipeline, the AI chat advisor architecture, voice TTS/transcription, and the centering measurement tool. Consult when building anything that changes these three tools, their rate limiting, AI models used, or the voice features.
---

# Collection Tools Flow — L2 Expert

You know the three Collection Tools end-to-end: Collection Scan, TCG Advisor, and Centering Tool. These live under the "Collection Tools" section in the Features hub (`app/(tabs)/grade.tsx`). They are lighter-weight tools compared to the grading modes — designed for everyday use rather than high-accuracy AI grading.

---

## Collection Scan

### What it does
Rapid condition check for multiple raw cards. Free feature. Uses Claude Haiku (not Sonnet) — faster and cheaper for this use case.

### Entry
Features hub → "Collection Scan" card (FREE section). No subscription gate. Silent rate limiting applies.

### Flow

**`app/collection-scan.tsx` — capture phase**
User adds cards one by one. Each card: front photo + back photo. No limit on cards within rate limits.

On submit: `POST /api/collection/job` — sends all card image pairs.

Server creates a job row in `collection_jobs` table. Returns `{ jobId }`.

**Server processing (per card):**
Claude Haiku analyses front + back and returns:
- Condition label: Mint / Near Mint / Lightly Played / Played / Heavily Played / Damaged
- Card identity (name, set, approximate number)
- Raw price estimate (from `card_catalog` lookup)
- Price with condition multiplier applied (NM = 100%, LP = 70%, etc.)

Cards are processed and results written back to `collection_jobs` table as they complete. The client polls `GET /api/collection/job/:jobId` to check progress.

**`app/collection-results.tsx` — results phase**
Shows all cards in a scrollable list. Each card row: condition badge (colour-coded), card name, raw price, condition-adjusted price.

**CSV export:** "Export CSV" button generates a spreadsheet of all cards with prices. Useful for sellers pricing their collections. Download via `expo-file-system` + `expo-sharing`.

### Rate limiting
Silent — users are never told they've hit a limit, the request is just rejected gracefully.
- **Per session:** 100 cards
- **Per month:** 300 cards

Tracked in `collection_scan_usage` DB table, keyed by `stable_user_id`.

### AI cost logging
Mode: `"collection"`. Model: Claude Haiku. Logged to `ai_cost_log` after each job completes.

---

## TCG Advisor (Deal Advisor)

### What it does
AI-powered chat for card investment and market questions. Pro only. Uses Claude Haiku for advice, with real PokeTrace price data fetched before each response.

### Entry
Features hub → "TCG Advisor" card (PRO section). Gate: `isGateEnabled && !isSubscribed && !isAdminMode` → redirect to `app/tcg-advisor-info.tsx` (upsell screen).

### Architecture — 2 phases

**Phase 1: Card search**
User describes a card in natural language. `POST /api/card-advisor/search` — queries `card_catalog` using keyword scoring (name ×3, set_name ×1) and returns up to 8 matching cards. User taps the exact card they mean.

**Phase 2: Advice**
Card locked in. `POST /api/card-advisor/advice` — fetches real PokeTrace graded prices + TCGPlayer/Cardmarket raw price for that specific card, then sends everything to Claude Haiku with a market analysis system prompt. Returns conversational advice.

Follow-up messages reuse the same endpoint with rolling conversation history in the request body.

### Voice TTS
After each AI response, audio is auto-generated: `POST /api/pokemon-chat/tts`.

**Server:** Calls `textToSpeech()` from `server/replit_integrations/audio/client.ts`. Uses `gpt-audio` model (not `tts-1` — Replit's AI proxy doesn't support tts-1). Returns base64-encoded mp3.

**Client (`app/deal-advisor.tsx`):**
1. Receives base64 JSON response
2. Decodes and writes to `FileSystem.cacheDirectory` as a `.mp3` file
3. Plays via `Audio.Sound.createAsync` from `expo-av`

**Playback controls:** Pause/Resume + Stop buttons appear during playback. "Generating…" spinner shows while audio is being created (~5–9s latency).

**On navigate away:** `useFocusEffect` stops audio playback when leaving the screen.

### Voice transcription
User can speak instead of type. `POST /api/pokemon-chat/transcribe` — sends audio recording, returns transcript. Client uses the transcript as the message text.

### Critical networking quirk
**`expo/fetch` returns 404 for plain JSON POSTs in `deal-advisor.tsx`.** Use `XMLHttpRequest` for all non-streaming POST requests in this screen. This is a known platform issue on physical devices — do not "fix" it by switching to `expo/fetch`.

### AI cost logging
Mode: `"deal_advisor"`. Model: Claude Haiku. Logged to `ai_cost_log`.

### Deeplink to Card Profit
Each advice response can deeplink to `app/card-profit.tsx` for the full profit screen for that card. Button shown at bottom of conversation after a card is locked in.

---

## Centering Tool

### What it does
Manual border ratio measurement for a card. Free feature. No AI, no backend calls.

### Entry
Features hub → "Centering Tool" card (FREE section). No gate.

### `app/centering-tool.tsx`
User takes or selects a photo of their card. The screen overlays two sets of draggable lines:
- Horizontal lines (top/bottom borders)
- Vertical lines (left/right borders)

User drags the lines to align with the card's printed border edges.

**Pinch-to-zoom:** 1× to 4× zoom with gesture detection via PanResponder. Haptic feedback on line touch.

**Calculations shown in real-time:**
- Left-to-right ratio (e.g. 55/45)
- Top-to-bottom ratio (e.g. 60/40)
- Centering grade indicator (what centering grade this likely corresponds to)

No server calls. All calculation is client-side geometry.

---

## Key Files

- `app/collection-scan.tsx` — collection scan capture
- `app/collection-results.tsx` — collection scan results
- `app/deal-advisor.tsx` — TCG Advisor chat + voice
- `app/tcg-advisor-info.tsx` — TCG Advisor upsell screen
- `app/centering-tool.tsx` — centering measurement tool
- `server/replit_integrations/audio/client.ts` — TTS audio generation

---

## Common Mistakes to Avoid

- **Don't use Claude Sonnet for Collection Scan** — Haiku is intentional (cost and speed). Sonnet would be 10× more expensive for a bulk scan feature.
- **Don't use `expo/fetch` for POSTs in deal-advisor.tsx** — use `XMLHttpRequest`. This is a known quirk that causes 404s on physical devices.
- **Always write TTS audio to local file before playing** — iOS cannot stream audio from remote URLs without byte-range support.
- **Rate limiting is silent** — never show users they've hit the collection scan limit. Reject gracefully.
- **Centering Tool has zero backend** — any change to it is frontend-only. Don't add server calls without a very good reason.
