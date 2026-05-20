# Things Tried and Abandoned

Approaches that were attempted, didn't work out, and why — so we don't repeat them.

---

### TTS — OpenAI tts-1 endpoint
**Tried:** Using `openai.audio.speech.create` with the `tts-1` model for TCG Advisor voice.
**What happened:** Replit's AI proxy returns "Endpoint not supported" for this endpoint. It only proxies chat completions.
**What we do instead:** `gpt-audio` model via chat completions — works but ~5–9s latency vs ~1–2s for tts-1.

---

### Streaming fetch — expo/fetch for JSON POSTs in deal-advisor
**Tried:** Using `import { fetch } from 'expo/fetch'` for all API calls in `deal-advisor.tsx`.
**What happened:** Returns 404 for plain JSON POST requests on physical devices. Works in web but not on device.
**What we do instead:** `XMLHttpRequest` for all non-streaming POSTs in that screen. The query client still safely uses `expo/fetch` for GET requests elsewhere.

---

### Cert lookup — BGS Beckett via curl
**Tried:** Fetching BGS cert data server-side using a standard HTTP request with a browser User-Agent header.
**What happened:** Beckett's cert lookup page requires a live browser session — it's not accessible via curl or standard server-side fetch, even with correct headers.
**What we do instead:** BGS cert lookup is not supported. Users must upload photos instead.

---

### User identity — RevenueCat anonymous ID as primary key
**Tried:** Keying all usage tracking and grading history to the RevenueCat anonymous user ID.
**What happened:** RC generates a new anonymous ID on every reinstall. Free-tier users discovered this and would reinstall to reset their monthly grade count. History was also lost on reinstall.
**What we do instead:** Stable UUID stored in iOS Keychain (survives reinstall). RC anonymous ID is still used for RevenueCat-specific calls but is no longer the primary identity key.

---

### Audio playback — playing from a remote URL directly
**Tried:** Passing the server's audio endpoint URL directly to `Audio.Sound.createAsync`.
**What happened:** iOS AVPlayer silently fails to play audio from URLs that don't support HTTP byte-range requests. The Replit server doesn't send the required `Accept-Ranges` headers.
**What we do instead:** Download the audio to `FileSystem.cacheDirectory` first, then play from the local file path.

---

### Top Grading Picks — live calculation on request
**Tried:** Calculating top grading picks dynamically on each API request by scoring cards in real time.
**What happened:** Too slow — required fetching eBay prices for dozens of cards per request, taking 20–30s. Unusable in practice.
**What we do instead:** Pre-computed nightly job writes results to `top_picks_precomputed` table. API reads from there instantly.
