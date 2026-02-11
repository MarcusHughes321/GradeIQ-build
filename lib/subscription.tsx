import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const USAGE_KEY = "gradeiq_daily_usage";
const SUB_GATE_KEY = "gradeiq_subscription_gate";
const FREE_DAILY_LIMIT = 3;

interface DailyUsage {
  date: string;
  count: number;
}

interface SubscriptionContextValue {
  isGateEnabled: boolean;
  toggleGate: () => void;
  isSubscribed: boolean;
  dailyUsageCount: number;
  dailyLimit: number;
  remainingFreeGrades: number;
  canGrade: boolean;
  recordUsage: (count?: number) => Promise<boolean>;
  checkCanGrade: (count?: number) => boolean;
  loading: boolean;
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
  const [isGateEnabled, setIsGateEnabled] = useState(false);
  const [dailyUsageCount, setDailyUsageCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(SUB_GATE_KEY),
      getDailyUsage(),
    ]).then(([gateVal, usage]) => {
      setIsGateEnabled(gateVal === "true");
      setDailyUsageCount(usage.count);
      setLoading(false);
    });
  }, []);

  const toggleGate = useCallback(() => {
    setIsGateEnabled((prev) => {
      const next = !prev;
      AsyncStorage.setItem(SUB_GATE_KEY, next ? "true" : "false");
      return next;
    });
  }, []);

  const isSubscribed = false;

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

  const value = useMemo(
    () => ({
      isGateEnabled,
      toggleGate,
      isSubscribed,
      dailyUsageCount,
      dailyLimit: FREE_DAILY_LIMIT,
      remainingFreeGrades,
      canGrade,
      recordUsage,
      checkCanGrade,
      loading,
    }),
    [isGateEnabled, toggleGate, isSubscribed, dailyUsageCount, remainingFreeGrades, canGrade, recordUsage, checkCanGrade, loading]
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}
