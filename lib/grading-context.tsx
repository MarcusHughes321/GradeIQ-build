import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode, useRef } from "react";
import { Platform, AppState } from "react-native";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import * as ImageManipulator from "expo-image-manipulator";
import { apiRequest } from "@/lib/query-client";
import { saveGrading, updateGrading } from "@/lib/storage";
import { getSettings } from "@/lib/settings";
import type { GradingResult, SavedGrading } from "@/lib/types";
import { useSubscription } from "@/lib/subscription";
import { uploadGrading } from "@/lib/server-history";

function parseQuotaError(error: any): string | null {
  try {
    const msg: string = error?.message ?? "";
    if (!msg.startsWith("429:")) return null;
    const json = JSON.parse(msg.slice(4).trim());
    if (json?.quotaExceeded && json?.error) return json.error;
  } catch {}
  return null;
}

export type GradingJobStatus = "processing" | "completed" | "failed";

export interface GradingJob {
  id: string;
  serverJobId: string;
  frontImage: string;
  backImage: string;
  angledFrontImage?: string;
  angledBackImage?: string;
  frontCornerImages?: string[];
  backCornerImages?: string[];
  isDeepGrade?: boolean;
  isCrossover?: boolean;
  certData?: CertData;
  status: GradingJobStatus;
  savedGrading?: SavedGrading;
  error?: string;
  startTime: number;
}

export interface CertData {
  company: string;
  grade: string;
  certNumber: string;
  cardName?: string;
  setName?: string;
}

interface GradingContextValue {
  activeJob: GradingJob | null;
  submitGrading: (frontImage: string, backImage: string, recordUsage: (n: number) => Promise<void>) => Promise<void>;
  submitDeepGrading: (frontImage: string, backImage: string, angledFrontImage: string, angledBackImage: string, frontCorners: string[], backCorners: string[], recordUsage: (n: number) => Promise<void>) => Promise<void>;
  submitCrossoverGrading: (slabFrontImage: string, slabBackImage: string | undefined, recordUsage: (n: number) => Promise<void>, certData?: CertData) => Promise<void>;
  dismissJob: () => void;
  cancelJob: () => void;
  hasCompletedJob: boolean;
  hasActiveJob: boolean;
}

const GradingContext = createContext<GradingContextValue | null>(null);

const POLL_INTERVAL = 3000;
const ESTIMATED_GRADE_SECONDS = 90;
const MAX_POLL_DURATION_MS = 10 * 60 * 1000; // 10 minutes

function withSubmitTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Upload timed out — please check your connection and try again.")), ms)
    ),
  ]);
}

async function getBase64FromUri(uri: string): Promise<string> {
  // Already a data URI — use directly without re-fetching
  if (uri.startsWith("data:")) return uri;

  // On native: use ImageManipulator to convert to JPEG and resize before sending.
  // This handles HEIC/HEIF photos and prevents large uploads from aborting mid-transfer.
  // 2048px matches the server's maximum AI input resolution — no grading quality is lost.
  // In dev mode, use 1024px so uploads fit through the Replit dev tunnel for testing.
  const uploadMaxDim = __DEV__ ? 1024 : 2048;
  if (Platform.OS !== "web") {
    try {
      // Android EXIF fix: rotate(0) forces a full decode respecting EXIF orientation
      // so the re-encoded pixels are correctly oriented regardless of the original metadata.
      const transforms: ImageManipulator.Action[] = Platform.OS === "android"
        ? [{ rotate: 0 }, { resize: { width: uploadMaxDim } }]
        : [{ resize: { width: uploadMaxDim } }];
      const result = await ImageManipulator.manipulateAsync(
        uri,
        transforms,
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (result.base64) {
        return `data:image/jpeg;base64,${result.base64}`;
      }
    } catch (e) {
      console.log("[getBase64] ImageManipulator failed, falling back to fetch:", e);
    }
  }

  // Web fallback: fetch and convert to data URI via FileReader
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch (err) {
    console.log("[notifications] Permission request failed:", err);
    return false;
  }
}

async function scheduleGradingNotification(delaySeconds: number): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Grading Complete",
        body: "Your card should be ready! Tap to check results.",
        sound: "default",
        data: { type: "grading_complete" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: delaySeconds,
      },
    });
    return id;
  } catch (err) {
    console.log("[notifications] Failed to schedule notification:", err);
    return null;
  }
}

async function cancelScheduledNotification(notifId: string | null) {
  if (!notifId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notifId);
  } catch {}
}

async function sendImmediateNotification(title: string, body: string) {
  if (Platform.OS === "web") return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: "default",
        data: { type: "grading_complete" },
      },
      trigger: null,
    });
  } catch (err) {
    console.log("[notifications] Failed to send notification:", err);
  }
}

if (Platform.OS !== "web") {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {}
}

export function GradingProvider({ children }: { children: ReactNode }) {
  const { rcAppUserId } = useSubscription();
  const [activeJob, setActiveJob] = useState<GradingJob | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordUsageRef = useRef<((n: number) => Promise<void>) | null>(null);
  const notificationsEnabled = useRef(false);
  const scheduledNotifId = useRef<string | null>(null);

  useEffect(() => {
    requestNotificationPermission().then((granted) => {
      notificationsEnabled.current = granted;
    });
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const pollJobStatus = useCallback(async (
    serverJobId: string,
    localJobId: string,
    frontImage: string,
    backImage: string,
    extraImages?: {
      angledFrontImage?: string;
      angledBackImage?: string;
      frontCornerImages?: string[];
      backCornerImages?: string[];
      isDeepGrade?: boolean;
    },
    pollEndpoint?: string,
    certData?: CertData,
  ) => {
    try {
      const base = pollEndpoint ? `${pollEndpoint}/${serverJobId}` : `/api/grade-job/${serverJobId}`;
      const endpoint = `${base}?t=${Date.now()}`;
      const resp = await apiRequest("GET", endpoint);
      const data = await resp.json();

      // Job not found (server restarted / job expired) — treat as failed
      if (data.error === "Job not found") {
        stopPolling();
        await cancelScheduledNotification(scheduledNotifId.current);
        scheduledNotifId.current = null;
        setActiveJob(prev =>
          prev && prev.id === localJobId
            ? { ...prev, status: "failed", error: "Grading session expired. Please try again." }
            : prev
        );
        return;
      }

      if (data.status === "completed" && data.result) {
        stopPolling();

        await cancelScheduledNotification(scheduledNotifId.current);
        scheduledNotifId.current = null;

        let result: GradingResult = data.result;

        if (certData) {
          type SupportedCompany = "PSA" | "BGS" | "CGC" | "ACE" | "TAG";
          const validCompanies: SupportedCompany[] = ["PSA", "BGS", "CGC", "ACE", "TAG"];
          const isSupportedCompany = (c: string): c is SupportedCompany => validCompanies.includes(c as SupportedCompany);
          const company = isSupportedCompany(certData.company)
            ? certData.company
            : "OTHER" as const;
          result = {
            ...result,
            currentGrade: {
              company,
              grade: certData.grade,
              certNumber: certData.certNumber,
            },
            cardName: certData.cardName || result.cardName,
            setName: certData.setName || result.setName || result.setInfo,
          };
        }

        if (recordUsageRef.current) {
          try { await recordUsageRef.current(1); } catch {}
        }

        // Strip corner images before saving — they're large base64 blobs (can
        // exceed Android's AsyncStorage 2MB limit) and are not shown in history.
        const extraImagesForStorage = extraImages
          ? {
              angledFrontImage: extraImages.angledFrontImage,
              angledBackImage: extraImages.angledBackImage,
              isDeepGrade: extraImages.isDeepGrade,
              // frontCornerImages / backCornerImages intentionally omitted
            }
          : undefined;

        let saved: any;
        try {
          saved = await saveGrading(frontImage, backImage, result, extraImagesForStorage);
        } catch (saveErr) {
          // If saving fails (e.g. storage full), still show the result to the user.
          console.warn("[grading] saveGrading failed, showing result without saving:", saveErr);
          saved = { id: `unsaved_${Date.now()}`, frontImage, backImage, result, timestamp: Date.now() };
        }

        if (saved.id && !saved.id.startsWith("unsaved_") && rcAppUserId) {
          uploadGrading(rcAppUserId, saved).catch(() => {});
        }

        if (saved.id && !saved.id.startsWith("unsaved_")) {
          (async () => {
            try {
              const userSettings = await getSettings();
              const vResp = await apiRequest("POST", "/api/card-value", {
                cardName: result.cardName,
                setName: result.setName || result.setInfo,
                setNumber: result.setNumber,
                psaGrade: result.psa.grade,
                bgsGrade: result.beckett.overallGrade,
                aceGrade: result.ace.overallGrade,
                tagGrade: result.tag?.overallGrade,
                cgcGrade: result.cgc?.grade,
                currency: userSettings.currency || "GBP",
              });
              const vData = await vResp.json();
              await updateGrading(saved.id, { result: { ...result, cardValue: vData } });
            } catch {}
          })();
        }

        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        if (notificationsEnabled.current) {
          const cardName = result.cardName || "Your card";
          sendImmediateNotification("Grading Complete", `${cardName} has been graded!`);
        }

        setActiveJob(prev =>
          prev && prev.id === localJobId
            ? { ...prev, status: "completed", savedGrading: saved }
            : prev
        );
      } else if (data.status === "failed") {
        stopPolling();

        await cancelScheduledNotification(scheduledNotifId.current);
        scheduledNotifId.current = null;

        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }

        if (notificationsEnabled.current) {
          sendImmediateNotification("Grading Failed", "There was an error grading your card. Please try again.");
        }

        setActiveJob(prev =>
          prev && prev.id === localJobId
            ? { ...prev, status: "failed", error: data.error || "Unknown error" }
            : prev
        );
      }
    } catch (err: any) {
      // 404 means the job is gone (server restarted) — fail cleanly instead of retrying forever
      if (err?.message?.startsWith("404:") || err?.message?.includes("Job not found")) {
        stopPolling();
        await cancelScheduledNotification(scheduledNotifId.current);
        scheduledNotifId.current = null;
        setActiveJob(prev =>
          prev && prev.id === localJobId
            ? { ...prev, status: "failed", error: "Grading session expired. Please try again." }
            : prev
        );
      } else {
        console.log("Poll error (will retry):", err);
      }
    }
  }, [stopPolling]);

  const submitGrading = useCallback(async (
    frontImage: string,
    backImage: string,
    recordUsage: (n: number) => Promise<void>,
  ) => {
    const localJobId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    recordUsageRef.current = recordUsage;

    setActiveJob({
      id: localJobId,
      serverJobId: "",
      frontImage,
      backImage,
      status: "processing",
      startTime: Date.now(),
    });

    try {
      const frontBase64 = await getBase64FromUri(frontImage);
      const backBase64 = await getBase64FromUri(backImage);

      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      const resp = await withSubmitTimeout(apiRequest("POST", "/api/grade-job", {
        frontImage: frontBase64,
        backImage: backBase64,
        rcUserId: rcAppUserId || undefined,
      }), 60_000);

      const { jobId: serverJobId } = await resp.json();

      setActiveJob(prev =>
        prev && prev.id === localJobId
          ? { ...prev, serverJobId }
          : prev
      );

      if (notificationsEnabled.current) {
        await cancelScheduledNotification(scheduledNotifId.current);
        scheduledNotifId.current = await scheduleGradingNotification(ESTIMATED_GRADE_SECONDS);
      }

      stopPolling();
      const pollStart = Date.now();
      pollingRef.current = setInterval(() => {
        if (Date.now() - pollStart > MAX_POLL_DURATION_MS) {
          stopPolling();
          setActiveJob(prev =>
            prev && prev.id === localJobId
              ? { ...prev, status: "failed", error: "Grading timed out. Please try again." }
              : prev
          );
          return;
        }
        pollJobStatus(serverJobId, localJobId, frontImage, backImage);
      }, POLL_INTERVAL);
    } catch (error: any) {
      console.error("Failed to submit grading job:", error);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      const errorMessage = parseQuotaError(error) ?? (error.message || "Unknown error");
      setActiveJob(prev =>
        prev && prev.id === localJobId
          ? { ...prev, status: "failed", error: errorMessage }
          : prev
      );
    }
  }, [pollJobStatus, stopPolling, rcAppUserId]);

  const submitDeepGrading = useCallback(async (
    frontImage: string,
    backImage: string,
    angledFrontImage: string,
    angledBackImage: string,
    frontCorners: string[],
    backCorners: string[],
    recordUsage: (n: number) => Promise<void>,
  ) => {
    const localJobId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    recordUsageRef.current = recordUsage;

    const deepExtraImages = {
      angledFrontImage,
      angledBackImage,
      frontCornerImages: frontCorners,
      backCornerImages: backCorners,
      isDeepGrade: true,
    };

    setActiveJob({
      id: localJobId,
      serverJobId: "",
      frontImage,
      backImage,
      ...deepExtraImages,
      status: "processing",
      startTime: Date.now(),
    });

    try {
      const frontBase64 = await getBase64FromUri(frontImage);
      const backBase64 = await getBase64FromUri(backImage);
      const angledFrontBase64 = await getBase64FromUri(angledFrontImage);
      const angledBackBase64 = await getBase64FromUri(angledBackImage);
      const frontCornerBase64 = await Promise.all(frontCorners.map(getBase64FromUri));
      const backCornerBase64 = await Promise.all(backCorners.map(getBase64FromUri));

      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      const resp = await withSubmitTimeout(apiRequest("POST", "/api/deep-grade-job", {
        frontImage: frontBase64,
        backImage: backBase64,
        angledImage: angledFrontBase64,
        angledBackImage: angledBackBase64,
        frontCorners: frontCornerBase64,
        backCorners: backCornerBase64,
        rcUserId: rcAppUserId || undefined,
      }), 90_000);

      const { jobId: serverJobId } = await resp.json();

      setActiveJob(prev =>
        prev && prev.id === localJobId
          ? { ...prev, serverJobId }
          : prev
      );

      if (notificationsEnabled.current) {
        await cancelScheduledNotification(scheduledNotifId.current);
        scheduledNotifId.current = await scheduleGradingNotification(ESTIMATED_GRADE_SECONDS + 30);
      }

      stopPolling();
      const pollStart = Date.now();
      pollingRef.current = setInterval(() => {
        if (Date.now() - pollStart > MAX_POLL_DURATION_MS) {
          stopPolling();
          setActiveJob(prev =>
            prev && prev.id === localJobId
              ? { ...prev, status: "failed", error: "Grading timed out. Please try again." }
              : prev
          );
          return;
        }
        pollJobStatus(serverJobId, localJobId, frontImage, backImage, deepExtraImages);
      }, POLL_INTERVAL);
    } catch (error: any) {
      console.error("Failed to submit deep grading job:", error);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      const errorMessage = parseQuotaError(error) ?? (error.message || "Unknown error");
      setActiveJob(prev =>
        prev && prev.id === localJobId
          ? { ...prev, status: "failed", error: errorMessage }
          : prev
      );
    }
  }, [pollJobStatus, stopPolling, rcAppUserId]);

  const submitCrossoverGrading = useCallback(async (
    slabFrontImage: string,
    slabBackImage: string | undefined,
    recordUsage: (n: number) => Promise<void>,
    certData?: CertData,
  ) => {
    const localJobId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    recordUsageRef.current = recordUsage;

    setActiveJob({
      id: localJobId,
      serverJobId: "",
      frontImage: slabFrontImage,
      backImage: slabBackImage || slabFrontImage,
      isCrossover: true,
      certData,
      status: "processing",
      startTime: Date.now(),
    });

    try {
      const slabFrontBase64 = await getBase64FromUri(slabFrontImage);
      const slabBackBase64 = slabBackImage ? await getBase64FromUri(slabBackImage) : undefined;

      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      const resp = await withSubmitTimeout(apiRequest("POST", "/api/crossover-grade-job", {
        slabImage: slabFrontBase64,
        slabBackImage: slabBackBase64,
        ...(certData ? { certData } : {}),
        rcUserId: rcAppUserId || undefined,
      }), 60_000);

      const { jobId: serverJobId } = await resp.json();

      setActiveJob(prev =>
        prev && prev.id === localJobId
          ? { ...prev, serverJobId }
          : prev
      );

      if (notificationsEnabled.current) {
        await cancelScheduledNotification(scheduledNotifId.current);
        scheduledNotifId.current = await scheduleGradingNotification(ESTIMATED_GRADE_SECONDS);
      }

      stopPolling();
      const pollStart = Date.now();
      pollingRef.current = setInterval(() => {
        if (Date.now() - pollStart > MAX_POLL_DURATION_MS) {
          stopPolling();
          setActiveJob(prev =>
            prev && prev.id === localJobId
              ? { ...prev, status: "failed", error: "Grading timed out. Please try again." }
              : prev
          );
          return;
        }
        pollJobStatus(serverJobId, localJobId, slabFrontImage, slabBackImage || slabFrontImage, undefined, "/api/crossover-grade-job", certData);
      }, POLL_INTERVAL);
    } catch (error: any) {
      console.error("Failed to submit crossover grading job:", error);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      const errorMessage = parseQuotaError(error) ?? (error.message || "Unknown error");
      setActiveJob(prev =>
        prev && prev.id === localJobId
          ? { ...prev, status: "failed", error: errorMessage }
          : prev
      );
    }
  }, [pollJobStatus, stopPolling, rcAppUserId]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && activeJob?.status === "processing" && activeJob.serverJobId) {
        stopPolling();
        const extra = activeJob.isDeepGrade ? {
          angledFrontImage: activeJob.angledFrontImage,
          angledBackImage: activeJob.angledBackImage,
          frontCornerImages: activeJob.frontCornerImages,
          backCornerImages: activeJob.backCornerImages,
          isDeepGrade: true,
        } : undefined;
        const resumeEndpoint = activeJob.isCrossover ? "/api/crossover-grade-job" : undefined;
        const resumeCertData = activeJob.isCrossover ? activeJob.certData : undefined;
        const resumeJobId = activeJob.id;
        const resumeStart = activeJob.startTime || Date.now();
        pollingRef.current = setInterval(() => {
          if (Date.now() - resumeStart > MAX_POLL_DURATION_MS) {
            stopPolling();
            setActiveJob(prev =>
              prev && prev.id === resumeJobId
                ? { ...prev, status: "failed", error: "Grading timed out. Please try again." }
                : prev
            );
            return;
          }
          pollJobStatus(activeJob.serverJobId, activeJob.id, activeJob.frontImage, activeJob.backImage, extra, resumeEndpoint, resumeCertData);
        }, POLL_INTERVAL);
      }
    });
    return () => sub.remove();
  }, [activeJob?.status, activeJob?.serverJobId, activeJob?.id, activeJob?.frontImage, activeJob?.backImage, activeJob?.isDeepGrade, activeJob?.isCrossover, activeJob?.certData, pollJobStatus, stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const dismissJob = useCallback(() => {
    stopPolling();
    cancelScheduledNotification(scheduledNotifId.current);
    scheduledNotifId.current = null;
    setActiveJob(null);
  }, [stopPolling]);

  const cancelJob = useCallback(() => {
    stopPolling();
    cancelScheduledNotification(scheduledNotifId.current);
    scheduledNotifId.current = null;
    setActiveJob(null);
  }, [stopPolling]);

  const hasCompletedJob = activeJob?.status === "completed";
  const hasActiveJob = activeJob?.status === "processing";

  const value = useMemo(
    () => ({ activeJob, submitGrading, submitDeepGrading, submitCrossoverGrading, dismissJob, cancelJob, hasCompletedJob, hasActiveJob }),
    [activeJob, submitGrading, submitDeepGrading, submitCrossoverGrading, dismissJob, cancelJob, hasCompletedJob, hasActiveJob]
  );

  return <GradingContext.Provider value={value}>{children}</GradingContext.Provider>;
}

export function useGrading() {
  const ctx = useContext(GradingContext);
  if (!ctx) throw new Error("useGrading must be used within GradingProvider");
  return ctx;
}
