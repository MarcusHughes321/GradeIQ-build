import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, type CustomerInfo } from "react-native-purchases";

const USAGE_KEY = "gradeiq_monthly_usage";
const FREE_MONTHLY_LIMIT = 3;

const GATE_ENABLED = (process.env.EXPO_PUBLIC_SUBSCRIPTION_GATE ?? "on") === "on";

const RC_API_KEY_IOS = process.env.EXPO_PUBLIC_RC_IOS_KEY || "";
const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_RC_ANDROID_KEY || "";

export type SubscriptionTier = "free" | "curious" | "enthusiast" | "obsessed";

export interface TierInfo {
  id: SubscriptionTier;
  name: string;
  price: string;
  monthlyLimit: number | null;
  entitlementId: string;
}

export const TIERS: Record<SubscriptionTier, TierInfo> = {
  free: { id: "free", name: "Free", price: "Free", monthlyLimit: FREE_MONTHLY_LIMIT, entitlementId: "" },
  curious: { id: "curious", name: "Grade Curious", price: "£2.99", monthlyLimit: 15, entitlementId: "Grade.IQ Pro" },
  enthusiast: { id: "enthusiast", name: "Grade Enthusiast", price: "£5.99", monthlyLimit: 50, entitlementId: "Grade.IQ Pro" },
  obsessed: { id: "obsessed", name: "Grade Obsessed", price: "£9.99", monthlyLimit: null, entitlementId: "Grade.IQ Pro" },
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
  purchaseTier: (tier: SubscriptionTier) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  rcConfigured: boolean;
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
  const [loading, setLoading] = useState(true);
  const [currentTier, setCurrentTier] = useState<SubscriptionTier>("free");
  const [rcConfigured, setRcConfigured] = useState(false);

  useEffect(() => {
    getMonthlyUsage().then((usage) => {
      setMonthlyUsageCount(usage.count);
      setLoading(false);
    });

    initRevenueCat();
  }, []);

  const initRevenueCat = async () => {
    try {
      const apiKey = Platform.OS === "ios" ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
      if (!apiKey) {
        return;
      }

      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      await Purchases.configure({ apiKey });
      setRcConfigured(true);

      const info = await Purchases.getCustomerInfo();
      setCurrentTier(determineTier(info));

      Purchases.addCustomerInfoUpdateListener((info) => {
        setCurrentTier(determineTier(info));
      });
    } catch (e) {
      console.log("RevenueCat init skipped:", e);
    }
  };

  const isSubscribed = currentTier !== "free";
  const tierInfo = TIERS[currentTier];
  const monthlyLimit = tierInfo.monthlyLimit;

  const remainingGrades = monthlyLimit === null ? null : Math.max(0, monthlyLimit - monthlyUsageCount);

  const canGrade = !isGateEnabled || (monthlyLimit === null ? true : (remainingGrades !== null && remainingGrades > 0));

  const checkCanGrade = useCallback(
    (count: number = 1) => {
      if (!isGateEnabled) return true;
      if (monthlyLimit === null) return true;
      return monthlyUsageCount + count <= monthlyLimit;
    },
    [isGateEnabled, monthlyLimit, monthlyUsageCount]
  );

  const recordUsage = useCallback(
    async (count: number = 1): Promise<boolean> => {
      if (!isGateEnabled) return true;
      if (monthlyLimit === null) return true;
      const usage = await getMonthlyUsage();
      if (usage.count + count > monthlyLimit) return false;
      usage.count += count;
      await saveMonthlyUsage(usage);
      setMonthlyUsageCount(usage.count);
      return true;
    },
    [isGateEnabled, monthlyLimit]
  );

  const purchaseTier = useCallback(async (tier: SubscriptionTier): Promise<boolean> => {
    if (!rcConfigured) return false;
    try {
      const offerings = await Purchases.getOfferings();
      const targetEntitlement = TIERS[tier].entitlementId;

      let targetPackage = null;
      if (offerings.current) {
        const allPackages = offerings.current.availablePackages;
        for (const pkg of allPackages) {
          if (pkg.product.identifier.includes(tier)) {
            targetPackage = pkg;
            break;
          }
        }
        if (!targetPackage) {
          targetPackage = offerings.current.monthly;
        }
      }

      if (!targetPackage) return false;
      const { customerInfo } = await Purchases.purchasePackage(targetPackage);
      setCurrentTier(determineTier(customerInfo));
      return customerInfo.entitlements.active[targetEntitlement] !== undefined;
    } catch (e: any) {
      if (e.userCancelled) return false;
      console.error("Purchase error:", e);
      return false;
    }
  }, [rcConfigured]);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    if (!rcConfigured) return false;
    try {
      const info = await Purchases.restorePurchases();
      const tier = determineTier(info);
      setCurrentTier(tier);
      return tier !== "free";
    } catch (e) {
      console.error("Restore error:", e);
      return false;
    }
  }, [rcConfigured]);

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
      purchaseTier,
      restorePurchases,
      rcConfigured,
    }),
    [isGateEnabled, isSubscribed, currentTier, tierInfo, monthlyUsageCount, monthlyLimit, remainingGrades, canGrade, recordUsage, checkCanGrade, loading, purchaseTier, restorePurchases, rcConfigured]
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}
