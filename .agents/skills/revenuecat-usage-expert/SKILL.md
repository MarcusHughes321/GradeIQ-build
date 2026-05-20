---
name: revenuecat-usage-expert
description: L3 expert on the RevenueCat integration, usage tracking, and stable user identity in Grade.IQ. Knows the subscription_cache and usage_tracking DB tables, the stable UUID system (Keychain + AsyncStorage), the startup sync sequence, and how free-tier limits are enforced. Consult when changing subscription state management, usage limit logic, the stable UUID system, or debugging identity/count issues after reinstall.
---

# RevenueCat, Usage Tracking & User Identity — L3 Expert

You know the three interlocking systems that control who can do what in Grade.IQ: RevenueCat subscription state, server-side usage tracking, and the stable user identity that ties them together across reinstalls.

---

## The Identity Problem Grade.IQ Solves

RevenueCat assigns every new app install a random anonymous user ID. On reinstall, this ID changes. Without a stable identity:
- Free users could reinstall to reset their 3 monthly quick grades
- Grading history would disappear on reinstall
- Usage counts would reset

**Solution: Stable UUID** — generated once, stored in iOS Keychain (survives reinstall on iOS 10.3+), and used as the primary key for all usage and history data.

---

## Stable UUID (`lib/stable-user-id.ts`)

### Generation
First app launch: `Crypto.randomUUID()` from `expo-crypto`.

```typescript
import * as Crypto from 'expo-crypto';
const uuid = Crypto.randomUUID();
```

**Do not use the `uuid` npm package** — it requires `crypto.getRandomValues()` which crashes on iOS/Android.

### Storage (two locations)
1. **iOS Keychain** via `expo-secure-store` — survives app uninstall/reinstall (iOS only; Android Keystore behaviour differs)
2. **AsyncStorage** — covers Android Auto Backup / Google Drive restore. Less reliable than Keychain but provides cross-platform coverage.

```typescript
await SecureStore.setItemAsync('gradeiq_stable_id', uuid);
await AsyncStorage.setItem('gradeiq_stable_id', uuid);
```

### Loading on startup
Tries Keychain first, falls back to AsyncStorage:

```typescript
const id = await SecureStore.getItemAsync('gradeiq_stable_id') 
        ?? await AsyncStorage.getItem('gradeiq_stable_id');
```

If neither has a value (genuine first install), generate and store a new UUID.

### Edge cases
- **Keychain read fails** (device locked, first boot): Falls back to AsyncStorage. Log the error but don't crash.
- **Both fail**: Generate a new UUID. The user appears as "new" — acceptable for genuinely new installs.
- **Different device**: No Keychain sync across devices (iOS Keychain is per-device unless using iCloud Keychain). History sync handles this via the server; usage counts stay per-device. This is acceptable — a user with two devices gets separate usage counts per device.

---

## RevenueCat SDK Integration

**Package:** `react-native-purchases`

**Keys (env vars, never hardcode):**
- `EXPO_PUBLIC_RC_IOS_KEY`
- `EXPO_PUBLIC_RC_ANDROID_KEY`

**Expo Go behaviour:** RevenueCat automatically detects Expo Go and runs in "Preview API Mode" — all purchase calls return mock success responses. No configuration needed. Real purchases only process in a native build.

### Entitlement
All paid tiers share one RevenueCat entitlement: `"Grade.IQ Pro"`.

The tier (Curious/Enthusiast/Obsessed) is determined by which product ID was purchased, stored in `subscription_cache`.

### Key SDK calls (always use via `lib/subscription.tsx`, not directly in components)
```typescript
Purchases.getCustomerInfo()         // get current subscription state
Purchases.purchasePackage(pkg)      // purchase a tier
Purchases.restorePurchases()        // restore previous purchases
Purchases.logIn(stableUserId)       // link RC anonymous ID to stable UUID
```

---

## subscription_cache DB Table

Server-side cache of RevenueCat subscription state. Used by backend routes that need to check tier (e.g. usage limit enforcement).

```sql
CREATE TABLE subscription_cache (
  rc_user_id    TEXT PRIMARY KEY,
  tier          TEXT NOT NULL,     -- 'free' | 'curious' | 'enthusiast' | 'obsessed'
  is_subscribed BOOLEAN NOT NULL,
  updated_at    TIMESTAMPTZ
);
```

**Updated by:** `POST /api/subscription/sync` — called on startup and after any purchase/restore.

Backend routes check `subscription_cache` rather than calling RevenueCat's API directly on every request (slow and rate-limited).

---

## usage_tracking Table

```sql
CREATE TABLE usage_tracking (
  id              SERIAL PRIMARY KEY,
  rc_user_id      TEXT,
  stable_user_id  TEXT,
  year_month      TEXT NOT NULL,     -- 'YYYY-MM'
  quick_count     INT NOT NULL DEFAULT 0,
  deep_count      INT NOT NULL DEFAULT 0,
  crossover_count INT NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ON usage_tracking (stable_user_id, year_month) 
  WHERE stable_user_id IS NOT NULL;
```

**The `stable_user_id` partial unique index** is the reinstall-safety mechanism. A user who reinstalls gets a new `rc_user_id` but the same `stable_user_id`. Their existing usage row is found by stable ID, so their monthly count doesn't reset.

### How grading endpoints increment counts
All three grading endpoints (`/api/grade-card`, `/api/deep-grade-job`, `/api/crossover-grade`) use this pattern:
1. Look up the usage row by `stable_user_id` + `year_month` first
2. If found, check count against tier limit
3. If limit not hit, increment the count
4. If not found, create a new row (first grade of the month)

---

## Startup Sync Sequence (Order is Critical)

The startup sequence syncs both usage counts and subscription state. The order matters:

```
1. Purchases.logIn(rcUserId)          → tell RC which user this is
2. POST /api/subscription/sync        → cache their tier server-side
3. GET /api/usage/sync?rcUserId=X     → sync usage count using RC ID
4. [load stable UUID from Keychain]   → may take a moment
5. GET /api/usage/sync?stableId=Y     → sync again with stable ID
                                         (overwrites RC-keyed count if stable count is higher)
```

**Why sync twice:** The first sync (step 3) uses the RC user ID — this gives immediate feedback to the UI. The second sync (step 5) uses the stable ID — this gives the correct count that persists across reinstalls. If the stable count > RC count, the stable count wins.

**Don't reorder or merge these steps** — the stable UUID must be loaded before the second sync, and the first sync must happen before to avoid showing "0 grades remaining" briefly.

---

## Free Tier Limits (Enforced Server-Side)

| Mode | Free | Curious | Enthusiast | Obsessed |
|------|------|---------|-----------|---------|
| Quick | 3/month | 15/month | 50/month | ∞ |
| Deep | 0 | 2/month | 7/month | 30/month |
| Crossover | 0 | 10/month | 25/month | ∞ |

**Client checks** (from `useSubscription()`) are for UX — showing remaining count, gating UI.
**Server checks** are the authoritative enforcement — even if a client-side check is bypassed, the server will reject the grade if the limit is hit.

---

## Key Files

- `lib/stable-user-id.ts` — UUID generation and storage
- `lib/subscription.tsx` — central context, startup sync, all exported subscription values
- `server/routes.ts` — usage tracking endpoints, subscription sync endpoint
- `server/db.ts` — `usage_tracking` upsert helpers

---

## Common Mistakes to Avoid

- **Never use the RC anonymous user ID as the primary usage key** — it changes on reinstall; always use `stable_user_id` as the primary key
- **Both IDs must be present in grade requests** — `rcUserId` AND `stableUserId` in every grade submission
- **Don't call RevenueCat SDK methods directly in components** — always use `useSubscription()` from the context
- **The startup sync order is not arbitrary** — swapping steps 3 and 5 causes the RC-keyed count to overwrite the stable count
- **Server-side limits are authoritative** — client-side checks are UX sugar, not security
