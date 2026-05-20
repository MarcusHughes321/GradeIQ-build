---
name: pricing-engine-expert
description: L3 expert on the pricing and market data engine in Grade.IQ. Knows how TCGPlayer prices, eBay last-sold prices, Cardmarket EUR prices, and Top Grading Picks are fetched, cached, and served. Consult when changing how prices are fetched or cached, adding a new price source, modifying the Top Picks algorithm, or debugging stale/wrong prices.
---

# Pricing & Market Data Engine — L3 Expert

You know every price source in Grade.IQ, how data flows from external APIs into the database and in-memory cache, and how it reaches the user. Prices are the second most important feature in the app after grading — they determine whether grading is worth doing economically.

---

## Price Sources Overview

| Price type | Source | Storage | Cache TTL |
|------------|--------|---------|-----------|
| TCGPlayer raw (EN cards) | TCGCSV API | `card_catalog.prices_json` JSONB | Daily sync |
| eBay graded (all companies) | PokeTrace US | `ebay_price_cache` + in-memory | 24 hours |
| Cardmarket NM (JP cards) | PokeTrace EU | `card_catalog.price_eur` | Daily sync |
| Exchange rates (EUR→GBP/USD) | Fixer.io or similar | In-memory + DB | Daily |
| Top Grading Picks | Pre-computed from above | `top_picks_precomputed` | Nightly job |

---

## TCGPlayer Prices (EN Cards)

**Source:** TCGCSV API — a free API that mirrors TCGPlayer price data.

**What's fetched:** Per-card, per-variant prices:
- Holo NM price
- Reverse Holo NM price
- Non-Holo (Normal) NM price

Stored in `card_catalog.prices_json` as JSONB:
```json
{
  "holo": 45.00,
  "reverseHolo": 8.50,
  "normal": 3.20
}
```

When only one variant exists (e.g. most secret rares are Holo only), only that key is present.

**Sync schedule:** Daily job. Runs at ~3am UTC to avoid peak API load. Updates `prices_json` for all EN cards in `card_catalog`.

**WOTC-era cards:** 1st Edition and Unlimited have different TCGPlayer prices. They are stored as two rows in `card_catalog` with a `variant_label` distinguishing them. The set browser client-side logic splits the display accordingly.

---

## eBay Graded Prices

**Source:** PokeTrace US API (`POKETRACE_API_KEY` env var).

**What's fetched:** Per-card, per-grading-company, per-grade last-sold prices:
- Average last 1 day (`avg1d`)
- Average last 7 days (`avg7d`)
- Average last 30 days (`avg30d`)
- Lowest sale (`low`)
- Highest sale (`high`)
- Number of sales (`saleCount`)

**Fetched on demand** — not pre-fetched for all cards. The Card Profit screen triggers a fetch when the user opens it for a specific card.

### Two-Tier Cache

**Tier 1 — In-memory (process lifetime):**
```typescript
const ebayCache = new Map<string, { data: EbayPrices; fetchedAt: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
```
Cache key: `${cardName}::${setName}::${company}` (lowercased, normalised).

**Tier 2 — PostgreSQL `ebay_price_cache` table:**
```sql
card_name TEXT, set_name TEXT, company TEXT, grade TEXT,
avg1d NUMERIC, avg7d NUMERIC, avg30d NUMERIC, low NUMERIC, high NUMERIC, sale_count INT,
fetched_at TIMESTAMPTZ
```
The DB cache survives server restarts. When the server restarts, in-memory cache is empty but DB cache has recent data.

**Cache lookup order:**
1. Check in-memory cache — if fresh (< 24h), return immediately
2. Check DB cache — if fresh (< 24h), populate in-memory and return
3. Fetch from PokeTrace — store in both caches, return

**PokeTrace rate limits:** ~100 requests/minute. The two-tier cache is essential — without it, the Card Profit screen would hit PokeTrace on every view and quickly exceed limits.

---

## Cardmarket EUR Prices (JP Cards)

**Source:** PokeTrace EU API (same API key, different endpoint).

**What's fetched:** NM (Near Mint) EUR price from Cardmarket for JP cards.

Stored in `card_catalog.price_eur` (NUMERIC column). Synced daily alongside the JP card sync.

**Currency conversion:** EUR prices are converted to the user's display currency at runtime using the daily exchange rate. The conversion happens in the API response, not at storage time.

---

## Exchange Rates

**Daily fetch:** Exchange rates (EUR → GBP, EUR → USD, etc.) are fetched once per day and cached in-memory + stored in a `exchange_rates` DB row.

The conversion factor is used by:
- JP card prices on the set browser
- JP card prices on the Card Profit screen
- Top Grading Picks for JP cards

**Fallback:** If the daily fetch fails, the previous day's rate is used. The system never shows raw EUR values to users — always convert.

---

## Top Grading Picks Algorithm

**Never calculated on request.** Always read from `top_picks_precomputed`. The nightly job writes results; the API reads them.

### Scoring algorithm (nightly job)
For each card in `card_catalog`:
1. Fetch eBay PSA 10 price (or BGS 9.5 if no PSA data)
2. Get raw TCGPlayer price
3. Calculate: `roi = (graded_price - raw_price - grading_fee) / raw_price`
4. Apply filters:
   - Minimum raw price: £1 (avoids ultra-cheap bulk)
   - Maximum raw price: configurable by tier filter
   - Minimum sale count: 3 (avoids outlier single sales)
5. Score = `roi × log(saleCount)` — weights ROI by liquidity (cards with more sales are better picks)
6. Top 50 results per price tier stored in `top_picks_precomputed`

**EN and JP run separately.** The nightly job runs both `lang='en'` and `lang='ja'` versions.

**Grading fees used in calculation:**
- PSA: $20 (standard tier)
- BGS: $25
- ACE: £15
- TAG: £20
- CGC: $20

---

## pokemontcg.io (EN Set Data)

Used for EN set metadata (set list, images, release dates) and card image URLs. Free tier, no auth required.

Cards are not fetched from here for price data — only set metadata and card images.

---

## TCGdex (JP Set Data)

Used for JP and Korean set metadata, card lists, and card images. Free API.

---

## Key Files

- `server/routes.ts` — price fetching, cache logic, Top Picks endpoint
- `server/jobs.ts` (or similar) — nightly Top Picks precompute job, daily card sync jobs

---

## Common Mistakes to Avoid

- **Never calculate Top Picks on request** — it requires eBay price fetches for dozens of cards; it takes 20–30 seconds and will hit rate limits
- **Always check the two-tier cache before calling PokeTrace** — raw PokeTrace calls take 2–4 seconds each and have rate limits
- **JP prices are EUR, not USD** — never display `price_eur` as if it were USD or GBP without conversion
- **WOTC 1st Edition vs Unlimited are separate rows** — don't merge them; they have different price points and the client expects them split
- **Cache keys must be normalised** — use lowercase and trim whitespace on card name + set name + company to avoid cache misses for equivalent queries
