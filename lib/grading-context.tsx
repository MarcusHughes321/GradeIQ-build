import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode, useRef } from "react";
import { Platform, AppState } from "react-native";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import * as ImageManipulator from "expo-image-manipulator";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { saveGrading, updateGrading } from "@/lib/storage";
import { getSettings } from "@/lib/settings";
import type { GradingResult, SavedGrading } from "@/lib/types";
import { useSubscription } from "@/lib/subscription";
import { uploadGrading, uploadGradingImages, linkGradingImages } from "@/lib/server-history";

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
  progress?: { stage: string; pct: number };
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
  // Already a data URI — strip the prefix and return raw base64 only.
  // The server re-adds the prefix before processing. Sending "data:image/..."
  // in the POST body triggers Replit's WAF and returns 403.
  if (uri.startsWith("data:")) return uri.split(",")[1] ?? uri;

  // On native: use ImageManipulator to convert to JPEG and resize before sending.
  // This handles HEIC/HEIF photos and prevents large uploads from aborting mid-transfer.
  // 1024px is used in all builds — the server resizes with withoutEnlargement:true so
  // Claude never sees more than 1024px anyway. Keeping client-side at 1024 keeps the
  // JSON body well under the Replit proxy's request-size limit (~10 MB).
  const uploadMaxDim = 1024;
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
        return result.base64;
      }
    } catch (e) {
      console.log("[getBase64] ImageManipulator failed, falling back to fetch:", e);
    }
  }

  // Web fallback: fetch and convert via FileReader, strip the data URI prefix
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Re-encode a captured photo to a JPEG file on disk for binary upload. Fixes
// Android EXIF orientation and caps the long edge at `maxDim` (default 2048px) so the
// upload stays comfortably under Replit's ~10MB proxy limit while giving the server a
// much higher-resolution image than the old 1024px base64 path. Callers that send many
// images in one request (deep grade) pass a smaller maxDim to bound the total body.
async function prepareImageFile(uri: string, maxDim: number = 2048): Promise<string> {
  const uploadMaxDim = maxDim;
  const transforms: ImageManipulator.Action[] = Platform.OS === "android"
    ? [{ rotate: 0 }, { resize: { width: uploadMaxDim } }]
    : [{ resize: { width: uploadMaxDim } }];
  const result = await ImageManipulator.manipulateAsync(
    uri,
    transforms,
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}

// Submit a quick grade as BINARY multipart instead of base64 JSON. This keeps
// the image bytes out of the request body entirely, which permanently avoids
// Replit's WAF blocking the "data:image/jpeg;base64," string (the cause of the
// production 403s). Uses the global fetch (NOT expo/fetch) because React Native's
// native networking layer is what streams { uri } FormData file parts from disk.
async function uploadGradeJobBinary(
  frontUri: string,
  backUri: string,
  fields: { rcUserId?: string; stableUserId?: string },
): Promise<Response> {
  const [frontFile, backFile] = await Promise.all([
    prepareImageFile(frontUri),
    prepareImageFile(backUri),
  ]);
  const form = new FormData();
  form.append("front", { uri: frontFile, name: "front.jpg", type: "image/jpeg" } as any);
  form.append("back", { uri: backFile, name: "back.jpg", type: "image/jpeg" } as any);
  if (fields.rcUserId) form.append("rcUserId", fields.rcUserId);
  if (fields.stableUserId) form.append("stableUserId", fields.stableUserId);
  const url = new URL("/api/grade-job", getApiUrl()).toString();
  // Do NOT set Content-Type — the runtime adds the multipart boundary itself.
  return fetch(url, { method: "POST", body: form as any });
}

// Deep grade as BINARY multipart (front, back, 2 angled, + corner close-ups).
// Same WAF-safe rationale as uploadGradeJobBinary.
async function uploadDeepGradeJobBinary(
  imgs: {
    frontImage: string;
    backImage: string;
    angledFrontImage: string;
    angledBackImage: string;
    frontCorners: string[];
    backCorners: string[];
  },
  fields: { rcUserId?: string; stableUserId?: string },
): Promise<Response> {
  // Deep grade ships ~12 images in one request. At 2048px each the aggregate body
  // approaches Replit's ~10MB proxy limit (the very risk this migration removes), so
  // cap Deep at 1600px — still ~2.4x the pixel detail of the old 1024px base64 path,
  // and the server re-optimises to 2048px anyway (withoutEnlargement). Crossover
  // (1-2 images) keeps the default 2048px.
  const DEEP_MAX_DIM = 1600;
  const prep = (u: string) => prepareImageFile(u, DEEP_MAX_DIM);
  const [front, back, angled] = await Promise.all([
    prep(imgs.frontImage),
    prep(imgs.backImage),
    prep(imgs.angledFrontImage),
  ]);
  const angledBack = imgs.angledBackImage ? await prep(imgs.angledBackImage) : null;
  const frontCornerFiles = await Promise.all(imgs.frontCorners.map(prep));
  const backCornerFiles = await Promise.all(imgs.backCorners.map(prep));

  const form = new FormData();
  form.append("front", { uri: front, name: "front.jpg", type: "image/jpeg" } as any);
  form.append("back", { uri: back, name: "back.jpg", type: "image/jpeg" } as any);
  form.append("angled", { uri: angled, name: "angled.jpg", type: "image/jpeg" } as any);
  if (angledBack) form.append("angledBack", { uri: angledBack, name: "angledBack.jpg", type: "image/jpeg" } as any);
  frontCornerFiles.forEach((f, i) => form.append("frontCorners", { uri: f, name: `fc${i}.jpg`, type: "image/jpeg" } as any));
  backCornerFiles.forEach((f, i) => form.append("backCorners", { uri: f, name: `bc${i}.jpg`, type: "image/jpeg" } as any));
  if (fields.rcUserId) form.append("rcUserId", fields.rcUserId);
  if (fields.stableUserId) form.append("stableUserId", fields.stableUserId);

  const url = new URL("/api/deep-grade-job", getApiUrl()).toString();
  return fetch(url, { method: "POST", body: form as any });
}

// Crossover (slab) grade as BINARY multipart. certData rides along as a JSON string.
async function uploadCrossoverGradeJobBinary(
  slabFrontUri: string,
  slabBackUri: string | undefined,
  fields: { certData?: CertData; rcUserId?: string; stableUserId?: string },
): Promise<Response> {
  const slabFile = await prepareImageFile(slabFrontUri);
  const slabBackFile = slabBackUri ? await prepareImageFile(slabBackUri) : null;

  const form = new FormData();
  form.append("slab", { uri: slabFile, name: "slab.jpg", type: "image/jpeg" } as any);
  if (slabBackFile) form.append("slabBack", { uri: slabBackFile, name: "slabBack.jpg", type: "image/jpeg" } as any);
  if (fields.certData) form.append("certData", JSON.stringify(fields.certData));
  if (fields.rcUserId) form.append("rcUserId", fields.rcUserId);
  if (fields.stableUserId) form.append("stableUserId", fields.stableUserId);

  const url = new URL("/api/crossover-grade-job", getApiUrl()).toString();
  return fetch(url, { method: "POST", body: form as any });
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
  const { rcAppUserId, stableUserId, syncTierNow } = useSubscription();
  const [activeJob, setActiveJob] = useState<GradingJob | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordUsageRef = useRef<((n: number) => Promise<void>) | null>(null);
  const notificationsEnabled = useRef(false);
  const scheduledNotifId = useRef<string | null>(null);
  const pendingUploadsRef = useRef<SavedGrading[]>([]);
  // Guards for pending-grade recovery: prevent overlapping runs, and ensure each
  // server job is recovered at most once per session (the effect re-fires when
  // the stable id resolves first and the RC id resolves later).
  const pendingRecoveryRef = useRef(false);
  const recoveredJobIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    requestNotificationPermission().then((granted) => {
      notificationsEnabled.current = granted;
    });
  }, []);

  useEffect(() => {
    if (!rcAppUserId || pendingUploadsRef.current.length === 0) return;
    const pending = [...pendingUploadsRef.current];
    pendingUploadsRef.current = [];
    pending.forEach(g => uploadGrading(rcAppUserId, g, stableUserId || undefined).catch(() => {}));
  }, [rcAppUserId, stableUserId]);

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

      // Handle non-2xx responses directly (fetchWithRetry now returns 4xx without throwing)
      if (!resp.ok) {
        if (resp.status === 404) {
          stopPolling();
          await cancelScheduledNotification(scheduledNotifId.current);
          scheduledNotifId.current = null;
          setActiveJob(prev =>
            prev && prev.id === localJobId
              ? { ...prev, status: "failed", error: "Grading session expired. Please try again." }
              : prev
          );
        }
        // For 5xx or other errors, stay silent and let the interval retry
        return;
      }

      const data = await resp.json();

      // Defensive: server returned 200 but with an error field
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
          const fn = recordUsageRef.current;
          recordUsageRef.current = null;
          try { await fn(1); } catch {}
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

        if (saved.id && !saved.id.startsWith("unsaved_")) {
          if (rcAppUserId) {
            const sid = stableUserId || undefined;
            const serverFrontId = (result as any).frontImageId as string | undefined;
            const serverBackId = (result as any).backImageId as string | undefined;
            if (serverFrontId || serverBackId) {
              // Server already stored the full-res originals during grading.
              // Save the URLs locally and link the existing UUIDs to the history
              // row — no second image upload needed.
              const makeUrl = (id?: string) =>
                id ? new URL(`/api/grading-image/${encodeURIComponent(id)}`, getApiUrl()).toString() : null;
              const fUrl = makeUrl(serverFrontId);
              const bUrl = makeUrl(serverBackId);
              if (fUrl || bUrl) {
                updateGrading(saved.id, { frontImageUrl: fUrl, backImageUrl: bUrl }).catch(() => {});
              }
              uploadGrading(rcAppUserId, saved, sid)
                .then(() => linkGradingImages(rcAppUserId, saved.id, serverFrontId, serverBackId, sid))
                .catch(() => {});
            } else {
              // Fallback (web / older builds): upload the images as base64.
              uploadGrading(rcAppUserId, saved, sid).catch(() => {});
              uploadGradingImages(rcAppUserId, saved.id, frontImage, backImage, sid)
                .then(({ frontImageUrl, backImageUrl }) => {
                  if (frontImageUrl || backImageUrl) {
                    updateGrading(saved.id, { frontImageUrl, backImageUrl }).catch(() => {});
                  }
                })
                .catch(() => {});
            }
          } else {
            pendingUploadsRef.current.push(saved);
          }
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

        // Tell the server this result has been delivered so it won't appear
        // in /api/pending-grades on the next app launch (fire-and-forget).
        apiRequest("POST", `/api/grade-job/${serverJobId}/acknowledge`).catch(() => {});
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
      } else if (data.status === "processing" && data.progress) {
        // Still grading — surface the REAL server stage so the waiting screen
        // tracks the actual pipeline instead of a fake timer.
        setActiveJob(prev =>
          prev && prev.id === localJobId
            ? { ...prev, progress: data.progress }
            : prev
        );
      }
    } catch (err: any) {
      // 404 means the job is gone (server restarted) — fail cleanly instead of retrying forever
      // fetchWithRetry throws new Error("404") — no colon, just the status code
      if (err?.message === "404" || err?.message?.startsWith("404") || err?.message?.includes("Job not found")) {
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

  // Shared helper — starts (or restarts) polling for any processing job.
  // Used by: submitGrading/submitDeep/submitCrossover, AppState resume, and
  // the AsyncStorage restore on app relaunch.
  const startPollingForJob = useCallback((job: GradingJob) => {
    stopPolling();
    const extra = job.isDeepGrade ? {
      angledFrontImage: job.angledFrontImage,
      angledBackImage: job.angledBackImage,
      isDeepGrade: true as const,
    } : undefined;
    const endpoint = job.isCrossover ? "/api/crossover-grade-job" : undefined;
    const certData = job.isCrossover ? job.certData : undefined;
    const startTime = job.startTime || Date.now();
    const localJobId = job.id;
    const serverJobId = job.serverJobId;
    const frontImage = job.frontImage;
    const backImage = job.backImage;
    // Immediate poll — don't wait for first interval tick
    pollJobStatus(serverJobId, localJobId, frontImage, backImage, extra, endpoint, certData);
    pollingRef.current = setInterval(() => {
      if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
        stopPolling();
        setActiveJob(prev =>
          prev && prev.id === localJobId
            ? { ...prev, status: "failed", error: "Grading timed out. Please try again." }
            : prev
        );
        return;
      }
      pollJobStatus(serverJobId, localJobId, frontImage, backImage, extra, endpoint, certData);
    }, POLL_INTERVAL);
  }, [pollJobStatus, stopPolling]);

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
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // Ensure server has the correct tier before quota is checked
      await syncTierNow().catch(() => {});

      let resp: Response;
      if (Platform.OS === "web") {
        // Web is unaffected by the WAF — keep the proven base64 JSON path.
        const frontBase64 = await getBase64FromUri(frontImage);
        const backBase64 = await getBase64FromUri(backImage);
        resp = await withSubmitTimeout(apiRequest("POST", "/api/grade-job", {
          frontImage: frontBase64,
          backImage: backBase64,
          rcUserId: rcAppUserId || undefined,
          stableUserId: stableUserId || undefined,
        }), 60_000);
      } else {
        // Native: high-resolution binary multipart upload.
        resp = await withSubmitTimeout(uploadGradeJobBinary(frontImage, backImage, {
          rcUserId: rcAppUserId || undefined,
          stableUserId: stableUserId || undefined,
        }), 90_000);
      }

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`${resp.status}: ${text}`);
      }
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

      // Build the job object (serverJobId now known) and start polling via shared helper
      const jobForPolling: GradingJob = {
        id: localJobId, serverJobId, frontImage, backImage, status: "processing", startTime: Date.now(),
      };
      startPollingForJob(jobForPolling);
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
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // Ensure server has the correct tier before quota is checked
      await syncTierNow().catch(() => {});

      let resp: Response;
      if (Platform.OS === "web") {
        // Web is unaffected by the WAF — keep the proven base64 JSON path.
        const frontBase64 = await getBase64FromUri(frontImage);
        const backBase64 = await getBase64FromUri(backImage);
        const angledFrontBase64 = await getBase64FromUri(angledFrontImage);
        const angledBackBase64 = await getBase64FromUri(angledBackImage);
        const frontCornerBase64 = await Promise.all(frontCorners.map(getBase64FromUri));
        const backCornerBase64 = await Promise.all(backCorners.map(getBase64FromUri));
        resp = await withSubmitTimeout(apiRequest("POST", "/api/deep-grade-job", {
          frontImage: frontBase64,
          backImage: backBase64,
          angledImage: angledFrontBase64,
          angledBackImage: angledBackBase64,
          frontCorners: frontCornerBase64,
          backCorners: backCornerBase64,
          rcUserId: rcAppUserId || undefined,
          stableUserId: stableUserId || undefined,
        }), 90_000);
      } else {
        // Native: high-resolution binary multipart upload.
        resp = await withSubmitTimeout(uploadDeepGradeJobBinary({
          frontImage, backImage, angledFrontImage, angledBackImage, frontCorners, backCorners,
        }, {
          rcUserId: rcAppUserId || undefined,
          stableUserId: stableUserId || undefined,
        }), 120_000);
      }

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`${resp.status}: ${text}`);
      }
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

      const jobForPolling: GradingJob = {
        id: localJobId, serverJobId, frontImage, backImage,
        angledFrontImage, angledBackImage, isDeepGrade: true,
        status: "processing", startTime: Date.now(),
      };
      startPollingForJob(jobForPolling);
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
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // Ensure server has the correct tier before quota is checked
      await syncTierNow().catch(() => {});

      let resp: Response;
      if (Platform.OS === "web") {
        // Web is unaffected by the WAF — keep the proven base64 JSON path.
        const slabFrontBase64 = await getBase64FromUri(slabFrontImage);
        const slabBackBase64 = slabBackImage ? await getBase64FromUri(slabBackImage) : undefined;
        resp = await withSubmitTimeout(apiRequest("POST", "/api/crossover-grade-job", {
          slabImage: slabFrontBase64,
          slabBackImage: slabBackBase64,
          ...(certData ? { certData } : {}),
          rcUserId: rcAppUserId || undefined,
          stableUserId: stableUserId || undefined,
        }), 60_000);
      } else {
        // Native: high-resolution binary multipart upload.
        resp = await withSubmitTimeout(uploadCrossoverGradeJobBinary(slabFrontImage, slabBackImage, {
          certData,
          rcUserId: rcAppUserId || undefined,
          stableUserId: stableUserId || undefined,
        }), 90_000);
      }

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`${resp.status}: ${text}`);
      }
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

      const jobForPolling: GradingJob = {
        id: localJobId, serverJobId,
        frontImage: slabFrontImage, backImage: slabBackImage || slabFrontImage,
        isCrossover: true, certData,
        status: "processing", startTime: Date.now(),
      };
      startPollingForJob(jobForPolling);
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

  // ── Recover completed grades after app kill / reinstall ───────────────────
  // On every launch (once rcAppUserId is known), ask the server for any
  // completed jobs that were never delivered. The server stores each job
  // against the user's RC ID, so results survive full app kills, reinstalls,
  // and even device switches. No AsyncStorage needed.
  useEffect(() => {
    if (!rcAppUserId && !stableUserId) return;
    if (pendingRecoveryRef.current) return;
    pendingRecoveryRef.current = true;
    (async () => {
      try {
        const url = new URL("/api/pending-grades", getApiUrl());
        if (rcAppUserId) url.searchParams.set("rcUserId", rcAppUserId);
        if (stableUserId) url.searchParams.set("stableId", stableUserId);
        const resp = await fetch(url.toString());
        if (!resp.ok) return;
        const { jobs } = await resp.json();
        if (!Array.isArray(jobs) || jobs.length === 0) return;

        // Process each pending grade (surface the first one, silently save the rest)
        for (let i = 0; i < jobs.length; i++) {
          const job = jobs[i];
          if (!job.result) continue;
          // Dedupe across re-runs (stable-id run then rc-id run) so the same
          // server job is never saved to local history twice.
          if (recoveredJobIdsRef.current.has(job.id)) continue;
          recoveredJobIdsRef.current.add(job.id);

          const result: GradingResult = job.result;

          // The server stores full-res originals against the job, so recovered
          // grades can now restore their images too (previously lost on kill).
          const serverFrontId = (result as any).frontImageId as string | undefined;
          const serverBackId = (result as any).backImageId as string | undefined;
          const makeUrl = (id?: string) =>
            id ? new URL(`/api/grading-image/${encodeURIComponent(id)}`, getApiUrl()).toString() : null;
          const fUrl = makeUrl(serverFrontId);
          const bUrl = makeUrl(serverBackId);

          // Save to local history. Images come from the server URLs if available.
          let saved: any;
          try {
            saved = await saveGrading("", "", result, undefined);
          } catch {
            saved = { id: `unsaved_${Date.now()}`, frontImage: "", backImage: "", result, timestamp: Date.now() };
          }

          if (saved.id && !saved.id.startsWith("unsaved_")) {
            const sid = stableUserId || undefined;
            if (fUrl || bUrl) {
              updateGrading(saved.id, { frontImageUrl: fUrl, backImageUrl: bUrl }).catch(() => {});
              // Chain link AFTER the row insert resolves, otherwise the link
              // update can run before the row exists and silently no-op.
              uploadGrading(rcAppUserId, saved, sid)
                .then(() => linkGradingImages(rcAppUserId, saved.id, serverFrontId, serverBackId, sid))
                .catch(() => {});
            } else {
              uploadGrading(rcAppUserId, saved, sid).catch(() => {});
            }
          }

          // Surface only the first result so we don't stack multiple modals
          if (i === 0) {
            if (Platform.OS !== "web") {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            if (notificationsEnabled.current) {
              const cardName = result.cardName || "Your card";
              sendImmediateNotification("Grading Complete", `${cardName} has been graded!`);
            }
            setActiveJob({
              id: `recovered_${job.id}`,
              serverJobId: job.id,
              frontImage: "",
              backImage: "",
              status: "completed",
              savedGrading: saved,
              startTime: Date.now(),
            });
          }

          // Acknowledge every job so it doesn't reappear next launch
          apiRequest("POST", `/api/grade-job/${job.id}/acknowledge`).catch(() => {});
        }
      } catch (e) {
        // Non-critical — user will still see their grades in history
        console.log("[pending-grades] startup check failed:", e);
      } finally {
        pendingRecoveryRef.current = false;
      }
    })();
  }, [rcAppUserId, stableUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resume polling when returning to foreground ────────────────────────────
  // Uses startPollingForJob so logic is shared across all polling entry points.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && activeJob?.status === "processing" && activeJob.serverJobId) {
        startPollingForJob(activeJob);
      }
    });
    return () => sub.remove();
  }, [activeJob?.status, activeJob?.serverJobId, activeJob?.id, activeJob?.frontImage, activeJob?.backImage, activeJob?.isDeepGrade, activeJob?.isCrossover, activeJob?.certData, startPollingForJob]);

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
