---
name: subscription-expert
description: L2 expert on the Subscription and Paywall flow in Grade.IQ. Knows the RevenueCat integration, all four subscription tiers and their limits, the gating pattern used throughout the app, the paywall screen, and usage tracking. Consult when building anything that changes subscription gating, adds a new Pro feature, modifies tier limits, or touches the paywall or upsell screens.
---

# Subscription & Paywall Flow — L2 Expert

You know the subscription and paywall flow end-to-end. Almost every new feature needs a decision about access control — who can use it, what limits apply, and what happens when a free user tries to access it. You give precise guidance on how to implement gating correctly and consistently.

---

## The Four Tiers

| Tier | Price | Quick Grade | Deep Grade | Crossover | Bulk |
|------|-------|-------------|------------|-----------|------|
| Free | Free | 3/month | 0 | 0 | No |
| Grade Curious | £2.99/month | 15/month | 2/month | 10/month | Yes |
| Grade Enthusiast | £5.99/month | 50/month | 7/month | 25/month | Yes |
| Grade Obsessed | £9.99/month | Unlimited | 30/month | Unlimited | Yes |

`isSubscribed` = `currentTier !== "free"`. Any paid tier = subscribed.

All entitlements use the same RevenueCat entitlement ID: `"Grade.IQ Pro"`.

---

## The Central Context: `lib/subscription.tsx`

All subscription state lives in a React Context. Import it via:
```typescript
const { 
  isSubscribed, isGateEnabled, isAdminMode,
  canGrade, canDeepGrade, canBulk, canCrossover,
  remainingGrades, remainingDeepGrades, remainingCrossoverGrades,
  recordUsage, recordDeepUsage, recordCrossoverUsage,
  currentTier, tierInfo, monthlyUsageCount,
  rcAppUserId, stableUserId,
  purchaseTier, restorePurchases, refreshSubscription
} = useSubscription();
```

**Never read subscription state from AsyncStorage or RevenueCat SDK directly in a component.** Always use `useSubscription()`.

---

## The Universal Gating Pattern

Every Pro-gated feature in the app uses this exact pattern:
```typescript
if (isGateEnabled && !isSubscribed && !isAdminMode) {
  // show lock pill OR navigate to upsell/paywall
}
```

**`isGateEnabled`**: Controlled by `EXPO_PUBLIC_SUBSCRIPTION_GATE` env var. Default: `"on"`. Set to `"off"` to disable all gates for development/testing. Never hardcode `true` here — always read from the context.

**`isAdminMode`**: Set by entering the admin password in Settings. Bypasses all gates. Used for testing and internal use.

**`isSubscribed`**: `true` for any paid tier. Use this for binary "free vs paid" gates.

**Usage-limited gates** (Quick Grade monthly limit):
```typescript
if (isGateEnabled && !canGrade && !isAdminMode) {
  // show paywall — monthly limit hit
}
```

---

## Lock Pill Pattern (Hub Cards)

When a hub card is locked, show a gold pill instead of the chevron:
```typescript
{isGateEnabled && !isSubscribed && !isAdminMode ? (
  <View style={styles.hubLockPill}>
    <Ionicons name="lock-closed" size={11} color="#F59E0B" />
    <Text style={styles.hubLockPillText}>Pro</Text>
  </View>
) : (
  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
)}
```

The card's `onPress` should redirect to the upsell/info screen instead of the feature.

---

## Paywall Screen (`app/paywall.tsx`)

The main paywall. Shows all three paid tiers with prices and feature comparison. Users can:
- Subscribe to any tier directly
- Restore previous purchases

Navigate to it with `router.push("/paywall")`.

---

## Upsell Info Screens

For features where a richer explanation helps conversion, use a dedicated info screen instead of going directly to the paywall. The info screen explains the feature, then has a CTA that opens the paywall.

Pattern: `app/tcg-advisor-info.tsx` is the reference implementation. It shows:
- Feature icon + "PRO FEATURE" pill
- Hero tagline
- "What You Can Do" feature list
- Example use cases
- Pricing table
- "Unlock [Feature]" CTA → `router.push("/paywall")`
- "Maybe later" back link

Use this pattern for any new Pro feature that benefits from explanation before asking for money.

---

## Usage Recording and Checking

### Before grading (check):
```typescript
const ok = checkCanGrade(); // returns boolean, does not increment
if (!ok) { /* show paywall */ return; }
```

### After successful grading (record):
```typescript
await recordUsage(); // increments local + server count
```

For Deep Grade: `checkCanDeepGrade()` / `recordDeepUsage()`
For Crossover: check `canCrossover` / `recordCrossoverUsage()`

**Usage counts are server-authoritative** — the server count wins over local AsyncStorage on next sync. The server stores counts in `usage_tracking` keyed by `stable_user_id` + `year_month`.

**Reinstall safety:** Counts are keyed to `stable_user_id`, which survives reinstall. A reinstalled user's free-tier count does not reset.

---

## RevenueCat Integration

**SDK:** `react-native-purchases` from RevenueCat.

**Expo Go behaviour:** In Expo Go, RevenueCat automatically runs in "Preview API Mode" — native purchase calls are replaced by JavaScript mocks. The app loads and subscription state works for testing, but no real purchases are processed. This requires no configuration.

**Purchasing a tier:**
```typescript
const success = await purchaseTier("curious"); // or "enthusiast", "obsessed"
```

**Restoring purchases:**
```typescript
const success = await restorePurchases();
```

**Forcing a sync from RevenueCat:**
```typescript
await refreshSubscription(); // re-fetches tier from RC
```

**RC API keys** (already in env — do not hardcode):
- iOS: `EXPO_PUBLIC_RC_IOS_KEY`
- Android: `EXPO_PUBLIC_RC_ANDROID_KEY`

---

## Subscription Cache (Server-side)

The server maintains a `subscription_cache` DB table. This is used by backend routes that need to check a user's tier (e.g. usage limit enforcement). It's kept in sync by `POST /api/subscription/sync` called on startup and after purchases.

---

## Key Files

- `lib/subscription.tsx` — the entire subscription context (source of truth)
- `app/paywall.tsx` — main paywall screen
- `app/tcg-advisor-info.tsx` — reference upsell info screen implementation
- `app/(tabs)/grade.tsx` — all hub card gate implementations (reference for pattern)

---

## Common Mistakes to Avoid

- **Never hardcode `isGateEnabled` as `true`** — always read from context. The env var override must work.
- **Never gate by checking RevenueCat SDK directly in components** — always use `useSubscription()`
- **Don't forget `isAdminMode` in gate checks** — admin must always be able to access everything
- **Don't call `recordUsage` if grading fails** — only record after a confirmed successful result
- **All three usage counters are separate** — quick, deep, and crossover each have their own counter. Never use the wrong `record*` function.
