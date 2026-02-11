import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, type CustomerInfo } from "react-native-purchases";

const USAGE_KEY = "gradeiq_daily_usage";
const FREE_DAILY_LIMIT = 3;

const GATE_ENABLED = process.env.EXPO_PUBLIC_SUBSCRIPTION_GATE === "on";

const RC_API_KEY_IOS = process.env.EXPO_PUBLIC_RC_IOS_KEY || "";
const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_RC_ANDROID_KEY || "";
const PRO_ENTITLEMENT_ID = "pro";

interface DailyUsage {
  date: string;
  count: number;
}

interface SubscriptionContextValue {
  isGateEnabled: boolean;
  isSubscribed: boolean;
  dailyUsageCount: number;
  dailyLimit: number;
  remainingFreeGrades: number;
  canGrade: boolean;
  recordUsage: (count?: number) => Promise<boolean>;
  checkCanGrade: (count?: number) => boolean;
  loading: boolean;
  purchaseMonthly: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  rcConfigured: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function getDailyUsage(): Promise<DailyUsage> {
  try {
    const data = await AsyncStorage.getItem(USAGE_KEY);
    if (!data) return { date: getTodayKey(), count: 0 };
    const parsed = JSON.parse(data) as DailyUsage;
    if (parsed.date !== getTodayKey()) {
      return { date: getTodayKey(), count: 0 };
    }
    return parsed;
  } catch {
    return { date: getTodayKey(), count: 0 };
  }
}

async function saveDailyUsage(usage: DailyUsage): Promise<void> {
  await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(usage));
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const isGateEnabled = GATE_ENABLED;
  const [dailyUsageCount, setDailyUsageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [rcConfigured, setRcConfigured] = useState(false);

  useEffect(() => {
    getDailyUsage().then((usage) => {
      setDailyUsageCount(usage.count);
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
      checkEntitlements(info);

      Purchases.addCustomerInfoUpdateListener((info) => {
        checkEntitlements(info);
      });
    } catch (e) {
      console.log("RevenueCat init skipped:", e);
    }
  };

  const checkEntitlements = (info: CustomerInfo) => {
    const hasProAccess = info.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
    setIsSubscribed(hasProAccess);
  };

  const remainingFreeGrades = Math.max(0, FREE_DAILY_LIMIT - dailyUsageCount);

  const canGrade = !isGateEnabled || isSubscribed || remainingFreeGrades > 0;

  const checkCanGrade = useCallback(
    (count: number = 1) => {
      if (!isGateEnabled || isSubscribed) return true;
      return dailyUsageCount + count <= FREE_DAILY_LIMIT;
    },
    [isGateEnabled, isSubscribed, dailyUsageCount]
  );

  const recordUsage = useCallback(
    async (count: number = 1): Promise<boolean> => {
      if (!isGateEnabled || isSubscribed) return true;
      const usage = await getDailyUsage();
      if (usage.count + count > FREE_DAILY_LIMIT) return false;
      usage.count += count;
      await saveDailyUsage(usage);
      setDailyUsageCount(usage.count);
      return true;
    },
    [isGateEnabled, isSubscribed]
  );

  const purchaseMonthly = useCallback(async (): Promise<boolean> => {
    if (!rcConfigured) return false;
    try {
      const offerings = await Purchases.getOfferings();
      const monthly = offerings.current?.monthly;
      if (!monthly) return false;
      const { customerInfo } = await Purchases.purchasePackage(monthly);
      checkEntitlements(customerInfo);
      return customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
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
      checkEntitlements(info);
      return info.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
    } catch (e) {
      console.error("Restore error:", e);
      return false;
    }
  }, [rcConfigured]);

  const value = useMemo(
    () => ({
      isGateEnabled,
      isSubscribed,
      dailyUsageCount,
      dailyLimit: FREE_DAILY_LIMIT,
      remainingFreeGrades,
      canGrade,
      recordUsage,
      checkCanGrade,
      loading,
      purchaseMonthly,
      restorePurchases,
      rcConfigured,
    }),
    [isGateEnabled, isSubscribed, dailyUsageCount, remainingFreeGrades, canGrade, recordUsage, checkCanGrade, loading, purchaseMonthly, restorePurchases, rcConfigured]
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}
