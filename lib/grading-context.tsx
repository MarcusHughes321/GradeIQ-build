import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode, useRef } from "react";
import { Platform, AppState } from "react-native";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { saveGrading, updateGrading } from "@/lib/storage";
import type { GradingResult, SavedGrading } from "@/lib/types";

export type GradingJobStatus = "processing" | "completed" | "failed";

export interface GradingJob {
  id: string;
  serverJobId: string;
  frontImage: string;
  backImage: string;
  status: GradingJobStatus;
  savedGrading?: SavedGrading;
  error?: string;
  startTime: number;
}

interface GradingContextValue {
  activeJob: GradingJob | null;
  submitGrading: (frontImage: string, backImage: string, recordUsage: (n: number) => Promise<void>) => Promise<void>;
  dismissJob: () => void;
  hasCompletedJob: boolean;
  hasActiveJob: boolean;
}

const GradingContext = createContext<GradingContextValue | null>(null);

const POLL_INTERVAL = 3000;
const ESTIMATED_GRADE_SECONDS = 45;

async function getBase64FromUri(uri: string): Promise<string> {
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
        body: "Your card has been graded! Tap to see results.",
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

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function GradingProvider({ children }: { children: ReactNode }) {
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

  const pollJobStatus = useCallback(async (serverJobId: string, localJobId: string, frontImage: string, backImage: string) => {
    try {
      const resp = await apiRequest("GET", `/api/grade-job/${serverJobId}`);
      const data = await resp.json();

      if (data.status === "completed" && data.result) {
        stopPolling();

        await cancelScheduledNotification(scheduledNotifId.current);
        scheduledNotifId.current = null;

        const result: GradingResult = data.result;
        if (recordUsageRef.current) {
          try { await recordUsageRef.current(1); } catch {}
        }

        const saved = await saveGrading(frontImage, backImage, result);

        (async () => {
          try {
            const vResp = await apiRequest("POST", "/api/card-value", {
              cardName: result.cardName,
              setName: result.setName || result.setInfo,
              setNumber: result.setNumber,
              psaGrade: result.psa.grade,
              bgsGrade: result.beckett.overallGrade,
              aceGrade: result.ace.overallGrade,
              tagGrade: result.tag?.overallGrade,
              cgcGrade: result.cgc?.grade,
            });
            const vData = await vResp.json();
            await updateGrading(saved.id, { result: { ...result, cardValue: vData } });
          } catch {}
        })();

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
    } catch (err) {
      console.log("Poll error (will retry):", err);
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

      const resp = await apiRequest("POST", "/api/grade-job", {
        frontImage: frontBase64,
        backImage: backBase64,
      });

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
      pollingRef.current = setInterval(() => {
        pollJobStatus(serverJobId, localJobId, frontImage, backImage);
      }, POLL_INTERVAL);
    } catch (error: any) {
      console.error("Failed to submit grading job:", error);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      setActiveJob(prev =>
        prev && prev.id === localJobId
          ? { ...prev, status: "failed", error: error.message || "Unknown error" }
          : prev
      );
    }
  }, [pollJobStatus, stopPolling]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && activeJob?.status === "processing" && activeJob.serverJobId) {
        stopPolling();
        pollingRef.current = setInterval(() => {
          pollJobStatus(activeJob.serverJobId, activeJob.id, activeJob.frontImage, activeJob.backImage);
        }, POLL_INTERVAL);
      }
    });
    return () => sub.remove();
  }, [activeJob?.status, activeJob?.serverJobId, activeJob?.id, activeJob?.frontImage, activeJob?.backImage, pollJobStatus, stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const dismissJob = useCallback(() => {
    stopPolling();
    cancelScheduledNotification(scheduledNotifId.current);
    scheduledNotifId.current = null;
    setActiveJob(null);
  }, [stopPolling]);

  const hasCompletedJob = activeJob?.status === "completed";
  const hasActiveJob = activeJob?.status === "processing";

  const value = useMemo(
    () => ({ activeJob, submitGrading, dismissJob, hasCompletedJob, hasActiveJob }),
    [activeJob, submitGrading, dismissJob, hasCompletedJob, hasActiveJob]
  );

  return <GradingContext.Provider value={value}>{children}</GradingContext.Provider>;
}

export function useGrading() {
  const ctx = useContext(GradingContext);
  if (!ctx) throw new Error("useGrading must be used within GradingProvider");
  return ctx;
}
