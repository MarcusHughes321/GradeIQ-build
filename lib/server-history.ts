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
  frontImageId?: string | null;
  backImageId?: string | null;
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

export async function uploadGradingImages(
  rcUserId: string,
  localId: string,
  frontB64: string | null,
  backB64: string | null,
): Promise<{ frontImageUrl: string | null; backImageUrl: string | null }> {
  if (!rcUserId || !localId || (!frontB64 && !backB64)) {
    return { frontImageUrl: null, backImageUrl: null };
  }
  try {
    const body: Record<string, string> = { rcUserId };
    if (frontB64) body.frontB64 = frontB64;
    if (backB64) body.backB64 = backB64;
    const resp = await fetch(apiUrl(`/api/history/${encodeURIComponent(localId)}/images`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) return { frontImageUrl: null, backImageUrl: null };
    const data = await resp.json();
    const makeUrl = (id: string | null) =>
      id ? apiUrl(`/api/grading-image/${encodeURIComponent(id)}`) : null;
    return {
      frontImageUrl: makeUrl(data.frontImageId ?? null),
      backImageUrl: makeUrl(data.backImageId ?? null),
    };
  } catch {
    return { frontImageUrl: null, backImageUrl: null };
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
