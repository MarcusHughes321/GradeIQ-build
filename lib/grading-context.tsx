import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode, useRef } from "react";
import { Platform, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { apiRequest } from "@/lib/query-client";
import { saveGrading, updateGrading } from "@/lib/storage";
import type { GradingResult, SavedGrading } from "@/lib/types";

export type GradingJobStatus = "processing" | "completed" | "failed";

export interface GradingJob {
  id: string;
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

export function GradingProvider({ children }: { children: ReactNode }) {
  const [activeJob, setActiveJob] = useState<GradingJob | null>(null);
  const abortRef = useRef(false);

  const submitGrading = useCallback(async (
    frontImage: string,
    backImage: string,
    recordUsage: (n: number) => Promise<void>,
  ) => {
    const jobId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    abortRef.current = false;

    setActiveJob({
      id: jobId,
      frontImage,
      backImage,
      status: "processing",
      startTime: Date.now(),
    });

    try {
      const frontBase64 = await getBase64FromUri(frontImage);
      const backBase64 = await getBase64FromUri(backImage);

      const response = await apiRequest("POST", "/api/grade-card", {
        frontImage: frontBase64,
        backImage: backBase64,
      });

      const result: GradingResult = await response.json();

      await recordUsage(1);

      const saved = await saveGrading(frontImage, backImage, result);

      (async () => {
        try {
          const resp = await apiRequest("POST", "/api/card-value", {
            cardName: result.cardName,
            setName: result.setName || result.setInfo,
            setNumber: result.setNumber,
            psaGrade: result.psa.grade,
            bgsGrade: result.beckett.overallGrade,
            aceGrade: result.ace.overallGrade,
            tagGrade: result.tag?.overallGrade,
            cgcGrade: result.cgc?.grade,
          });
          const data = await resp.json();
          await updateGrading(saved.id, { result: { ...result, cardValue: data } });
        } catch {}
      })();

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      if (!abortRef.current) {
        setActiveJob((prev) =>
          prev && prev.id === jobId
            ? { ...prev, status: "completed", savedGrading: saved }
            : prev
        );
      }
    } catch (error: any) {
      console.error("Background grading error:", error);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      if (!abortRef.current) {
        setActiveJob((prev) =>
          prev && prev.id === jobId
            ? { ...prev, status: "failed", error: error.message || "Unknown error" }
            : prev
        );
      }
    }
  }, []);

  const dismissJob = useCallback(() => {
    abortRef.current = true;
    setActiveJob(null);
  }, []);

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
