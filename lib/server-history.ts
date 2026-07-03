import { getApiUrl } from "@/lib/query-client";
import type { SavedGrading } from "@/lib/types";

const TIMEOUT_MS = 10_000;

function apiUrl(path: string): string {
  return new URL(path, getApiUrl()).toString();
}

// Extract the bare image UUID from a stored image URL (`/api/grading-image/<id>`).
// SavedGrading keeps the full URL; the bulk-history endpoint wants just the id so
// it can persist it on the row. Returns null for empty/foreign urls.
export function imageIdFromUrl(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/api\/grading-image\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// React Native 0.81 polyfills AbortController/AbortSignal via the `abort-controller`
// npm package (wired in by RN's setUpXHR.js). That polyfill does NOT implement the
// static `AbortSignal.timeout()` method, so calling it on-device throws
// `TypeError: AbortSignal.timeout is not a function`. Because every fetch below is
// wrapped in a try/catch that swallows errors, that single throw turned EVERY
// history/backup call into a silent no-op (grading_history stayed empty, photos
// never backed up, nothing restored after reinstall). This helper reproduces the
// same "abort after N ms" behaviour with a plain AbortController + setTimeout, which
// IS polyfilled everywhere (native + web). Always call `clear()` in a finally block
// so the timer is released once the request settles.
export function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

export async function claimHistoryForStableId(rcUserId: string, stableId: string): Promise<void> {
  if (!rcUserId || !stableId) return;
  const t = timeoutSignal(TIMEOUT_MS);
  try {
    const resp = await fetch(apiUrl("/api/history/claim"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rcUserId, stableId }),
      signal: t.signal,
    });
    if (!resp.ok) console.warn(`[history] claim failed: HTTP ${resp.status}`);
  } catch (e: any) {
    console.warn(`[history] claim request error: ${e?.message ?? e}`);
  } finally {
    t.clear();
  }
}

// Returns true only when the server confirms the row was persisted (HTTP 2xx), so
// callers can safely gate the follow-up image link on it.
export async function uploadGrading(
  rcUserId: string,
  grading: SavedGrading,
  stableId?: string,
  frontImageId?: string | null,
  backImageId?: string | null,
): Promise<boolean> {
  if (!rcUserId || !grading?.id || !grading?.result) return false;
  const t = timeoutSignal(TIMEOUT_MS);
  try {
    const resp = await fetch(apiUrl("/api/history"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rcUserId,
        stableId: stableId ?? null,
        localId: grading.id,
        result: grading.result,
        timestamp: grading.timestamp,
        isDeepGrade: grading.isDeepGrade ?? false,
        isCrossover: (grading as any).isCrossover ?? false,
        // Optional: fold the image ids into the SAME upsert so a restored row is
        // never missing its image urls (the blank-thumbnail bug).
        ...(frontImageId ? { frontImageId } : {}),
        ...(backImageId ? { backImageId } : {}),
      }),
      signal: t.signal,
    });
    if (!resp.ok) {
      console.warn(`[history] upload failed for ${grading.id}: HTTP ${resp.status}`);
      return false;
    }
    return true;
  } catch (e: any) {
    console.warn(`[history] upload request error for ${grading.id}: ${e?.message ?? e}`);
    return false;
  } finally {
    t.clear();
  }
}

// Returns true only when the server confirms the rows were persisted (HTTP 2xx),
// so callers can gate the per-card image link/backup on it.
export async function uploadBulkGradings(rcUserId: string, gradings: SavedGrading[], stableId?: string): Promise<boolean> {
  if (!rcUserId || !gradings.length) return false;
  const t = timeoutSignal(TIMEOUT_MS);
  try {
    const payload = gradings
      .filter(g => g?.id && g?.result)
      .map(g => ({
        localId: g.id,
        result: g.result,
        timestamp: g.timestamp,
        isDeepGrade: g.isDeepGrade ?? false,
        isCrossover: (g as any).isCrossover ?? false,
        // Carry the already-backed-up image ids (if any) so a row created by the
        // reinstall safety net lands WITH its image urls, not NULL ones.
        frontImageId: imageIdFromUrl(g.frontImageUrl),
        backImageId: imageIdFromUrl(g.backImageUrl),
      }));
    if (!payload.length) return false;
    const resp = await fetch(apiUrl("/api/history/bulk"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rcUserId, stableId: stableId ?? null, gradings: payload }),
      signal: t.signal,
    });
    if (!resp.ok) {
      console.warn(`[history] bulk upload failed: HTTP ${resp.status}`);
      return false;
    }
    return true;
  } catch (e: any) {
    console.warn(`[history] bulk upload request error: ${e?.message ?? e}`);
    return false;
  } finally {
    t.clear();
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

export async function fetchServerHistory(rcUserId: string, stableId?: string): Promise<ServerGrading[]> {
  if (!rcUserId && !stableId) return [];
  const t = timeoutSignal(TIMEOUT_MS);
  try {
    const params = new URLSearchParams();
    if (rcUserId) params.set("rcUserId", rcUserId);
    if (stableId) params.set("stableId", stableId);
    const resp = await fetch(apiUrl(`/api/history?${params.toString()}`), { signal: t.signal });
    if (!resp.ok) {
      console.warn(`[history] fetch failed: HTTP ${resp.status}`);
      return [];
    }
    const data = await resp.json();
    return Array.isArray(data) ? data : [];
  } catch (e: any) {
    console.warn(`[history] fetch request error: ${e?.message ?? e}`);
    return [];
  } finally {
    t.clear();
  }
}

export async function uploadGradingImages(
  rcUserId: string,
  localId: string,
  frontB64: string | null,
  backB64: string | null,
  stableId?: string,
): Promise<{ frontImageUrl: string | null; backImageUrl: string | null; linked: boolean }> {
  if (!rcUserId || !localId || (!frontB64 && !backB64)) {
    return { frontImageUrl: null, backImageUrl: null, linked: false };
  }
  const t = timeoutSignal(30_000);
  try {
    const body: Record<string, string> = { rcUserId };
    if (stableId) body.stableId = stableId;
    if (frontB64) body.frontB64 = frontB64;
    if (backB64) body.backB64 = backB64;
    const resp = await fetch(apiUrl(`/api/history/${encodeURIComponent(localId)}/images`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: t.signal,
    });
    if (!resp.ok) {
      console.warn(`[history] image upload failed for ${localId}: HTTP ${resp.status}`);
      return { frontImageUrl: null, backImageUrl: null, linked: false };
    }
    const data = await resp.json();
    const makeUrl = (id: string | null) =>
      id ? apiUrl(`/api/grading-image/${encodeURIComponent(id)}`) : null;
    // `linked` is true only when the UPDATE actually matched a history row. The
    // caller must gate its green "backed up" badge on this — an image stored in
    // object storage but NOT linked to a row is unrestorable on reinstall.
    return {
      frontImageUrl: makeUrl(data.frontImageId ?? null),
      backImageUrl: makeUrl(data.backImageId ?? null),
      linked: data.linked === true,
    };
  } catch (e: any) {
    console.warn(`[history] image upload request error for ${localId}: ${e?.message ?? e}`);
    return { frontImageUrl: null, backImageUrl: null, linked: false };
  } finally {
    t.clear();
  }
}

// Link already-stored image UUIDs (returned by the grade-job) to a history row,
// without re-uploading the image bytes. IMPORTANT: this must run only AFTER the
// history row exists — the server UPDATEs by (rc_user_id, local_id) and returns
// 200 even when 0 rows match, so an early call silently no-ops.
export async function linkGradingImages(
  rcUserId: string,
  localId: string,
  frontImageId?: string | null,
  backImageId?: string | null,
  stableId?: string,
): Promise<void> {
  if (!rcUserId || !localId || (!frontImageId && !backImageId)) return;
  const t = timeoutSignal(TIMEOUT_MS);
  try {
    const body: Record<string, string> = { rcUserId };
    if (stableId) body.stableId = stableId;
    if (frontImageId) body.frontImageId = frontImageId;
    if (backImageId) body.backImageId = backImageId;
    const resp = await fetch(apiUrl(`/api/history/${encodeURIComponent(localId)}/images`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: t.signal,
    });
    if (!resp.ok) console.warn(`[history] image link failed for ${localId}: HTTP ${resp.status}`);
  } catch (e: any) {
    console.warn(`[history] image link request error for ${localId}: ${e?.message ?? e}`);
  } finally {
    t.clear();
  }
}

export async function deleteServerGrading(rcUserId: string, localId: string, stableId?: string): Promise<void> {
  if (!localId || (!rcUserId && !stableId)) return;
  const t = timeoutSignal(TIMEOUT_MS);
  try {
    const params = new URLSearchParams();
    if (rcUserId) params.set("rcUserId", rcUserId);
    if (stableId) params.set("stableId", stableId);
    const resp = await fetch(
      apiUrl(`/api/history/${encodeURIComponent(localId)}?${params.toString()}`),
      {
        method: "DELETE",
        signal: t.signal,
      }
    );
    if (!resp.ok) console.warn(`[history] delete failed for ${localId}: HTTP ${resp.status}`);
  } catch (e: any) {
    console.warn(`[history] delete request error for ${localId}: ${e?.message ?? e}`);
  } finally {
    t.clear();
  }
}
