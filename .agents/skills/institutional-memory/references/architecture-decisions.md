# Architecture Decisions

Key technical decisions made during Grade.IQ development, and why they were made.

---

### AI — Single call for card ID + grading
**Decision:** One Claude call handles both card identification and condition grading together.
**Why:** Separating them into two calls (ID first, then grade) was slower and more expensive. The single-call approach also lets the grading logic use card identity context (e.g. knowing it's a holo vs non-holo affects how surface marks are assessed).
**Watch out for:** The prompt is large and complex. Changes to the card ID section can accidentally affect grading behaviour and vice versa.

---

### AI — Claude Sonnet 4-6 for grading, Claude Haiku for chat/scan
**Decision:** Sonnet for all grading (Quick, Deep, Crossover, boundary detection). Haiku for TCG Advisor and Collection Scan.
**Why:** Grading requires high accuracy and nuanced vision analysis — Sonnet is significantly better at this. Chat and scan features are higher-volume and lower-stakes, so Haiku's speed and lower cost (roughly 10× cheaper) is the right trade-off.
**Watch out for:** Haiku cannot reliably identify cards from photos. Never use it for grading.

---

### TTS — gpt-audio instead of tts-1
**Decision:** Voice generation in TCG Advisor uses `gpt-audio` via chat completions, not OpenAI's dedicated `tts-1` endpoint.
**Why:** Replit's AI proxy only supports the chat completions endpoint. `openai.audio.speech.create` (tts-1) returns "Endpoint not supported". The gpt-audio approach works but adds ~5–9s latency per message.
**Alternatives considered:** Direct OpenAI key (would allow tts-1 and reduce latency to ~1–2s) — not done because it would require managing a separate secret outside Replit's integration system.
**Watch out for:** The latency is a real UX problem for rapid back-and-forth conversation. Any feature that needs faster TTS would require a direct OpenAI key.

---

### Networking — XMLHttpRequest instead of expo/fetch for JSON POSTs in deal-advisor
**Decision:** `deal-advisor.tsx` uses `XMLHttpRequest` for all non-streaming POST requests, not `expo/fetch`.
**Why:** `expo/fetch` (the streaming-capable fetch import) returns 404 for plain JSON POSTs in this screen on physical devices. The root cause isn't fully understood but is consistent. Regular `fetch` from the global scope also works; `expo/fetch` is the problem.
**Watch out for:** This is a screen-specific quirk. The global query client uses `expo/fetch` safely for GET requests everywhere else — don't change that.

---

### Audio playback — write to local file first, then play
**Decision:** TTS audio is written to `FileSystem.cacheDirectory` before being played, rather than streaming from a URL.
**Why:** iOS AVPlayer cannot play audio from remote URLs unless the server supports HTTP byte-range requests. The Replit dev server doesn't. Writing to a local cache file sidesteps this entirely.
**Watch out for:** Cache files accumulate over time. Current implementation does not clean up old audio files.

---

### File system — expo-file-system/legacy import required
**Decision:** All `FileSystem` operations import from `expo-file-system/legacy`, not the default `expo-file-system` export.
**Why:** The non-legacy default export changed its API in a way that broke existing code. The `/legacy` import preserves the original synchronous-style API that the rest of the codebase relies on.
**Watch out for:** Any new code that needs file system access must also use `expo-file-system/legacy`.

---

### Subscriptions — RevenueCat, not Stripe
**Decision:** All in-app purchases and subscriptions are managed by RevenueCat.
**Why:** RevenueCat handles App Store and Google Play purchase flows natively, including receipt validation, entitlement management, and cross-platform sync. Stripe requires a custom payment UI and cannot process App Store purchases.
**Watch out for:** RevenueCat runs in "Preview API Mode" in Expo Go, mocking native calls. The subscription gate can be disabled entirely via `EXPO_PUBLIC_SUBSCRIPTION_GATE=off` for development.

---

### User identity — stable UUID over RC anonymous ID
**Decision:** All user data (history, usage counts) is primarily keyed to a stable UUID generated once and stored in iOS Keychain + AsyncStorage, rather than the RevenueCat anonymous user ID.
**Why:** RevenueCat generates a new anonymous ID on reinstall. This caused free-tier users to get a fresh 3-grade allowance after reinstalling. The stable UUID survives reinstall (iOS Keychain persists unless the app is explicitly deleted with "Delete App" while logged out of iCloud). Usage counts and grading history are now correctly tied to the real user.
**Watch out for:** Keychain access can fail in edge cases (e.g. device locked with first unlock not yet done). Always have AsyncStorage as a fallback.

---

### Backend — Two-tier caching for eBay prices
**Decision:** eBay prices are cached in both in-memory (process lifetime) and in the `ebay_price_cache` PostgreSQL table.
**Why:** eBay price fetching via PokeTrace is slow (~2–4s per card) and the API has rate limits. In-memory cache handles rapid repeat requests. DB cache handles server restarts. Cache TTL is 24 hours.
**Watch out for:** In-memory cache is per-process — if the server restarts, it falls back to the DB cache, then re-fetches from PokeTrace.

---

### Grading jobs — kill-safe delivery via DB
**Decision:** Every grading job writes a `delivered: false` flag to the `grading_jobs` DB table. The client sets it to `true` only after it has successfully processed the result.
**Why:** The original approach delivered results via in-memory polling. If the app was killed mid-grade, the result was lost. The DB flag means `GET /api/pending-grades` on every app launch recovers any unacknowledged results, even across reinstalls and device switches.
**Watch out for:** `acknowledge` must only be called after the client has fully saved the result locally — not just received it.

---

### Image processing — AI boundary detection with Sobel fallback
**Decision:** Claude Sonnet is the primary method for detecting card edges and artwork bounds in images. A multi-resolution Sobel gradient is used as a fallback if Claude fails or returns invalid bounds.
**Why:** Claude is significantly more accurate than pure computer vision for real-world card photos (glare, angles, backgrounds). But Claude can occasionally return malformed coordinates, so the fallback ensures the pipeline never crashes.
**Watch out for:** The Sobel fallback is noticeably less accurate on complex backgrounds. If accuracy drops for a user, check whether they're hitting the fallback path.
