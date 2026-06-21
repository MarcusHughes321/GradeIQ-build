---
name: Values daily-job catch-up & dynamic set cleanup
description: Pitfalls in the Values backend daily schedulers (boot catch-up guard) and the JP Top Picks dynamic candidate-set cleanup DELETE.
---

Two durable lessons about the once-daily Values backend jobs (EN/JP catalog price syncs, set-status refresh, EN/JP Top Picks) running on a frequently-restarting Reserved VM (restarts every 1-2h).

## Boot catch-up guard uses a MAX(column) proxy — can be silently suppressed
The daily schedulers decide "did today's window already run?" by reading MAX(price_updated_at) (catalogs) / MAX(checked_at) (set-status) and comparing to today's window time, then either catching up after a short staggered delay or scheduling to the next window. This mirrors the proven top-picks pattern.

**Why it's fragile:** the guard really means "any row was written today", NOT "the daily job ran today". Other per-boot background tasks write the same columns — the truncated-set re-sync, `fillMeSetPricesFromPokeTrace` (sets `price_updated_at = NOW()`), and `upsertSetPriceStatus` (sets `checked_at`). If one writes a row after today's window on a boot where the window was missed, MAX() ≥ window-time and the catch-up is skipped for that day. Today those tasks are convergent no-ops ("nothing to fill") so the risk is rare and self-heals next day.

**How to apply:** acceptable as-is. The durable fix, if catch-ups are ever observed not firing, is persisting per-job last-run timestamps (e.g. `admin_settings` keys) instead of MAX() proxies.

## Dynamic candidate-set list + cleanup DELETE = data-loss risk on upstream outage
JP Top Picks builds its candidate set list as curated `JP_SET_SLUGS` ∪ slugs derived from the newest ~40 `buildTcgdexSetList("ja")` sets, then runs `DELETE ... WHERE lang='ja' AND set_id NOT IN (candidates)` to purge picks for removed/non-candidate sets.

**Why it's dangerous:** if the dynamic augmentation (TCGdex fetch) throws, the candidate list falls back to curated-only, and the cleanup DELETE then wipes every dynamically-added set's picks for the day — a single transient upstream outage at job time destroys good data.

**How to apply:** `getJpTopPicksSlugs()` returns an `{ slugs, augmented }` pair; the cleanup DELETE only runs when `augmented` is true. Any "rolling-window candidate list + cleanup DELETE" pattern must gate the DELETE on the list being fully built, never on a degraded fallback. (Note: a set aging out of the newest-40 window that isn't curated will have its picks deleted — intended rolling-window behavior.)
