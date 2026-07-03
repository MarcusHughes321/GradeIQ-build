import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, AppState, type AppStateStatus } from "react-native";
import Purchases, { LOG_LEVEL, type CustomerInfo } from "react-native-purchases";
import { getApiUrl } from "@/lib/query-client";
import { fetchServerHistory, uploadGrading, uploadBulkGradings, uploadGradingImages, claimHistoryForStableId, timeoutSignal } from "@/lib/server-history";
import { getStableUserId, isReinstall } from "@/lib/stable-user-id";
import { clearAdminPassword } from "@/lib/admin-auth";
import { getGradings, saveServerGrading, updateGrading, updateGradingImageUrls, markRowsBackedUp } from "@/lib/storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Network from "expo-network";
import * as ImageManipulator from "expo-image-manipulator";

// A grade still needs backup when a locally-stored photo (front or back) has no
// corresponding server URL yet. Per-side aware: if one side uploaded but the
// other still has only a local copy, the grade is still pending.
export function isGradePending(g: {
  frontImage?: string | null;
  backImage?: string | null;
  frontImageUrl?: string | null;
  backImageUrl?: string | null;
  historyRowBackedUp?: boolean;
}): boolean {
  // The grading-history ROW itself must be confirmed on the server first. A grade
  // whose row never persisted is unrestorable on reinstall REGARDLESS of its
  // photos (a photo linked to a non-existent row is lost too), so it is pending
  // until the row is confirmed — this is what stops the false-green "backed up"
  // badge over a grade that silently vanishes after reinstall.
  if (!g.historyRowBackedUp) return true;
  // Row is safe; a side is still pending only if a local photo hasn't uploaded.
  return Boolean(
    (g.frontImage && !g.frontImageUrl) || (g.backImage && !g.backImageUrl),
  );
}

// Three honest states for the per-grade cloud badge shown on Home / History:
//  - "pending":     the server row and/or a local photo is still waiting to upload
//                   (orange, retryable) — INCLUDES a grade whose history row hasn't
//                   been confirmed on the server yet, even if its photos uploaded
//  - "backedUp":    the row is confirmed AND a side has a server URL (green, safe
//                   on reinstall)
//  - "unavailable": row is confirmed but there is no server photo copy — the photo
//                   is gone or was never captured (grey/honest — never a false
//                   "backed up")
export type BackupBadge = "pending" | "backedUp" | "unavailable";
export function backupBadgeState(g: {
  frontImage?: string | null;
  backImage?: string | null;
  frontImageUrl?: string | null;
  backImageUrl?: string | null;
  frontImageMissing?: boolean;
  backImageMissing?: boolean;
  historyRowBackedUp?: boolean;
}): BackupBadge {
  if (isGradePending(g)) return "pending";
  if (g.frontImageUrl || g.backImageUrl) return "backedUp";
  return "unavailable";
}

// Outcome of a backup pass. Drives the "Back up now" result message on the
// dashboard. `failed` counts only *retryable* failures (network/server error, or
// a transient inability to read a file that is still on disk). Grades whose local
// photo has been genuinely purged by the OS are NOT counted as failed — their
// dangling local reference is cleared so they stop counting as pending, and they
// are reported via `unrecoverable` instead (a retry would never help them).
export interface BackupResult {
  total: number;
  succeeded: number;
  failed: number;
  unrecoverable: number;
  // Why the pass ended, so the caller can give the user honest feedback instead
  // of silently doing nothing:
  //  - "ran"     : the backup actually executed (total may still be 0 if nothing
  //                was pending).
  //  - "busy"    : another pass (e.g. the silent startup backfill) was already
  //                running, so this request was skipped by the single-flight guard.
  //  - "no_user" : the RevenueCat app-user id needed to key the upload wasn't
  //                available yet — the user should retry in a moment.
  status: "ran" | "busy" | "no_user";
}

const USAGE_KEY = "gradeiq_monthly_usage";
const DEEP_USAGE_KEY = "gradeiq_deep_monthly_usage";
const CROSSOVER_USAGE_KEY = "gradeiq_crossover_monthly_usage";
const ADMIN_KEY = "gradeiq_admin_mode";
// Marks that this install has already run the one-time fresh-install auto-restore
// check. Lives in AsyncStorage (wiped on reinstall) so a reinstall re-triggers it.
const AUTO_RESTORE_KEY = "gradeiq_auto_restore_done";
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
  syncTierNow: () => Promise<void>;
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
  backupPendingCount: number;
  backupInProgress: boolean;
  backupProgress: { done: number; total: number };
  backupAllMissingImages: () => Promise<BackupResult>;
  refreshBackupStatus: () => Promise<number>;
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
  const [backupPendingCount, setBackupPendingCount] = useState(0);
  const [backupInProgress, setBackupInProgress] = useState(false);
  const [backupProgress, setBackupProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const backupInProgressRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const rcConfiguredRef = useRef(false);
  // Mirror the rc/stable IDs into refs so the AppState + connectivity listeners
  // (which capture a single closure) always read the latest values.
  const rcAppUserIdRef = useRef("");
  const stableUserIdRef = useRef("");
  // Growing backoff for automatic retry so we don't hammer the server while
  // offline. Resets to zero once a backup pass fully succeeds.
  const backupBackoffRef = useRef<{ failures: number; nextAttemptAt: number }>({ failures: 0, nextAttemptAt: 0 });
  // Last-seen connectivity, so we only retry on a real offline→online edge.
  const wasConnectedRef = useRef(true);
  // Holds the latest auto-retry fn so the [] AppState callback can invoke it.
  const retryFailedBackupsRef = useRef<((reason: string) => Promise<void>) | undefined>(undefined);

  // Keep the ID refs in lock-step with state on every render.
  rcAppUserIdRef.current = rcAppUserId;
  stableUserIdRef.current = stableUserId;

  // Defined before useEffect so the closure captures it correctly
  const handleAppStateChange = useCallback(async (nextState: AppStateStatus) => {
    const prev = appStateRef.current;
    appStateRef.current = nextState;
    if (prev.match(/inactive|background/) && nextState === "active" && rcConfiguredRef.current) {
      // Quietly retry any photo backups that previously failed — the user no
      // longer has to notice and tap "Back up now". Fire-and-forget.
      retryFailedBackupsRef.current?.("app foregrounded").catch(() => {});
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

    // Detect a reinstall BEFORE getStableUserId (which CREATES the id) runs:
    // isReinstall is true only when the id survives in the Keychain but is absent
    // from the wiped AsyncStorage — excluding first installs and plain app updates.
    // Chain the creation AFTER this read so the check can never be a false positive.
    const reinstallPromise = isReinstall().catch(() => false);

    // Load the stable UUID ONCE, independent of RevenueCat. This is the anchor
    // for recovery and persists across reinstalls (iOS Keychain / Android SSAID).
    const stableIdPromise = reinstallPromise
      .then(() => getStableUserId())
      .then(id => { setStableUserId(id); return id; })
      .catch(() => "");

    // Recovery that does NOT depend on RevenueCat succeeding — restores the
    // correct credit count and scan history even if RC is offline/slow/failing
    // at launch. Uses the stable UUID alone (the server prefers it).
    stableIdPromise.then(stableId => {
      if (!stableId) return;
      syncServerUsage("", stableId).catch(() => {});
      syncHistoryWithServer("", stableId).catch(() => {});
    });

    initRevenueCat(stableIdPromise, reinstallPromise).finally(() => clearTimeout(rcTimeout));

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
    if (!next) await clearAdminPassword();
  }, [isAdminMode]);

  const syncTierToServer = async (rcUserId: string, tier: string) => {
    if (!rcUserId || rcUserId === "unknown") return;
    try {
      const url = new URL("/api/subscription/sync", getApiUrl());
      const t = timeoutSignal(8000);
      await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rcUserId, tier }),
        signal: t.signal,
      }).finally(() => t.clear());
      console.log("[subscription] Tier synced to server:", tier);
    } catch (e) {
      console.log("[subscription] Tier sync failed (non-critical):", e);
    }
  };

  // Sync the current tier right now — called just before submitting a grade
  // to guarantee the server cache is correct even if the startup sync lost
  // the race against the user tapping Grade.
  const syncTierNow = useCallback(async () => {
    const userId = rcAppUserId;
    const tier = currentTierRef.current;
    if (!userId || userId === "unknown") return;
    await syncTierToServer(userId, tier);
  }, [rcAppUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncServerUsage = async (rcUserId: string, stableId?: string) => {
    if (!rcUserId && !stableId) return;
    try {
      const url = new URL("/api/usage", getApiUrl());
      if (rcUserId) url.searchParams.set("rcUserId", rcUserId);
      if (stableId) url.searchParams.set("stableId", stableId);
      const t = timeoutSignal(8000);
      const resp = await fetch(url.toString(), { signal: t.signal }).finally(() => t.clear());
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
      // Any local grade whose row is ALREADY on the server is, by definition,
      // backed up. Mark it so it stops counting as pending — without this every
      // pre-existing grade would show orange until the backup pass re-upserted its
      // row (a redundant network storm on the first launch after this change).
      const alreadyOnServer = localGradings
        .filter(g => g?.id && serverIds.has(g.id) && !g.historyRowBackedUp)
        .map(g => g.id);
      if (alreadyOnServer.length > 0) await markRowsBackedUp(alreadyOnServer);

      const missingOnServer = localGradings.filter(g => g?.id && !serverIds.has(g.id));
      // The server keys history rows on rc_user_id, so only push local-only grades
      // once the RC id is known — the early stable-id-only pass (rcUserId="") can't
      // create rows and would otherwise log a misleading "upload failed" warning.
      if (rcUserId && missingOnServer.length > 0) {
        // AWAIT so the history rows exist before retroactiveImageUpload (chained
        // after this resolves at startup) tries to link images — the image endpoint
        // UPDATEs by (rc_user_id, local_id) and silently no-ops if the row is absent.
        const ok = await uploadBulkGradings(rcUserId, missingOnServer, stableId);
        if (ok) {
          // Rows are now persisted — record it so they leave the pending state
          // without a second (redundant) upsert in the retroactive backup pass.
          await markRowsBackedUp(missingOnServer.map(g => g.id));
        } else {
          console.warn(`[history] Bulk upload of ${missingOnServer.length} local-only grade(s) failed`);
        }
      }
      if (newFromServer.length > 0) {
        console.log(`[history] Restored ${newFromServer.length} grades from server`);
      }
    } catch (e) {
      console.log("[history] Sync failed (non-critical):", e);
    }
  };

  // Core backup pass: uploads the front/back photo of every locally-stored grade
  // that does not yet have a server image URL. No per-launch cap — it processes
  // ALL pending grades sequentially (yielding between each so the UI stays
  // responsive). `onProgress` reports {done,total} as each grade finishes.
  // Returns a BackupResult: how many were attempted, succeeded, and failed.
  const runImageBackup = async (
    rcUserId: string,
    stableId?: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<BackupResult> => {
    const empty: BackupResult = { total: 0, succeeded: 0, failed: 0, unrecoverable: 0, status: "ran" };
    if (Platform.OS === "web") return empty;
    if (!rcUserId) return { ...empty, status: "no_user" };
    // Single-flight guard shared by ALL entry points (startup backfill + manual
    // "Back up now") so the same pending grades are never uploaded concurrently.
    if (backupInProgressRef.current) return { ...empty, status: "busy" };
    backupInProgressRef.current = true;
    let uploaded = 0;
    let unrecoverable = 0;
    let failed = 0;
    let total = 0;
    try {
      const gradings = await getGradings();
      const needsUpload = gradings.filter(g => g.id && isGradePending(g));
      total = needsUpload.length;
      if (total === 0) {
        onProgress?.(0, 0);
        return empty;
      }
      console.log(`[history] Image backup: ${total} grades need backup`);
      // Prepare one image side for upload as RAW base64 (no "data:" prefix — the
      // Replit edge-proxy blocks that string). Handles every reference kind the app
      // stores, not just on-disk file paths (the old code threw instantly on data:
      // and photo-library URIs, so the whole pass reported "couldn't upload"):
      //   - ""                              -> nothing on this side, not an error
      //   - "data:image/...;base64,XXXX"    -> use the embedded bytes directly
      //   - "file://..." / "/..."           -> confirm it exists, then shrink to ~1200px
      //   - "ph://" / "content://" lib ref  -> shrink directly (cannot be fs-statted)
      // A ~1200px q0.7 JPEG is a few hundred KB, so front+back stay well under the
      // proxy's ~10MB limit. `missing` is set ONLY when a file path is CONFIRMED
      // gone, so its dangling reference can be safely cleared. Any other failure is
      // transient (`errorMsg` set, `missing` false) and stays pending for a retry.
      const prepImage = async (
        uri: string,
      ): Promise<{ base64: string | null; missing: boolean; errorMsg: string | null }> => {
        if (!uri) return { base64: null, missing: false, errorMsg: null };

        if (uri.startsWith("data:")) {
          const b64 = uri.split(",")[1] ?? null;
          return b64
            ? { base64: b64, missing: false, errorMsg: null }
            : { base64: null, missing: false, errorMsg: "empty data URI" };
        }

        // Only real file paths can be statted for existence. A confirmed-absent
        // file is the one case we may treat as permanently missing.
        const isFilePath = uri.startsWith("file://") || uri.startsWith("/");
        if (isFilePath) {
          try {
            const info = await FileSystem.getInfoAsync(uri);
            if (!info.exists) return { base64: null, missing: true, errorMsg: null };
          } catch { /* stat failed — fall through and still try to read it */ }
        }

        // Primary path: shrink + re-encode to a small JPEG and grab its base64.
        try {
          // Android EXIF fix: rotate(0) forces a full decode respecting orientation.
          const transforms: ImageManipulator.Action[] = Platform.OS === "android"
            ? [{ rotate: 0 }, { resize: { width: 1200 } }]
            : [{ resize: { width: 1200 } }];
          const result = await ImageManipulator.manipulateAsync(
            uri,
            transforms,
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
          );
          if (result.base64) return { base64: result.base64, missing: false, errorMsg: null };
        } catch (e: any) {
          console.log(`[history] shrink failed (${uri.slice(0, 24)}…) — trying raw read: ${e?.message ?? e}`);
        }

        // Fallback: read the raw bytes straight off disk as base64. Covers sources
        // ImageManipulator can't decode but that are still readable on disk.
        try {
          const raw = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          return raw
            ? { base64: raw, missing: false, errorMsg: null }
            : { base64: null, missing: false, errorMsg: "empty file read" };
        } catch (e: any) {
          return { base64: null, missing: false, errorMsg: e?.message ?? "read failed" };
        }
      };
      const SKIP = { base64: null as string | null, missing: false, errorMsg: null as string | null };

      let done = 0;
      for (const grading of needsUpload) {
        try {
          // Ensure the server ROW exists before linking any photos. "Back up now"
          // used to upload photos only; if the completion-time row upload had failed,
          // the image link silently no-op'd (0 rows matched) and the grade was
          // unrestorable while still showing a green badge. Make the row a hard
          // precondition — if it can't be created, defer this grade (retryable).
          const rowWasPending = !grading.historyRowBackedUp;
          const rowOk = await uploadGrading(rcUserId, grading, stableId);
          if (!rowOk) {
            failed++;
            console.warn(`[history] Backup deferred for grade ${grading.id}: history row upload failed (will retry)`);
            done++;
            onProgress?.(done, total);
            await new Promise(resolve => setTimeout(resolve, 0));
            continue;
          }
          // Row is now CONFIRMED on the server. Persist that so the badge/pending
          // logic stops treating this grade as needing a row (without it, a grade
          // whose photos are already uploaded but whose row upload failed at
          // completion time would show green yet vanish on reinstall).
          if (rowWasPending) {
            await updateGrading(grading.id, { historyRowBackedUp: true });
            grading.historyRowBackedUp = true;
          }

          // Only prepare the side(s) that still need a server copy. A side already
          // backed up (URL present) must never be re-prepared or re-uploaded.
          const frontPending = Boolean(grading.frontImage && !grading.frontImageUrl);
          const backPending = Boolean(grading.backImage && !grading.backImageUrl);

          const [front, back] = await Promise.all([
            frontPending ? prepImage(grading.frontImage) : Promise.resolve(SKIP),
            backPending ? prepImage(grading.backImage) : Promise.resolve(SKIP),
          ]);

          // 1. Upload whatever bytes we managed to prepare.
          let uploadFailed = false;
          let uploadedSide = false;
          if (front.base64 || back.base64) {
            try {
              const urls = await uploadGradingImages(rcUserId, grading.id, front.base64, back.base64, stableId);
              if (urls.linked && (urls.frontImageUrl || urls.backImageUrl)) {
                await updateGradingImageUrls(grading.id, urls.frontImageUrl, urls.backImageUrl);
                uploadedSide = true;
              } else {
                // Reached the server but did NOT link to a row (or no URL) — a real,
                // retryable failure. Never mark a grade "backed up" without a linked
                // row, or the badge goes green over an unrestorable image.
                uploadFailed = true;
              }
            } catch (e: any) {
              uploadFailed = true;
              console.warn(`[history] Upload request failed for grade ${grading.id}: ${e?.message ?? e}`);
            }
          }

          // 2. For pending sides whose local file is CONFIRMED gone, either RECOVER
          //    the server copy (the grade-job stored full-res originals; their UUIDs
          //    live on the result) or, if truly unrecoverable, clear the dead ref AND
          //    record an honest "image missing" flag so the UI never shows a false
          //    "backed up" badge over a blank thumbnail.
          const resultAny = grading.result as any;
          const recoverUrl = (id?: string | null) =>
            id ? new URL(`/api/grading-image/${encodeURIComponent(id)}`, getApiUrl()).toString() : null;
          const updates: {
            frontImage?: string; backImage?: string;
            frontImageUrl?: string; backImageUrl?: string;
            frontImageMissing?: boolean; backImageMissing?: boolean;
          } = {};
          let recoveredSide = false;
          if (frontPending && front.missing) {
            const url = recoverUrl(resultAny?.frontImageId);
            if (url) { updates.frontImageUrl = url; updates.frontImage = ""; recoveredSide = true; }
            else { updates.frontImage = ""; updates.frontImageMissing = true; }
          }
          if (backPending && back.missing) {
            const url = recoverUrl(resultAny?.backImageId);
            if (url) { updates.backImageUrl = url; updates.backImage = ""; recoveredSide = true; }
            else { updates.backImage = ""; updates.backImageMissing = true; }
          }
          if (Object.keys(updates).length > 0) await updateGrading(grading.id, updates);

          // 3. Classify this grade into exactly one bucket and log the TRUE reason,
          //    so a genuine failure is never silently swallowed or mislabelled.
          const transientError =
            (frontPending && !front.base64 && !front.missing) ||
            (backPending && !back.base64 && !back.missing) ||
            uploadFailed;

          if (transientError) {
            failed++;
            const reason = uploadFailed
              ? "upload request failed (network/server)"
              : (front.errorMsg || back.errorMsg || "could not read photo");
            console.warn(`[history] Backup failed (retryable) for grade ${grading.id}: ${reason}`);
          } else if (uploadedSide || recoveredSide) {
            uploaded++;
            console.log(`[history] Backed up images for grade ${grading.id}${recoveredSide ? " (recovered from server copy)" : ""}`);
          } else if (frontPending || backPending) {
            // Had pending photo(s) but none could be uploaded or recovered — they are
            // gone from the device with no server copy. Cleared + marked missing above
            // so the UI shows an honest "photo unavailable" placeholder; grade kept.
            unrecoverable++;
            console.log(`[history] Photo(s) unrecoverable for grade ${grading.id} — marked missing, grade kept`);
          } else {
            // No photo was pending; the only thing outstanding was the server row,
            // which we confirmed above. This grade is now fully backed up.
            uploaded++;
            console.log(`[history] Backed up history row for grade ${grading.id} (no photo pending)`);
          }
        } catch (e: any) {
          failed++;
          console.warn(`[history] Unexpected backup error for grade ${grading.id}: ${e?.message ?? e}`);
        }
        done++;
        onProgress?.(done, total);
        // Yield to the event loop so the UI stays responsive during a long pass.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    } catch (e) {
      console.log("[history] Image backup failed (non-critical):", e);
    } finally {
      backupInProgressRef.current = false;
    }
    return { total, succeeded: uploaded, failed, unrecoverable, status: "ran" };
  };

  // Startup backfill — background/non-blocking, no progress UI.
  const retroactiveImageUpload = async (rcUserId: string, stableId?: string) => {
    await runImageBackup(rcUserId, stableId);
  };

  // Recompute how many local grades still need a server backup, without any
  // network call. Drives the dashboard "N pending" / "All backed up" status.
  const refreshBackupStatus = useCallback(async (): Promise<number> => {
    try {
      const gradings = await getGradings();
      const pending = gradings.filter(g => g.id && isGradePending(g)).length;
      setBackupPendingCount(pending);
      return pending;
    } catch {
      return 0;
    }
  }, []);

  // Manual "Back up now" — backs up ALL pending grades with progress feedback.
  // Reuses the rc/stable IDs already held in context. Native-only (web returns
  // an empty result). Returns a BackupResult so the dashboard can report outcome.
  // The single-flight guard lives in runImageBackup; we check the ref here only
  // to avoid flashing the "Backing up…" UI when a backup is already running.
  const backupAllMissingImages = useCallback(async (): Promise<BackupResult> => {
    const empty: BackupResult = { total: 0, succeeded: 0, failed: 0, unrecoverable: 0, status: "ran" };
    if (Platform.OS === "web") return empty;
    // A pass is already running (e.g. the silent startup backfill still working
    // through pending grades). Report it so the button can say "already backing
    // up" rather than appearing dead — the shared single-flight guard would
    // otherwise swallow this tap with no feedback at all.
    if (backupInProgressRef.current) {
      console.log("[history] Manual backup skipped — a pass is already in progress");
      return { ...empty, status: "busy" };
    }
    // The server keys the upload row by the RevenueCat app-user id. If it hasn't
    // resolved yet (the user tapped before RC finished configuring, or under
    // Expo Go's mocked/Preview mode), fetch it on demand before giving up so a
    // legitimate tap isn't silently a no-op.
    // Treat the placeholder "unknown" (set when RC returned a null id) the same
    // as empty — uploading under it would key server rows to a non-canonical id
    // and falsely mark grades backed up.
    const isResolved = (id: string) => !!id && id !== "unknown";
    let userId = rcAppUserId;
    if (!isResolved(userId) && rcConfiguredRef.current) {
      try {
        const info = await Purchases.getCustomerInfo();
        userId = info.originalAppUserId ?? "";
        if (isResolved(userId)) setRcAppUserId(userId);
      } catch {}
    }
    if (!isResolved(userId)) {
      console.log("[history] Manual backup skipped — no RC user id available yet");
      return { ...empty, status: "no_user" };
    }
    setBackupInProgress(true);
    setBackupProgress({ done: 0, total: 0 });
    try {
      const result = await runImageBackup(
        userId,
        stableUserId || undefined,
        (done, total) => setBackupProgress({ done, total }),
      );
      await refreshBackupStatus();
      return result;
    } finally {
      setBackupInProgress(false);
    }
  }, [rcAppUserId, stableUserId, refreshBackupStatus]);

  // Automatic, silent retry of photo backups that previously failed. Triggered
  // when the app returns to the foreground or regains connectivity, so the user
  // never has to notice and manually re-tap "Back up now". Reuses the SAME
  // single-flight guard as every other backup path (via runImageBackup), keeps
  // the pending-count in sync, and honours a growing backoff after failures so
  // we don't hammer the server while offline. Does NOT drive the "Backing up…"
  // UI — it runs quietly in the background.
  const BACKUP_RETRY_BASE_MS = 30_000; // 30s after the first failure
  const BACKUP_RETRY_MAX_MS = 5 * 60_000; // cap at 5 minutes
  const retryFailedBackups = useCallback(async (reason: string): Promise<void> => {
    if (Platform.OS === "web") return;
    const rcUserId = rcAppUserIdRef.current;
    if (!rcUserId) return;
    if (backupInProgressRef.current) return;

    const pending = await refreshBackupStatus();
    if (pending === 0) {
      backupBackoffRef.current = { failures: 0, nextAttemptAt: 0 };
      return;
    }

    // Respect the backoff window after a recent failed attempt.
    if (Date.now() < backupBackoffRef.current.nextAttemptAt) return;

    console.log(`[history] Auto-retrying ${pending} pending backup(s) — trigger: ${reason}`);
    const result = await runImageBackup(rcUserId, stableUserIdRef.current || undefined);
    await refreshBackupStatus();

    if (result.failed > 0) {
      const failures = backupBackoffRef.current.failures + 1;
      const delay = Math.min(BACKUP_RETRY_BASE_MS * 2 ** (failures - 1), BACKUP_RETRY_MAX_MS);
      backupBackoffRef.current = { failures, nextAttemptAt: Date.now() + delay };
      console.log(`[history] Backup retry: ${result.failed} still failing, next attempt in ~${Math.round(delay / 1000)}s`);
    } else {
      backupBackoffRef.current = { failures: 0, nextAttemptAt: 0 };
    }
  }, [refreshBackupStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose the latest retry fn to the [] AppState callback above.
  retryFailedBackupsRef.current = retryFailedBackups;

  // Retry failed backups the moment connectivity is regained (offline→online
  // edge), resetting the backoff window so the attempt fires immediately.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Network.addNetworkStateListener(({ isConnected }) => {
      const connected = isConnected === true;
      const was = wasConnectedRef.current;
      wasConnectedRef.current = connected;
      if (!was && connected) {
        backupBackoffRef.current = { ...backupBackoffRef.current, nextAttemptAt: 0 };
        retryFailedBackups("connectivity regained").catch(() => {});
      }
    });
    return () => sub.remove();
  }, [retryFailedBackups]);

  const initRevenueCat = async (stableIdPromise: Promise<string>, reinstallPromise: Promise<boolean>) => {
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
      syncTierToServer(userId, tier).catch(() => {});

      // ── Auto-restore purchases after a reinstall ─────────────────────────────
      // On a reinstall the Keychain-persisted stable id survives but AsyncStorage
      // is wiped, so RC hands the device a fresh anonymous app-user-id and the
      // store subscription isn't linked until a restore — which today the user must
      // trigger manually in Settings. isReinstall() (id in the Keychain but not in
      // the wiped AsyncStorage) targets true reinstalls only, excluding first-ever
      // installs and plain app updates. Do it at most once per install, silently.
      try {
        const [wasReinstall, alreadyAttempted] = await Promise.all([
          reinstallPromise,
          AsyncStorage.getItem(AUTO_RESTORE_KEY),
        ]);
        if (!alreadyAttempted && wasReinstall && tier === "free") {
          console.log("[subscription] Reinstall detected — attempting silent auto-restore...");
          await Purchases.invalidateCustomerInfoCache();
          let restored = await Purchases.restorePurchases();
          let restoredTier = determineTier(restored);
          // The RC entitlement transfer takes time to propagate — the first
          // snapshot can still read "free". Retry with the same 2/4/6s backoff the
          // manual restore uses before accepting "free", so a slow transfer (the
          // common reinstall case) isn't dropped and left needing a manual restore.
          const retryDelays = [2000, 4000, 6000];
          for (let i = 0; restoredTier === "free" && i < retryDelays.length; i++) {
            await new Promise(resolve => setTimeout(resolve, retryDelays[i]));
            await Purchases.invalidateCustomerInfoCache();
            restored = await Purchases.getCustomerInfo();
            restoredTier = determineTier(restored);
            console.log(`[subscription] Auto-restore retry ${i + 1}: tier=`, restoredTier);
          }
          if (restoredTier !== "free") {
            const rid = restored.originalAppUserId ?? "";
            console.log("[subscription] Auto-restore recovered tier=", restoredTier, "| userId=", rid);
            setCurrentTierSafe(restoredTier);
            setRcAppUserId(rid);
            syncTierToServer(rid, restoredTier).catch(() => {});
          } else {
            console.log("[subscription] Auto-restore: no active subscription to restore");
          }
        }
        // Mark this install as checked so auto-restore runs at most once per install.
        // Skipped only when a restore call THREW (jumps to catch), so a transient
        // network failure is retried next launch; a completed check — even one that
        // legitimately finds no subscription — sets the flag so we don't re-run.
        if (!alreadyAttempted) {
          await AsyncStorage.setItem(AUTO_RESTORE_KEY, "1");
        }
      } catch (e: any) {
        console.log("[subscription] Auto-restore skipped (non-fatal):", e?.message ?? e);
      }

      // Now that we also have the RC id, run the FULL recovery (write + link):
      // claim existing rows for the stable UUID, upload any local-only grades,
      // and back up images. The stable UUID was loaded independently at mount.
      stableIdPromise.then(async stableId => {
        syncServerUsage(userId, stableId || undefined).catch(() => {});
        // AWAIT claim first: it re-keys any churned-rc rows to the current id and
        // merges duplicates. Running sync/backup before it finishes could insert a
        // duplicate row (old rc + this stable) that then blocks re-keying. Awaiting
        // makes the recovery chain deterministic: claim → sync → backup → refresh.
        if (stableId) await claimHistoryForStableId(userId, stableId).catch(() => {});
        try { await syncHistoryWithServer(userId, stableId || undefined); } catch {}
        try { await retroactiveImageUpload(userId, stableId || undefined); } catch {}
        refreshBackupStatus().catch(() => {});
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
        syncTierToServer(updated.originalAppUserId ?? "", updatedTier).catch(() => {});
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
        await syncTierToServer(info.originalAppUserId ?? "", tier).catch(() => {});
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
          await syncTierToServer(retried.originalAppUserId ?? "", retriedTier).catch(() => {});
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
      setRcAppUserId(info.originalAppUserId ?? "");
      syncTierToServer(info.originalAppUserId ?? "", tier).catch(() => {});
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
      syncTierNow,
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
      backupPendingCount,
      backupInProgress,
      backupProgress,
      backupAllMissingImages,
      refreshBackupStatus,
    }),
    [isGateEnabled, isSubscribed, currentTier, tierInfo, monthlyUsageCount, monthlyLimit, remainingGrades, canGrade, recordUsage, checkCanGrade, loading, rcLoading, purchaseTier, restorePurchases, refreshSubscription, forceSyncSubscription, rcConfigured, rcAppUserId, stableUserId, syncTierNow, deepMonthlyUsageCount, deepMonthlyLimit, remainingDeepGrades, canDeepGrade, checkCanDeepGrade, recordDeepUsage, crossoverMonthlyUsageCount, crossoverMonthlyLimit, remainingCrossoverGrades, canCrossover, checkCanCrossoverGrade, recordCrossoverUsage, canBulk, isAdminMode, toggleAdminMode, backupPendingCount, backupInProgress, backupProgress, backupAllMissingImages, refreshBackupStatus]
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}
