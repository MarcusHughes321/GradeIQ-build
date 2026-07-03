import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SavedGrading, GradingResult } from "./types";

const STORAGE_KEY = "cardgrade_history";

export async function getGradings(): Promise<SavedGrading[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export async function saveGrading(
  frontImage: string,
  backImage: string,
  result: GradingResult,
  extraImages?: {
    angledFrontImage?: string;
    angledBackImage?: string;
    frontCornerImages?: string[];
    backCornerImages?: string[];
    isDeepGrade?: boolean;
  },
): Promise<SavedGrading> {
  const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
  const grading: SavedGrading = {
    id,
    frontImage,
    backImage,
    ...(extraImages?.angledFrontImage && { angledFrontImage: extraImages.angledFrontImage }),
    ...(extraImages?.angledBackImage && { angledBackImage: extraImages.angledBackImage }),
    ...(extraImages?.frontCornerImages && { frontCornerImages: extraImages.frontCornerImages }),
    ...(extraImages?.backCornerImages && { backCornerImages: extraImages.backCornerImages }),
    ...(extraImages?.isDeepGrade && { isDeepGrade: true }),
    result,
    timestamp: Date.now(),
  };

  try {
    const existing = await getGradings();
    existing.unshift(grading);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch {}
  return grading;
}

export async function deleteGrading(id: string): Promise<void> {
  try {
    const existing = await getGradings();
    const filtered = existing.filter((g) => g.id !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {}
}

export async function updateGrading(id: string, updates: Partial<SavedGrading>): Promise<void> {
  try {
    const existing = await getGradings();
    const index = existing.findIndex((g) => g.id === id);
    if (index !== -1) {
      existing[index] = { ...existing[index], ...updates };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    }
  } catch {}
}

export async function updateGradingImageUrls(
  id: string,
  frontImageUrl: string | null,
  backImageUrl: string | null,
): Promise<void> {
  const updates: Partial<SavedGrading> = {};
  if (frontImageUrl) updates.frontImageUrl = frontImageUrl;
  if (backImageUrl) updates.backImageUrl = backImageUrl;
  if (Object.keys(updates).length > 0) await updateGrading(id, updates);
}

export async function clearAllGradings(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// Mark a set of grades as having their server history ROW confirmed persisted, in
// a SINGLE read-modify-write (calling updateGrading per id would re-read/re-write
// the whole array O(n) times). Used by the bulk sync/recovery paths and by the
// startup history sync when it sees rows already present on the server, so those
// grades stop counting as pending without a redundant re-upload.
export async function markRowsBackedUp(ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    const idSet = new Set(ids);
    const existing = await getGradings();
    let changed = false;
    for (const g of existing) {
      if (idSet.has(g.id) && !g.historyRowBackedUp) {
        g.historyRowBackedUp = true;
        changed = true;
      }
    }
    if (changed) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch {}
}

export async function saveServerGrading(serverGrading: {
  id: string;
  result: any;
  timestamp: number;
  isDeepGrade?: boolean;
  isCrossover?: boolean;
  frontImageUrl?: string | null;
  backImageUrl?: string | null;
}): Promise<void> {
  try {
    const existing = await getGradings();
    if (existing.some(g => g.id === serverGrading.id)) return;
    const record: SavedGrading = {
      id: serverGrading.id,
      frontImage: "",
      backImage: "",
      result: serverGrading.result,
      // Coerce in case the server sent a bigint-as-string timestamp — a string
      // yields "Invalid Date" on render and breaks the numeric sort below.
      timestamp: Number(serverGrading.timestamp),
      // Restored straight from the server, so its history row is definitionally
      // backed up — never let a restored grade show as "pending" / re-upload it.
      historyRowBackedUp: true,
      ...(serverGrading.isDeepGrade ? { isDeepGrade: true } : {}),
      ...(serverGrading.frontImageUrl ? { frontImageUrl: serverGrading.frontImageUrl } : {}),
      ...(serverGrading.backImageUrl ? { backImageUrl: serverGrading.backImageUrl } : {}),
    };
    existing.unshift(record);
    existing.sort((a, b) => b.timestamp - a.timestamp);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch {}
}
