import { getApiUrl } from "@/lib/query-client";
import type { SavedGrading } from "@/lib/types";

const TIMEOUT_MS = 10_000;

function apiUrl(path: string): string {
  return new URL(path, getApiUrl()).toString();
}

export async function uploadGrading(rcUserId: string, grading: SavedGrading): Promise<void> {
  if (!rcUserId || !grading?.id || !grading?.result) return;
  try {
    const { frontImage, backImage, angledFrontImage, angledBackImage, frontCornerImages, backCornerImages, ...rest } = grading as any;
    await fetch(apiUrl("/api/history"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rcUserId,
        localId: grading.id,
        result: grading.result,
        timestamp: grading.timestamp,
        isDeepGrade: grading.isDeepGrade ?? false,
        isCrossover: (grading as any).isCrossover ?? false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
  }
}

export async function uploadBulkGradings(rcUserId: string, gradings: SavedGrading[]): Promise<void> {
  if (!rcUserId || !gradings.length) return;
  try {
    const payload = gradings
      .filter(g => g?.id && g?.result)
      .map(g => ({
        localId: g.id,
        result: g.result,
        timestamp: g.timestamp,
        isDeepGrade: g.isDeepGrade ?? false,
        isCrossover: (g as any).isCrossover ?? false,
      }));
    if (!payload.length) return;
    await fetch(apiUrl("/api/history/bulk"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rcUserId, gradings: payload }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
  }
}

export interface ServerGrading {
  id: string;
  result: any;
  timestamp: number;
  isDeepGrade: boolean;
  isCrossover: boolean;
}

export async function fetchServerHistory(rcUserId: string): Promise<ServerGrading[]> {
  if (!rcUserId) return [];
  try {
    const resp = await fetch(
      apiUrl(`/api/history?rcUserId=${encodeURIComponent(rcUserId)}`),
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function deleteServerGrading(rcUserId: string, localId: string): Promise<void> {
  if (!rcUserId || !localId) return;
  try {
    await fetch(
      apiUrl(`/api/history/${encodeURIComponent(localId)}?rcUserId=${encodeURIComponent(rcUserId)}`),
      {
        method: "DELETE",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
  } catch {
  }
}
