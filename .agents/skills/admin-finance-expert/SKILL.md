---
name: admin-finance-expert
description: L2 expert on the Admin and Analytics flow in Grade.IQ. Knows the finance tab P&L calculation, AI cost tracking, usage analytics, price flags, and card variant management. Consult when building anything that changes the admin panel, adds new tracked metrics, modifies the finance calculation, or touches admin-protected routes.
---

# Admin & Analytics Flow — L2 Expert

You know the admin panel end-to-end. The admin panel is for internal use — monitoring the business, understanding costs, and managing data quality. It is protected by a password and hidden from normal users.

---

## Access Control

**Admin mode is activated** in the Settings tab by entering the `ADMIN_PASSWORD` (server-side env var). On correct entry, the server sets a session flag. The client stores admin mode state in AsyncStorage (`gradeiq_admin_mode` key) and exposes it via `useSubscription()` as `isAdminMode`.

**`isAdminMode` effects:**
- Bypasses all subscription gates (admin can use every feature without a subscription)
- Shows the "Admin" entry point in Settings
- Shows the price flag count badge on the Settings tab icon

The admin panel is at `app/admin-analytics.tsx`. It has two tabs: **Stats** and **Finance**.

---

## Stats Tab

### Usage metrics
- Grading volume over time (total grades per day/week/month)
- Active users (unique `stable_user_id` values with at least one grade in period)
- Breakdown by grade mode (quick/deep/crossover/bulk)

Data source: `grading_history` table, grouped by `created_at` and mode.

### Subscription metrics
- Count of users per tier (from `subscription_cache` table)
- Pulled from RevenueCat via server to ensure accuracy

---

## Finance Tab (`GET /api/admin/financials`)

The P&L calculator for the business.

### Revenue calculation
```
Gross MRR = (curious_count × £2.99) + (enthusiast_count × £5.99) + (obsessed_count × £9.99)
Platform fee = gross_mrr × platform_fee_pct  [editable, default: Apple SBP 15%]
RC fee = gross_mrr × 0.01  [only if MRR > $2,500]
Net MRR = gross_mrr - platform_fee - rc_fee
```

Platform fee is editable in the UI: Apple standard (30%), Apple SBP (15%), or custom %.

### Cost calculation
Monthly recurring costs:
- **Replit subscription** — editable (`replit_monthly_gbp` in `admin_settings`)
- **PokeTrace API** — editable (`poketrace_monthly_gbp`, default £15)
- **AI costs** — real spend pulled from `ai_cost_log` for current month

```
Total monthly cost = replit + poketrace + ai_costs
Monthly profit = net_mrr - total_monthly_cost
Margin % = monthly_profit / net_mrr × 100
```

### Investment to Date
Individual real amounts stored in `admin_settings`:
| Key | Description |
|-----|-------------|
| `replit_total_gbp` | Total Replit spend (actual bank total) |
| `apple_licence_gbp` | Apple developer licence |
| `google_play_gbp` | Google Play developer licence |
| `poketrace_monthly_gbp` | PokeTrace monthly rate |
| `poketrace_months_used` | Months of PokeTrace used |
| `other_costs_gbp` | Any other one-off costs |
| `replit_monthly_gbp` | Current Replit monthly rate |
| `platform_fee_pct` | Platform fee percentage |

AI API costs are pulled automatically from `ai_cost_log` all-time total — not stored separately.

**Payback calculation:** `total_invested / monthly_profit = months_to_payback`. Only shown when profitable.

### Editable fields
All cost inputs are editable inline in the Finance tab. Changes are saved via `POST /api/admin/settings` and persisted in the `admin_settings` table.

---

## AI Cost Tracking

Every Claude or AI call in the app logs to `ai_cost_log`:

| Column | Description |
|--------|-------------|
| `month` | YYYY-MM |
| `mode` | `quick`, `deep`, `crossover`, `collection`, `deal_advisor` |
| `model` | e.g. `claude-sonnet-4-6`, `claude-haiku-4-5` |
| `input_tokens` | Token count |
| `output_tokens` | Token count |
| `cost_usd` | Calculated from token counts |

**Pricing used:**
- Claude Sonnet 4-6: $3/M input tokens, $15/M output tokens
- Claude Haiku: approximately $0.25/M input, $1.25/M output

Any new AI feature must log to `ai_cost_log` using the `logAiCost(mode, model, inputTokens, outputTokens)` helper. Do not skip this — the finance tab relies on complete data.

---

## Price Flags (`app/admin-price-flags.tsx`)

When eBay prices for a card look anomalous, a row is written to `price_flags` table. This happens automatically when the pricing engine detects outliers.

The price flags screen lists all flagged entries with:
- Card name, set, grade, cached price
- Why it was flagged (e.g. price out of expected range)
- Options: confirm price (mark as reviewed), update price, or dismiss flag

**Correction logging:** All admin price corrections are written to `corrections_log` table for audit trail.

**Badge count:** `GET /api/admin/price-flags/count` returns the count of unreviewed flags. Polled every 60s and shown on the Settings tab icon when in admin mode.

---

## Card Variants Admin (`app/admin-card-variants.tsx`)

Manages stamped card variants in the `card_variants` table:
- Prerelease stamp
- Staff stamp
- Pokémon Centre stamp
- Build & Battle stamp
- Trick or Trade stamp

Admin can trigger a sync from TCGdex to pull new stamped variants: `POST /api/admin/card-variants/sync-tcgdex`.

---

## Key Files

- `app/admin-analytics.tsx` — main admin screen (Stats + Finance tabs)
- `app/admin-price-flags.tsx` — price flag review
- `app/admin-card-variants.tsx` — card variant management
- `server/routes.ts` — `GET /api/admin/financials`, `POST /api/admin/settings`, `GET /api/admin/price-flags`, `GET /api/admin/analytics`

---

## Common Mistakes to Avoid

- **Every new AI feature must log to `ai_cost_log`** — the finance tab is only accurate if every call is tracked
- **Admin routes must check session auth** — never expose admin data without verifying the admin session
- **`isAdminMode` bypasses all subscription gates** — don't add additional "if admin" checks scattered around the codebase; the existing pattern handles it
- **Investment totals are manually entered, not calculated** — `replit_total_gbp` is an actual bank statement figure, not derived from monthly × months
