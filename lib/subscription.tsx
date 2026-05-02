import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, AppState, type AppStateStatus } from "react-native";
import Purchases, { LOG_LEVEL, type CustomerInfo } from "react-native-purchases";
import { getApiUrl } from "@/lib/query-client";
import { fetchServerHistory, uploadBulkGradings, uploadGradingImages, claimHistoryForStableId } from "@/lib/server-history";
import { getStableUserId } from "@/lib/stable-user-id";
import { getGradings, saveServerGrading, updateGradingImageUrls } from "@/lib/storage";
import * as FileSystem from "expo-file-system/legacy";

const USAGE_KEY = "gradeiq_monthly_usage";
const DEEP_USAGE_KEY = "gradeiq_deep_monthly_usage";
const CROSSOVER_USAGE_KEY = "gradeiq_crossover_monthly_usage";
const ADMIN_KEY = "gradeiq_admin_mode";
const FREE_MONTHLY_LIMIT = 3;

const GATE_ENABLED = (process.env.EXPO_PUBLIC_SUBSCRIPTION_GATE ?? "on") === "on";

const RC_API_KEY_IOS = process.env.EXPO_PUBLIC_RC_IOS_KEY || "appl_LEqJaUDWqGpXjrsgyQHtYaHyXRb";
const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_RC_ANDROID_KEY || "goog_PiUPqsdPMAiCwFMBwHsGxVHMyBS";

export type SubscriptionTier = "free" | "curious" | "enthusiast" | "obsessed";

export interface TierInfo {
  id: SubscriptionTier;
  name: string;
  price: string;
  monthlyLimit: number | null;
  deepGradeLimit: number;
  crossoverGradeLimit: number | null;
  entitlementId: string;
}

export interface SubscriptionRefreshResult {
  tier: SubscriptionTier;
  wasUpgrade: boolean;
}

export const TIERS: Record<SubscriptionTier, TierInfo> = {
  free:       { id: "free",       name: "Free",              price: "Free",   monthlyLimit: FREE_MONTHLY_LIMIT, deepGradeLimit: 0,  crossoverGradeLimit: 0,    entitlementId: "" },
  curious:    { id: "curious",    name: "Grade Curious",     price: "£2.99",  monthlyLimit: 15,                 deepGradeLimit: 2,  crossoverGradeLimit: 10,   entitlementId: "Grade.IQ Pro" },
  enthusiast: { id: "enthusiast", name: "Grade Enthusiast",  price: "£5.99",  monthlyLimit: 50,                 deepGradeLimit: 7,  crossoverGradeLimit: 25,   entitlementId: "Grade.IQ Pro" },
  obsessed:   { id: "obsessed",   name: "Grade Obsessed",    price: "£9.99",  monthlyLimit: null,               deepGradeLimit: 30, crossoverGradeLimit: null, entitlementId: "Grade.IQ Pro" },
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
  stableUserId: string;
  deepMonthlyUsageCount: number;
  deepMonthlyLimit: number;
  remainingDeepGrades: number;
  canDeepGrade: boolean;
  checkCanDeepGrade: () => boolean;
  recordDeepUsage: () => Promise<boolean>;
  crossoverMonthlyUsageCount: number;
  crossoverMonthlyLimit: number | null;
  remainingCrossoverGrades: number | null;
  canCrossover: boolean;
  checkCanCrossoverGrade: () => boolean;
  recordCrossoverUsage: () => Promise<boolean>;
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

async function getCrossoverMonthlyUsage(): Promise<{ month: string; count: number }> {
  try {
    const data = await AsyncStorage.getItem(CROSSOVER_USAGE_KEY);
    if (!data) return { month: getMonthKey(), count: 0 };
    const parsed = JSON.parse(data) as { month: string; count: number };
    if (parsed.month !== getMonthKey()) return { month: getMonthKey(), count: 0 };
    return parsed;
  } catch {
    return { month: getMonthKey(), count: 0 };
  }
}

async function saveCrossoverMonthlyUsage(usage: { month: string; count: number }): Promise<void> {
  await AsyncStorage.setItem(CROSSOVER_USAGE_KEY, JSON.stringify(usage));
}

function determineTier(info: CustomerInfo | null): SubscriptionTier {
  if (!info) return "free";

  const entitlement = info.entitlements.active["Grade.IQ Pro"];
  if (entitlement) {
    const productId = entitlement.productIdentifier || "";
    if (productId.includes("obsessed")) return "obsessed";
    if (productId.includes("enthusiast")) return "enthusiast";
    if (productId.includes("curious")) return "curious";
    return "curious";
  }

  for (const sub of (info.activeSubscriptions ?? [])) {
    if (sub.includes("obsessed")) return "obsessed";
    if (sub.includes("enthusiast")) return "enthusiast";
    if (sub.includes("curious")) return "curious";
  }

  return "free";
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const isGateEnabled = GATE_ENABLED;
  const [monthlyUsageCount, setMonthlyUsageCount] = useState(0);
  const [deepMonthlyUsageCount, setDeepMonthlyUsageCount] = useState(0);
  const [crossoverMonthlyUsageCount, setCrossoverMonthlyUsageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rcLoading, setRcLoading] = useState(true);
  const [currentTier, setCurrentTier] = useState<SubscriptionTier>("free");
  const currentTierRef = useRef<SubscriptionTier>("free");
  const setCurrentTierSafe = useCallback((tier: SubscriptionTier) => {
    currentTierRef.current = tier;
    setCurrentTier(tier);
  }, []);
  const [rcConfigured, setRcConfigured] = useState(false);
  const [rcAppUserId, setRcAppUserId] = useState<string>("");
  const [stableUserId, setStableUserId] = useState<string>("");
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
          "| activeSubscriptions=", info.activeSubscriptions,
          "| userId=", info.originalAppUserId);

        if (tier === "free" && currentTierRef.current !== "free") {
          console.log("[subscription] Foreground returned free but was subscribed — retrying in 3s to guard against stale RC data...");
          await new Promise(r => setTimeout(r, 3000));
          try {
            await Purchases.invalidateCustomerInfoCache();
            const retried = await Purchases.getCustomerInfo();
            const retriedTier = determineTier(retried);
            console.log("[subscription] Foreground retry: tier=", retriedTier,
              "| entitlements=", Object.keys(retried.entitlements.active));
            setCurrentTierSafe(retriedTier);
            setRcAppUserId(retried.originalAppUserId ?? "");
          } catch {
            console.log("[subscription] Foreground retry failed — keeping existing tier");
          }
          return;
        }

        setCurrentTierSafe(tier);
        setRcAppUserId(info.originalAppUserId ?? "");
      } catch (e) {
        console.log("[subscription] Foreground refresh failed:", e);
      }
    }
  }, []);

  useEffect(() => {
    Promise.all([getMonthlyUsage(), getDeepMonthlyUsage(), getCrossoverMonthlyUsage()]).then(([usage, deepUsage, crossoverUsage]) => {
      setMonthlyUsageCount(usage.count);
      setDeepMonthlyUsageCount(deepUsage.count);
      setCrossoverMonthlyUsageCount(crossoverUsage.count);
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

  const syncTierToServer = async (rcUserId: string, tier: string) => {
    if (!rcUserId || rcUserId === "unknown") return;
    try {
      const url = new URL("/api/subscription/sync", getApiUrl());
      await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rcUserId, tier }),
        signal: AbortSignal.timeout(8000),
      });
      console.log("[subscription] Tier synced to server:", tier);
    } catch (e) {
      console.log("[subscription] Tier sync failed (non-critical):", e);
    }
  };

  const syncServerUsage = async (rcUserId: string) => {
    if (!rcUserId) return;
    try {
      const url = new URL(`/api/usage?rcUserId=${encodeURIComponent(rcUserId)}`, getApiUrl());
      const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) return;
      const data = await resp.json() as { quickCount: number; deepCount: number; crossoverCount: number };
      const [local, localDeep, localCrossover] = await Promise.all([
        getMonthlyUsage(),
        getDeepMonthlyUsage(),
        getCrossoverMonthlyUsage(),
      ]);
      const serverQuick = data.quickCount ?? 0;
      const serverDeep = data.deepCount ?? 0;
      const serverCrossover = data.crossoverCount ?? 0;
      if (serverQuick > local.count) {
        const updated = { month: getMonthKey(), count: serverQuick };
        await saveMonthlyUsage(updated);
        setMonthlyUsageCount(serverQuick);
      }
      if (serverDeep > localDeep.count) {
        const updated = { month: getMonthKey(), count: serverDeep };
        await saveDeepMonthlyUsage(updated);
        setDeepMonthlyUsageCount(serverDeep);
      }
      if (serverCrossover > localCrossover.count) {
        const updated = { month: getMonthKey(), count: serverCrossover };
        await saveCrossoverMonthlyUsage(updated);
        setCrossoverMonthlyUsageCount(serverCrossover);
      }
      console.log("[subscription] Server usage synced:", { serverQuick, serverDeep, serverCrossover });
    } catch (e) {
      console.log("[subscription] Server usage sync failed (non-critical):", e);
    }
  };

  const syncHistoryWithServer = async (rcUserId: string, stableId?: string) => {
    if (!rcUserId && !stableId) return;
    try {
      const [localGradings, serverGradings] = await Promise.all([
        getGradings(),
        fetchServerHistory(rcUserId, stableId),
      ]);
      const localIds = new Set(localGradings.map(g => g.id));
      const serverIds = new Set(serverGradings.map(g => g.id));
      const newFromServer = serverGradings.filter(g => !localIds.has(g.id));
      for (const sg of newFromServer) {
        const makeUrl = (id: string | null | undefined) =>
          id ? new URL(`/api/grading-image/${encodeURIComponent(id)}`, getApiUrl()).toString() : null;
        await saveServerGrading({
          ...sg,
          frontImageUrl: makeUrl(sg.frontImageId),
          backImageUrl: makeUrl(sg.backImageId),
        });
      }
      const missingOnServer = localGradings.filter(g => g?.id && !serverIds.has(g.id));
      if (missingOnServer.length > 0) {
        uploadBulkGradings(rcUserId, missingOnServer, stableId).catch(() => {});
      }
      if (newFromServer.length > 0) {
        console.log(`[history] Restored ${newFromServer.length} grades from server`);
      }
    } catch (e) {
      console.log("[history] Sync failed (non-critical):", e);
    }
  };

  const retroactiveImageUpload = async (rcUserId: string, stableId?: string) => {
    if (!rcUserId || Platform.OS === "web") return;
    try {
      const gradings = await getGradings();
      const needsUpload = gradings.filter(
        g => g.id && (g.frontImage || g.backImage) && !g.frontImageUrl && !g.backImageUrl
      ).slice(0, 30);
      if (needsUpload.length === 0) return;
      console.log(`[history] Retroactive image upload: ${needsUpload.length} grades need backup`);
      for (const grading of needsUpload) {
        try {
          const readSafe = async (uri: string): Promise<string | null> => {
            if (!uri) return null;
            try {
              const info = await FileSystem.getInfoAsync(uri);
              if (!info.exists) return null;
              return await FileSystem.readAsStringAsync(uri, { encoding: "base64" as any });
            } catch { return null; }
          };
          const [frontB64, backB64] = await Promise.all([
            readSafe(grading.frontImage),
            readSafe(grading.backImage),
          ]);
          if (!frontB64 && !backB64) continue;
          const urls = await uploadGradingImages(rcUserId, grading.id, frontB64, backB64, stableId);
          if (urls.frontImageUrl || urls.backImageUrl) {
            await updateGradingImageUrls(grading.id, urls.frontImageUrl, urls.backImageUrl);
            console.log(`[history] Backed up images for grade ${grading.id}`);
          }
        } catch (e) {
          console.log(`[history] Failed to backup images for ${grading.id}:`, e);
        }
      }
    } catch (e) {
      console.log("[history] Retroactive image upload failed (non-critical):", e);
    }
  };

  const initRevenueCat = async () => {
    try {
      const apiKey = Platform.OS === "ios" ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
      if (!apiKey) {
        setRcLoading(false);
        return;
      }

      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
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

      setCurrentTierSafe(tier);
      setRcAppUserId(userId);
      syncServerUsage(userId).catch(() => {});
      syncTierToServer(userId, tier).catch(() => {});
      // Read stable UUID (persists across reinstalls via Keychain / Android Auto Backup),
      // claim existing rows for this user, then sync history using it.
      getStableUserId().then(stableId => {
        setStableUserId(stableId);
        claimHistoryForStableId(userId, stableId).catch(() => {});
        syncHistoryWithServer(userId, stableId)
          .catch(() => {})
          .finally(() => { retroactiveImageUpload(userId, stableId).catch(() => {}); });
      }).catch(() => {
        syncHistoryWithServer(userId)
          .catch(() => {})
          .finally(() => { retroactiveImageUpload(userId).catch(() => {}); });
      });

      // RC pushes real-time updates whenever entitlement status changes
      // (e.g. immediately after a purchase completes or a subscription renews)
      Purchases.addCustomerInfoUpdateListener((updated) => {
        const updatedTier = determineTier(updated);
        const prevTier = currentTierRef.current;
        const hasEntitlement = !!updated.entitlements.active["Grade.IQ Pro"];
        console.log("[subscription] CustomerInfo update: tier=", updatedTier,
          "| entitlements=", Object.keys(updated.entitlements.active),
          "| activeSubscriptions=", updated.activeSubscriptions,
          "| hasEntitlement=", hasEntitlement,
          "| RC userId=", updated.originalAppUserId);

        // Guard: if the tier change is driven only by activeSubscriptions (no
        // entitlement confirming it), verify with a fresh server fetch first.
        // This prevents phantom Apple receipt transactions (e.g. a failed Obsessed
        // purchase in billing-retry state) from temporarily flipping the tier.
        if (!hasEntitlement && updatedTier !== "free" && updatedTier !== prevTier) {
          console.log("[subscription] Tier changed without entitlement — verifying with server fetch...");
          Purchases.invalidateCustomerInfoCache()
            .then(() => Purchases.getCustomerInfo())
            .then(verified => {
              const verifiedTier = determineTier(verified);
              console.log("[subscription] Verified tier:", verifiedTier,
                "| entitlements=", Object.keys(verified.entitlements.active));
              setCurrentTierSafe(verifiedTier);
              setRcAppUserId(verified.originalAppUserId ?? "");
              syncTierToServer(verified.originalAppUserId ?? "", verifiedTier).catch(() => {});
            })
            .catch(() => {
              console.log("[subscription] Verification fetch failed — keeping current tier");
            });
          return;
        }

        setCurrentTierSafe(updatedTier);
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
        setCurrentTierSafe(determineTier(customerInfo));
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
        setCurrentTierSafe(retriedTier);
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
      const info = await Purchases.restorePurchases();
      const tier = determineTier(info);
      console.log("[restore] Initial result: tier=", tier,
        "| entitlements=", Object.keys(info.entitlements.active),
        "| activeSubscriptions=", info.activeSubscriptions,
        "| userId=", info.originalAppUserId);

      if (tier !== "free") {
        setCurrentTierSafe(tier);
        setRcAppUserId(info.originalAppUserId ?? "");
        syncTierToServer(info.originalAppUserId ?? "", tier).catch(() => {});
        return true;
      }

      // RC transfer takes time to propagate — the initial snapshot returned by
      // restorePurchases() may not yet reflect the transferred entitlement.
      // Retry up to 3 times (same pattern as purchaseTier) before accepting "free".
      const retryDelays = [2000, 4000, 6000];
      for (let i = 0; i < retryDelays.length; i++) {
        await new Promise(resolve => setTimeout(resolve, retryDelays[i]));
        await Purchases.invalidateCustomerInfoCache();
        const retried = await Purchases.getCustomerInfo();
        const retriedTier = determineTier(retried);
        console.log(`[restore] Retry ${i + 1}: tier=`, retriedTier,
          "| entitlements=", Object.keys(retried.entitlements.active),
          "| activeSubscriptions=", retried.activeSubscriptions);
        if (retriedTier !== "free") {
          setCurrentTierSafe(retriedTier);
          setRcAppUserId(retried.originalAppUserId ?? "");
          syncTierToServer(retried.originalAppUserId ?? "", retriedTier).catch(() => {});
          return true;
        }
      }

      // All retries exhausted and still returning "free". If we were previously
      // subscribed, do one final delayed retry before accepting the downgrade —
      // ensures we don't permanently block a legitimate subscription expiry.
      if (currentTierRef.current !== "free") {
        console.log("[restore] Was subscribed — doing final 3s retry before accepting free...");
        await new Promise(resolve => setTimeout(resolve, 3000));
        await Purchases.invalidateCustomerInfoCache();
        const finalCheck = await Purchases.getCustomerInfo();
        const finalTier = determineTier(finalCheck);
        console.log("[restore] Final check: tier=", finalTier,
          "| entitlements=", Object.keys(finalCheck.entitlements.active));
        setCurrentTierSafe(finalTier);
        setRcAppUserId(finalCheck.originalAppUserId ?? "");
        syncTierToServer(finalCheck.originalAppUserId ?? "", finalTier).catch(() => {});
        return finalTier !== "free";
      }
      setCurrentTierSafe("free");
      setRcAppUserId(info.originalAppUserId ?? "");
      return false;
    } catch (e: any) {
      const msg = e?.message ?? e?.underlyingErrorMessage ?? e?.readableErrorCode ?? String(e);
      console.error("[restore] Error:", msg);
      throw new Error(msg);
    }
  }, [rcConfigured]);

  const forceSyncSubscription = useCallback(async (): Promise<boolean> => {
    if (!rcConfigured) return false;
    console.log("[forcesync] Starting — fetching authoritative RC server state...");
    try {
      // Invalidate the local RC cache so we always get a fresh server response.
      // We intentionally do NOT call syncPurchasesForResult() here because that
      // sends the full Apple receipt to RC, which can pick up phantom transactions
      // (e.g. a failed/billing-retry purchase for a higher tier) and cause the
      // displayed tier to flip incorrectly. getCustomerInfo() is the authoritative
      // source — it reflects what RC's servers know about the user's entitlements.
      await Purchases.invalidateCustomerInfoCache();
      const info = await Purchases.getCustomerInfo();
      const tier = determineTier(info);
      console.log("[forcesync] RC fetch: tier=", tier,
        "| entitlements=", Object.keys(info.entitlements.active),
        "| activeSubscriptions=", info.activeSubscriptions,
        "| userId=", info.originalAppUserId);

      if (tier !== "free") {
        setCurrentTierSafe(tier);
        setRcAppUserId(info.originalAppUserId ?? "");
        return true;
      }

      // RC returned free — retry twice with cache busts before accepting it.
      // This handles transient propagation delays after a recent purchase or restore.
      const retryDelays = [2000, 4000];
      for (let i = 0; i < retryDelays.length; i++) {
        await new Promise(r => setTimeout(r, retryDelays[i]));
        await Purchases.invalidateCustomerInfoCache();
        const retried = await Purchases.getCustomerInfo();
        const retriedTier = determineTier(retried);
        console.log(`[forcesync] Retry ${i + 1}: tier=`, retriedTier,
          "| entitlements=", Object.keys(retried.entitlements.active),
          "| activeSubscriptions=", retried.activeSubscriptions);
        if (retriedTier !== "free") {
          setCurrentTierSafe(retriedTier);
          setRcAppUserId(retried.originalAppUserId ?? "");
          return true;
        }
      }

      // All retries returned free — accept it.
      const finalInfo = await Purchases.getCustomerInfo();
      const finalTier = determineTier(finalInfo);
      setCurrentTierSafe(finalTier);
      setRcAppUserId(finalInfo.originalAppUserId ?? "");
      return finalTier !== "free";
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
      await Purchases.invalidateCustomerInfoCache();
      const info = await Purchases.getCustomerInfo();
      const tier = determineTier(info);
      console.log("[subscription] Manual refresh: tier=", tier, "entitlements=", Object.keys(info.entitlements.active));
      setCurrentTierSafe(tier);
      return { tier, wasUpgrade: tier !== "free" && tier !== prevTier };
    } catch (e) {
      console.error("[subscription] Manual refresh error:", e);
      return { tier: prevTier, wasUpgrade: false };
    }
  }, [rcConfigured, currentTier]);

  const deepMonthlyLimit = deepGradeLimit;

  const crossoverGradeLimit = tierInfo.crossoverGradeLimit;
  const remainingCrossoverGrades = crossoverGradeLimit === null ? null : Math.max(0, crossoverGradeLimit - crossoverMonthlyUsageCount);
  const crossoverMonthlyLimit = crossoverGradeLimit;

  const canCrossover = isAdminMode || !isGateEnabled ||
    (crossoverGradeLimit === null ? true : (crossoverGradeLimit > 0 && crossoverMonthlyUsageCount < crossoverGradeLimit));

  const checkCanCrossoverGrade = useCallback(() => {
    if (isAdminMode) return true;
    if (!isGateEnabled) return true;
    if (crossoverGradeLimit === null) return true;
    if (crossoverGradeLimit <= 0) return false;
    return crossoverMonthlyUsageCount + 1 <= crossoverGradeLimit;
  }, [isAdminMode, isGateEnabled, crossoverGradeLimit, crossoverMonthlyUsageCount]);

  const recordCrossoverUsage = useCallback(async (): Promise<boolean> => {
    if (isAdminMode) return true;
    if (!isGateEnabled) return true;
    if (crossoverGradeLimit === null) return true;
    if (crossoverGradeLimit <= 0) return false;
    const usage = await getCrossoverMonthlyUsage();
    if (usage.count + 1 > crossoverGradeLimit) return false;
    usage.count += 1;
    await saveCrossoverMonthlyUsage(usage);
    setCrossoverMonthlyUsageCount(usage.count);
    return true;
  }, [isAdminMode, isGateEnabled, crossoverGradeLimit]);

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
      stableUserId,
      deepMonthlyUsageCount,
      deepMonthlyLimit,
      remainingDeepGrades,
      canDeepGrade,
      checkCanDeepGrade,
      recordDeepUsage,
      crossoverMonthlyUsageCount,
      crossoverMonthlyLimit,
      remainingCrossoverGrades,
      canCrossover,
      checkCanCrossoverGrade,
      recordCrossoverUsage,
      canBulk,
      isAdminMode,
      toggleAdminMode,
    }),
    [isGateEnabled, isSubscribed, currentTier, tierInfo, monthlyUsageCount, monthlyLimit, remainingGrades, canGrade, recordUsage, checkCanGrade, loading, rcLoading, purchaseTier, restorePurchases, refreshSubscription, forceSyncSubscription, rcConfigured, rcAppUserId, stableUserId, deepMonthlyUsageCount, deepMonthlyLimit, remainingDeepGrades, canDeepGrade, checkCanDeepGrade, recordDeepUsage, crossoverMonthlyUsageCount, crossoverMonthlyLimit, remainingCrossoverGrades, canCrossover, checkCanCrossoverGrade, recordCrossoverUsage, canBulk, isAdminMode, toggleAdminMode]
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}
