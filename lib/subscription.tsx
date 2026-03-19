import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, AppState, type AppStateStatus } from "react-native";
import Purchases, { LOG_LEVEL, type CustomerInfo } from "react-native-purchases";

const USAGE_KEY = "gradeiq_monthly_usage";
const DEEP_USAGE_KEY = "gradeiq_deep_monthly_usage";
const ADMIN_KEY = "gradeiq_admin_mode";
const FREE_MONTHLY_LIMIT = 3;

const GATE_ENABLED = (process.env.EXPO_PUBLIC_SUBSCRIPTION_GATE ?? "on") === "on";

const RC_API_KEY_IOS = process.env.EXPO_PUBLIC_RC_IOS_KEY || "appl_LEqJaUDWqGpXjrsgyQHtYaHyXRb";
const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_RC_ANDROID_KEY || "";

export type SubscriptionTier = "free" | "curious" | "enthusiast" | "obsessed";

export interface TierInfo {
  id: SubscriptionTier;
  name: string;
  price: string;
  monthlyLimit: number | null;
  deepGradeLimit: number;
  entitlementId: string;
}

export interface SubscriptionRefreshResult {
  tier: SubscriptionTier;
  wasUpgrade: boolean;
}

export const TIERS: Record<SubscriptionTier, TierInfo> = {
  free: { id: "free", name: "Free", price: "Free", monthlyLimit: FREE_MONTHLY_LIMIT, deepGradeLimit: 0, entitlementId: "" },
  curious: { id: "curious", name: "Grade Curious", price: "£2.99", monthlyLimit: 15, deepGradeLimit: 2, entitlementId: "Grade.IQ Pro" },
  enthusiast: { id: "enthusiast", name: "Grade Enthusiast", price: "£5.99", monthlyLimit: 50, deepGradeLimit: 7, entitlementId: "Grade.IQ Pro" },
  obsessed: { id: "obsessed", name: "Grade Obsessed", price: "£9.99", monthlyLimit: null, deepGradeLimit: 30, entitlementId: "Grade.IQ Pro" },
};

interface MonthlyUsage {
  month: string;
  count: number;
}

interface SubscriptionContextValue {
  isGateEnabled: boolean;
  isSubscribed: boolean;
  currentTier: SubscriptionTier;
  tierInfo: TierInfo;
  monthlyUsageCount: number;
  monthlyLimit: number | null;
  remainingGrades: number | null;
  canGrade: boolean;
  recordUsage: (count?: number) => Promise<boolean>;
  checkCanGrade: (count?: number) => boolean;
  loading: boolean;
  rcLoading: boolean;
  purchaseTier: (tier: SubscriptionTier) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  refreshSubscription: () => Promise<SubscriptionRefreshResult>;
  forceSyncSubscription: () => Promise<boolean>;
  rcConfigured: boolean;
  rcAppUserId: string;
  deepMonthlyUsageCount: number;
  deepMonthlyLimit: number;
  remainingDeepGrades: number;
  canDeepGrade: boolean;
  checkCanDeepGrade: () => boolean;
  recordDeepUsage: () => Promise<boolean>;
  canCrossover: boolean;
  canBulk: boolean;
  isAdminMode: boolean;
  toggleAdminMode: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

function getMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function getMonthlyUsage(): Promise<MonthlyUsage> {
  try {
    const data = await AsyncStorage.getItem(USAGE_KEY);
    if (!data) return { month: getMonthKey(), count: 0 };
    const parsed = JSON.parse(data) as MonthlyUsage;
    if (parsed.month !== getMonthKey()) {
      return { month: getMonthKey(), count: 0 };
    }
    return parsed;
  } catch {
    return { month: getMonthKey(), count: 0 };
  }
}

async function saveMonthlyUsage(usage: MonthlyUsage): Promise<void> {
  await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(usage));
}

interface DeepMonthlyUsage {
  month: string;
  count: number;
}

async function getDeepMonthlyUsage(): Promise<DeepMonthlyUsage> {
  try {
    const data = await AsyncStorage.getItem(DEEP_USAGE_KEY);
    if (!data) return { month: getMonthKey(), count: 0 };
    const parsed = JSON.parse(data) as DeepMonthlyUsage;
    if (parsed.month !== getMonthKey()) {
      return { month: getMonthKey(), count: 0 };
    }
    return parsed;
  } catch {
    return { month: getMonthKey(), count: 0 };
  }
}

async function saveDeepMonthlyUsage(usage: DeepMonthlyUsage): Promise<void> {
  await AsyncStorage.setItem(DEEP_USAGE_KEY, JSON.stringify(usage));
}

function determineTier(info: CustomerInfo | null): SubscriptionTier {
  if (!info) return "free";
  const entitlement = info.entitlements.active["Grade.IQ Pro"];
  if (!entitlement) return "free";
  const productId = entitlement.productIdentifier || "";
  if (productId.includes("obsessed")) return "obsessed";
  if (productId.includes("enthusiast")) return "enthusiast";
  if (productId.includes("curious")) return "curious";
  return "curious";
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const isGateEnabled = GATE_ENABLED;
  const [monthlyUsageCount, setMonthlyUsageCount] = useState(0);
  const [deepMonthlyUsageCount, setDeepMonthlyUsageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rcLoading, setRcLoading] = useState(true);
  const [currentTier, setCurrentTier] = useState<SubscriptionTier>("free");
  const [rcConfigured, setRcConfigured] = useState(false);
  const [rcAppUserId, setRcAppUserId] = useState<string>("");
  const [isAdminMode, setIsAdminMode] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const rcConfiguredRef = useRef(false);

  // Defined before useEffect so the closure captures it correctly
  const handleAppStateChange = useCallback(async (nextState: AppStateStatus) => {
    const prev = appStateRef.current;
    appStateRef.current = nextState;
    if (prev.match(/inactive|background/) && nextState === "active" && rcConfiguredRef.current) {
      try {
        await Purchases.invalidateCustomerInfoCache();
        const info = await Purchases.getCustomerInfo();
        const tier = determineTier(info);
        console.log("[subscription] Foreground refresh: tier=", tier,
          "| entitlements=", Object.keys(info.entitlements.active),
          "| userId=", info.originalAppUserId);
        setCurrentTier(tier);
        setRcAppUserId(info.originalAppUserId ?? "");
      } catch (e) {
        console.log("[subscription] Foreground refresh failed:", e);
      }
    }
  }, []);

  useEffect(() => {
    Promise.all([getMonthlyUsage(), getDeepMonthlyUsage()]).then(([usage, deepUsage]) => {
      setMonthlyUsageCount(usage.count);
      setDeepMonthlyUsageCount(deepUsage.count);
      setLoading(false);
    });

    AsyncStorage.getItem(ADMIN_KEY).then((val) => {
      if (val === "enabled") setIsAdminMode(true);
    });

    // Safety net: if RevenueCat never resolves (e.g. network offline at launch),
    // clear the loading spinner after 10 seconds so the UI isn't stuck.
    const rcTimeout = setTimeout(() => setRcLoading(false), 10000);

    initRevenueCat().finally(() => clearTimeout(rcTimeout));

    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      sub.remove();
      clearTimeout(rcTimeout);
    };
  }, [handleAppStateChange]);

  const toggleAdminMode = useCallback(async () => {
    const next = !isAdminMode;
    setIsAdminMode(next);
    await AsyncStorage.setItem(ADMIN_KEY, next ? "enabled" : "disabled");
  }, [isAdminMode]);

  const initRevenueCat = async () => {
    try {
      const apiKey = Platform.OS === "ios" ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
      if (!apiKey) {
        setRcLoading(false);
        return;
      }

      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      await Purchases.configure({ apiKey });
      setRcConfigured(true);
      rcConfiguredRef.current = true;

      // ── Get subscription status from RC servers ──────────────────────────────
      // RC documentation says to use getCustomerInfo() at startup — this fetches
      // the authoritative subscription state from RevenueCat's servers and
      // reflects any active entitlement the user has. syncPurchases is only for
      // the explicit "Restore Purchases" flow, not startup detection.
      const info = await Purchases.getCustomerInfo();
      const tier = determineTier(info);
      const userId = info.originalAppUserId ?? "unknown";
      console.log("[subscription] Init: tier=", tier,
        "| entitlements=", Object.keys(info.entitlements.active),
        "| productId=", info.entitlements.active["Grade.IQ Pro"]?.productIdentifier ?? "none",
        "| activeSubscriptions=", info.activeSubscriptions,
        "| RC userId=", userId);

      setCurrentTier(tier);
      setRcAppUserId(userId);

      // RC pushes real-time updates whenever entitlement status changes
      // (e.g. immediately after a purchase completes or a subscription renews)
      Purchases.addCustomerInfoUpdateListener((updated) => {
        const updatedTier = determineTier(updated);
        console.log("[subscription] CustomerInfo update: tier=", updatedTier,
          "| entitlements=", Object.keys(updated.entitlements.active),
          "| activeSubscriptions=", updated.activeSubscriptions,
          "| RC userId=", updated.originalAppUserId);
        setCurrentTier(updatedTier);
        setRcAppUserId(updated.originalAppUserId ?? "");
      });
    } catch (e: any) {
      console.log("[subscription] RevenueCat init error:", e?.message ?? e);
    } finally {
      setRcLoading(false);
    }
  };

  const isSubscribed = currentTier !== "free";
  const tierInfo = TIERS[currentTier];
  const monthlyLimit = tierInfo.monthlyLimit;

  const remainingGrades = monthlyLimit === null ? null : Math.max(0, monthlyLimit - monthlyUsageCount);

  const canGrade = isAdminMode || !isGateEnabled || (monthlyLimit === null ? true : (remainingGrades !== null && remainingGrades > 0));

  const checkCanGrade = useCallback(
    (count: number = 1) => {
      if (isAdminMode) return true;
      if (!isGateEnabled) return true;
      if (monthlyLimit === null) return true;
      return monthlyUsageCount + count <= monthlyLimit;
    },
    [isAdminMode, isGateEnabled, monthlyLimit, monthlyUsageCount]
  );

  const recordUsage = useCallback(
    async (count: number = 1): Promise<boolean> => {
      if (isAdminMode) return true;
      if (!isGateEnabled) return true;
      if (monthlyLimit === null) return true;
      const usage = await getMonthlyUsage();
      if (usage.count + count > monthlyLimit) return false;
      usage.count += count;
      await saveMonthlyUsage(usage);
      setMonthlyUsageCount(usage.count);
      return true;
    },
    [isAdminMode, isGateEnabled, monthlyLimit]
  );

  const deepGradeLimit = tierInfo.deepGradeLimit;
  const remainingDeepGrades = Math.max(0, deepGradeLimit - deepMonthlyUsageCount);
  const canDeepGrade = isAdminMode || !isGateEnabled || (deepGradeLimit > 0 && (deepMonthlyUsageCount < deepGradeLimit));

  const checkCanDeepGrade = useCallback(
    () => {
      if (isAdminMode) return true;
      if (!isGateEnabled) return true;
      if (deepGradeLimit <= 0) return false;
      return deepMonthlyUsageCount + 1 <= deepGradeLimit;
    },
    [isAdminMode, isGateEnabled, deepGradeLimit, deepMonthlyUsageCount]
  );

  const recordDeepUsage = useCallback(
    async (): Promise<boolean> => {
      if (isAdminMode) return true;
      if (!isGateEnabled) return true;
      if (deepGradeLimit <= 0) return false;
      const usage = await getDeepMonthlyUsage();
      if (usage.count + 1 > deepGradeLimit) return false;
      usage.count += 1;
      await saveDeepMonthlyUsage(usage);
      setDeepMonthlyUsageCount(usage.count);
      return true;
    },
    [isAdminMode, isGateEnabled, deepGradeLimit]
  );

  const purchaseTier = useCallback(async (tier: SubscriptionTier): Promise<boolean> => {
    if (!rcConfigured) {
      console.log("purchaseTier: RevenueCat not configured");
      throw new Error("SUBSCRIPTION_NOT_CONFIGURED");
    }
    try {
      const offerings = await Purchases.getOfferings();
      const targetEntitlement = TIERS[tier].entitlementId;
      console.log("purchaseTier: offerings loaded, current:", offerings.current ? "yes" : "no");

      let targetPackage = null;
      if (offerings.current) {
        const allPackages = offerings.current.availablePackages;
        console.log("purchaseTier: available packages:", allPackages.map(p => p.product.identifier));
        for (const pkg of allPackages) {
          if (pkg.product.identifier.includes(tier)) {
            targetPackage = pkg;
            break;
          }
        }
        if (!targetPackage) {
          console.log("purchaseTier: no exact match, checking monthly package");
          const monthly = offerings.current.monthly;
          if (monthly && monthly.product.identifier.includes(tier)) {
            targetPackage = monthly;
          }
        }
      }

      if (!targetPackage) {
        console.log("purchaseTier: no matching package found for tier:", tier);
        throw new Error("NO_PACKAGES_AVAILABLE");
      }

      console.log("purchaseTier: purchasing package:", targetPackage.product.identifier);
      const { customerInfo } = await Purchases.purchasePackage(targetPackage);

      // If entitlement is immediately active, great
      if (customerInfo.entitlements.active[targetEntitlement] !== undefined) {
        console.log("purchaseTier: entitlement active immediately, tier=", determineTier(customerInfo));
        setCurrentTier(determineTier(customerInfo));
        return true;
      }

      // Payment went through but entitlement not yet reflected — sandbox/server propagation delay.
      // Retry up to 3 times with cache invalidation to force a fresh fetch from RevenueCat servers.
      console.log("purchaseTier: entitlement not yet active, retrying with cache invalidation...");
      const retryDelays = [2000, 4000, 6000];
      for (let i = 0; i < retryDelays.length; i++) {
        await new Promise(resolve => setTimeout(resolve, retryDelays[i]));
        try {
          await Purchases.invalidateCustomerInfoCache();
        } catch (_) {}
        const retried = await Purchases.getCustomerInfo();
        const retriedTier = determineTier(retried);
        console.log(`purchaseTier: retry ${i + 1} — entitlements:`, Object.keys(retried.entitlements.active), "tier=", retriedTier);
        setCurrentTier(retriedTier);
        if (retried.entitlements.active[targetEntitlement] !== undefined) {
          return true;
        }
      }

      // Still not reflecting — payment went through, return true.
      // The addCustomerInfoUpdateListener will update the tier when RC catches up.
      return true;
    } catch (e: any) {
      if (e.userCancelled) {
        console.log("purchaseTier: user cancelled");
        throw new Error("USER_CANCELLED");
      }
      if (e.message === "NO_PACKAGES_AVAILABLE" || e.message === "SUBSCRIPTION_NOT_CONFIGURED") {
        throw e;
      }
      const rcCode = e.code ?? e.errorCode ?? "UNKNOWN";
      const rcMessage = e.underlyingErrorMessage ?? e.readableErrorCode ?? e.message ?? "";
      console.error("Purchase error code:", rcCode, "message:", rcMessage, "full:", JSON.stringify(e));
      throw new Error(`PURCHASE_FAILED|${rcCode}|${rcMessage}`);
    }
  }, [rcConfigured]);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    if (!rcConfigured) return false;
    console.log("[restore] Starting — contacting Apple to restore purchases...");
    try {
      await Purchases.invalidateCustomerInfoCache();
      // Purchases.restorePurchases() contacts Apple's servers and retrieves all
      // active subscriptions for this Apple ID, regardless of which device or
      // RC user originally purchased. This is the definitive Apple check.
      const info = await Purchases.restorePurchases();
      const tier = determineTier(info);
      console.log("[restore] Result: tier=", tier,
        "| entitlements=", Object.keys(info.entitlements.active),
        "| userId=", info.originalAppUserId);
      setCurrentTier(tier);
      setRcAppUserId(info.originalAppUserId ?? "");
      return tier !== "free";
    } catch (e: any) {
      const msg = e?.message ?? e?.underlyingErrorMessage ?? e?.readableErrorCode ?? String(e);
      console.error("[restore] Error:", msg);
      throw new Error(msg);
    }
  }, [rcConfigured]);

  const forceSyncSubscription = useCallback(async (): Promise<boolean> => {
    if (!rcConfigured) return false;
    console.log("[forcesync] Starting — checking RC servers directly first...");
    try {
      await Purchases.invalidateCustomerInfoCache();

      // ── Step 1: Read RC servers first (before any Apple sync) ───────────────
      // getCustomerInfo() fetches the authoritative state from RC's own servers.
      // This picks up manual grants, promotional entitlements, and any RC-side
      // changes WITHOUT touching Apple. Must happen before sync, because
      // syncPurchasesForResult() sends the Apple receipt which (if expired/empty)
      // can cause RC to revise/remove entitlements granted outside of Apple.
      const infoFirst = await Purchases.getCustomerInfo();
      const tierFirst = determineTier(infoFirst);
      console.log("[forcesync] RC direct fetch: tier=", tierFirst,
        "| entitlements=", Object.keys(infoFirst.entitlements.active),
        "| userId=", infoFirst.originalAppUserId);
      if (tierFirst !== "free") {
        setCurrentTier(tierFirst);
        setRcAppUserId(infoFirst.originalAppUserId ?? "");
        return true;
      }

      // ── Step 2: Apple receipt sync (catches SK2 local transactions) ─────────
      // Only run if Step 1 found nothing. This syncs any Apple receipts on-device
      // to the current RC user — useful for reinstalls with a valid Apple subscription.
      console.log("[forcesync] RC returned free, trying Apple receipt sync...");
      try {
        const syncResult = await Purchases.syncPurchasesForResult();
        if (syncResult?.customerInfo) {
          const syncTier = determineTier(syncResult.customerInfo);
          console.log("[forcesync] Apple sync result: tier=", syncTier,
            "| entitlements=", Object.keys(syncResult.customerInfo.entitlements.active));
          if (syncTier !== "free") {
            setCurrentTier(syncTier);
            setRcAppUserId(syncResult.customerInfo.originalAppUserId ?? "");
            return true;
          }
        }
      } catch (syncErr: any) {
        console.log("[forcesync] Apple sync failed (non-fatal):", syncErr?.message ?? syncErr);
      }

      // ── Step 3: Final RC check after sync ───────────────────────────────────
      await Purchases.invalidateCustomerInfoCache();
      const infoFinal = await Purchases.getCustomerInfo();
      const tierFinal = determineTier(infoFinal);
      console.log("[forcesync] Final RC check: tier=", tierFinal,
        "| entitlements=", Object.keys(infoFinal.entitlements.active));
      setCurrentTier(tierFinal);
      setRcAppUserId(infoFinal.originalAppUserId ?? "");
      return tierFinal !== "free";
    } catch (e: any) {
      const msg = e?.message ?? e?.underlyingErrorMessage ?? String(e);
      console.error("[forcesync] Error:", msg);
      throw new Error(msg);
    }
  }, [rcConfigured]);

  const refreshSubscription = useCallback(async (): Promise<SubscriptionRefreshResult> => {
    const prevTier = currentTier;
    if (!rcConfigured) return { tier: prevTier, wasUpgrade: false };
    try {
      const info = await Purchases.getCustomerInfo();
      const tier = determineTier(info);
      console.log("[subscription] Manual refresh: tier=", tier, "entitlements=", Object.keys(info.entitlements.active));
      setCurrentTier(tier);
      return { tier, wasUpgrade: tier !== "free" && tier !== prevTier };
    } catch (e) {
      console.error("[subscription] Manual refresh error:", e);
      return { tier: prevTier, wasUpgrade: false };
    }
  }, [rcConfigured, currentTier]);

  const deepMonthlyLimit = deepGradeLimit;

  const canCrossover = isAdminMode || !isGateEnabled || isSubscribed;
  const canBulk = isAdminMode || !isGateEnabled || currentTier === "curious" || currentTier === "enthusiast" || currentTier === "obsessed";

  const value = useMemo(
    () => ({
      isGateEnabled,
      isSubscribed,
      currentTier,
      tierInfo,
      monthlyUsageCount,
      monthlyLimit,
      remainingGrades,
      canGrade,
      recordUsage,
      checkCanGrade,
      loading,
      rcLoading,
      purchaseTier,
      restorePurchases,
      refreshSubscription,
      forceSyncSubscription,
      rcConfigured,
      rcAppUserId,
      deepMonthlyUsageCount,
      deepMonthlyLimit,
      remainingDeepGrades,
      canDeepGrade,
      checkCanDeepGrade,
      recordDeepUsage,
      canCrossover,
      canBulk,
      isAdminMode,
      toggleAdminMode,
    }),
    [isGateEnabled, isSubscribed, currentTier, tierInfo, monthlyUsageCount, monthlyLimit, remainingGrades, canGrade, recordUsage, checkCanGrade, loading, rcLoading, purchaseTier, restorePurchases, refreshSubscription, forceSyncSubscription, rcConfigured, rcAppUserId, deepMonthlyUsageCount, deepMonthlyLimit, remainingDeepGrades, canDeepGrade, checkCanDeepGrade, recordDeepUsage, canCrossover, canBulk, isAdminMode, toggleAdminMode]
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}
