---
name: values-pricing-expert
description: L2 expert on the Values tab and Card Profit flow in Grade.IQ. Knows the set browser (EN and JP), card search, top grading picks, eBay price fetching, and the full card profit screen. Consult when building anything that changes how cards are browsed, how prices are displayed, how profit is calculated, or how sets are listed.
---

# Values & Card Profit Flow — L2 Expert

You know the Values tab and the Card Profit screen end-to-end. These are the market intelligence features — browsing sets, understanding a card's raw and graded value, and deciding whether grading makes economic sense.

---

## Values Tab Structure (`app/(tabs)/values.tsx`)

Three sections on one scrollable screen:

1. **Search bar** — keyword search across `card_catalog`
2. **Top Grading Picks** — pre-computed high-ROI cards, filterable by price tier
3. **Browse Sets** — full set list with EN/JP toggle

---

## Card Search

**Query:** Default fetcher with path built from search term — hits `GET /api/cards/search?q=term`.

Search queries the `card_catalog` table using keyword scoring:
- Card name match: weight ×3
- Set name match: weight ×1
- Rarity stop-words filtered out (common words like "holo", "ex", "gx" don't dominate)

Results show: card name, set name, card number, raw price, card image. Tapping a result goes to `app/card-profit.tsx`.

---

## Top Grading Picks

**Query:** `GET /api/top-picks-precomputed?maxPrice=X&lang=en` (or `lang=ja`).

Pre-computed nightly — never calculate on request (too slow). Results live in `top_picks_precomputed` table.

**Price tier filter pills:** Under £5 / £10 / £20 / £50 / £100 / £200 / £500 / £1000. Each pill filters by `raw_price_gbp`.

**PRO label:** The section header shows a PRO badge but the feature is not gated — all users see it. The badge signals quality/premium positioning.

**EN vs JP:** Controlled by the same language toggle as the set browser. JP picks use `lang='ja'` column in `top_picks_precomputed`.

Each pick shows: card image, card name, set name, raw price, and the top graded price (PSA 10 or equivalent) to illustrate grading upside.

---

## Browse Sets

### Language toggle
EN (English) / JP (Japanese) toggle in the section header. Persists within the session.

### English sets (`GET /api/sets/english`)
- Data from pokemontcg.io, cached in-memory + DB
- Sorted newest first (by `releaseDate`)
- WOTC-era sets (Base Set, Jungle, Fossil, etc.) expanded into two entries: "· 1st Edition" and "· Unlimited" — different price points
- Each set shows: logo, name, series, card count
- `hasPrices` flag: `null` = not yet checked, `true`/`false` = checked. Sets with `hasPrices: null` are greyed out initially and become active as a background task checks them.
- Refetch interval: 6 seconds while any set has `hasPrices: null`, to progressively unlock sets as price status is confirmed

### Japanese sets (`GET /api/sets/japanese`)
- Data from TCGdex API, enriched with DB card counts
- Same sort order (newest first)
- Shows Cardmarket EUR prices (converted to user currency) rather than TCGPlayer USD

### Set cards screen (`app/set-cards.tsx`)
Tapping a set opens the full card list for that set.

**EN cards:** TCGPlayer prices, per-variant breakdown when multiple variants exist:
- Holo price
- Reverse Holo price
- Non-Holo (normal) price
When only one variant exists, shows that price directly.

**JP cards:** Cardmarket NM EUR price, converted to user's currency using daily exchange rates.

Cards sorted by set number. Card images from pokemontcg.io (EN) or TCGdex CDN (JP).

Tapping a card → `app/card-profit.tsx`.

---

## Card Profit Screen (`app/card-profit.tsx`)

The grading economics calculator. Shows whether grading a specific card makes financial sense.

### Entry points
- Values tab search result
- Set cards screen (tap a card)
- Top Grading Picks (tap a card)
- Grading results screen ("View Profit" button)
- TCG Advisor deeplink

### Company pill switcher
PSA / BGS / ACE / TAG / CGC pills at the top. Tapping switches which company's eBay prices are shown. Selected pill is red/active.

### eBay prices
Fetched on demand: `GET /api/ebay-all-grades?cardName=X&setName=Y&cardNumber=Z&company=PSA` (or whichever company is selected).

**Two-tier cache:**
1. In-memory cache (process lifetime)
2. `ebay_price_cache` DB table (survives restarts)
Cache TTL: 24 hours. Stale or missing = fetch from PokeTrace.

**Per-grade stats shown:**
- Average last 1 day (`avg1d`)
- Average last 7 days (`avg7d`)
- Average last 30 days (`avg30d`)
- Low and high sold price
- Sale count (how many sales the average is based on)

### Sparkline trend
Rolling-average trend line (SVG) for the top grade (PSA 10 / BGS 9.5 / etc.). Shows price direction over the last 30 days. Drawn directly in SVG — no charting library needed.

### eBay deep-link
Each grade row has a link to eBay completed listings for that specific grade. Opens in the device browser.

### Raw price
Shown below the grade table. For EN cards: TCGPlayer NM price from `card_catalog`. For JP cards: Cardmarket NM EUR price, converted to user currency.

### Profit calculation
Basic: `graded_price - raw_price - grading_fee`. Grading fees are known constants per company. The screen does not currently show this calculation explicitly — it shows the prices and the user calculates mentally.

---

## Currency Conversion

JP card prices are stored in EUR (Cardmarket). Display currency is the user's locale preference. Exchange rates are fetched daily and cached. The conversion formula: `eur_price * exchange_rate`.

---

## Key Files

- `app/(tabs)/values.tsx` — main Values tab
- `app/set-cards.tsx` — cards within a set
- `app/card-profit.tsx` — profit screen

---

## Common Mistakes to Avoid

- **Never calculate Top Picks on request** — always read from `top_picks_precomputed`. The live calculation takes 20–30 seconds.
- **Don't re-fetch eBay prices without checking cache first** — PokeTrace has rate limits and each fetch takes 2–4 seconds.
- **WOTC set splitting is client-side** — the server returns one entry per WOTC set. The client expands it into 1st Edition + Unlimited. Don't change the server to return two entries.
- **JP prices are EUR, not USD** — never display JP Cardmarket prices as if they were USD.
- **`hasPrices: null` is a valid state** — sets with null haven't been checked yet. Don't treat null as false.
