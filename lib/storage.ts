import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SavedGrading, GradingResult } from "./types";

const STORAGE_KEY = "cardgrade_history";

// ── Normalize stored grading results ────────────────────────────────────────
// The AI occasionally omitted company sections (e.g. a result with only
// psa + beckett), and screens assume all five exist — a missing section
// crashed the dashboard render loop. The server now guarantees all five on
// every new/synced result, but rows saved before that fix can still live in
// AsyncStorage. This fills any missing section from the ones present so no
// screen can crash on old data. Purely additive: existing values are kept.
export function normalizeGradingResult(result: any): GradingResult {
  if (!result || typeof result !== "object") return result;

  const AREAS = ["centering", "corners", "edges", "surface"] as const;
  const isObj = (v: any) => v && typeof v === "object";
  const numOr = (v: any, fb: number) => (typeof v === "number" && isFinite(v) ? v : fb);

  const subSrc = [result.beckett, result.tag, result.ace].find(isObj);
  const scalarGrade =
    typeof result.psa?.grade === "number" ? result.psa.grade :
    typeof result.cgc?.grade === "number" ? result.cgc.grade :
    typeof subSrc?.overallGrade === "number" ? subSrc.overallGrade : 8;
  const refOverall = numOr(subSrc?.overallGrade, scalarGrade);
  const refSub: Record<string, number> = {};
  for (const a of AREAS) refSub[a] = numOr(subSrc?.[a]?.grade, refOverall);

  const estNote = "Estimated from the other companies' grades (the AI response was incomplete).";
  const makeSubAreas = () => {
    const o: any = {};
    for (const a of AREAS) o[a] = { grade: refSub[a], notes: estNote };
    return o;
  };

  if (!isObj(result.psa)) {
    result.psa = { grade: refOverall, centering: estNote, corners: estNote, edges: estNote, surface: estNote, notes: estNote, estimated: true };
  }
  if (!isObj(result.beckett)) {
    result.beckett = { overallGrade: refOverall, ...makeSubAreas(), notes: estNote, estimated: true };
  }
  if (!isObj(result.ace)) {
    result.ace = { overallGrade: refOverall, ...makeSubAreas(), notes: estNote, estimated: true };
  }
  if (!isObj(result.tag)) {
    result.tag = { overallGrade: refOverall, ...makeSubAreas(), notes: estNote, estimated: true };
  }
  if (!isObj(result.cgc)) {
    result.cgc = { grade: refOverall, centering: estNote, corners: estNote, edges: estNote, surface: estNote, notes: estNote, estimated: true };
  }

  // Repair partial sections (a company object present but a grade or
  // sub-area missing) so grade math can't crash on them.
  if (typeof result.psa.grade !== "number") result.psa.grade = refOverall;
  if (typeof result.cgc.grade !== "number") result.cgc.grade = refOverall;
  for (const co of [result.beckett, result.ace, result.tag]) {
    if (typeof co.overallGrade !== "number") co.overallGrade = refOverall;
    for (const a of AREAS) {
      if (!isObj(co[a])) co[a] = { grade: refSub[a], notes: estNote };
      else if (typeof co[a].grade !== "number") co[a].grade = refSub[a];
    }
  }

  return result as GradingResult;
}

export async function getGradings(): Promise<SavedGrading[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    for (const g of parsed) {
      if (g?.result) g.result = normalizeGradingResult(g.result);
    }
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
