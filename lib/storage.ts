import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SavedGrading, GradingResult } from "./types";

const STORAGE_KEY = "cardgrade_history";

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

  const existing = await getGradings();
  existing.unshift(grading);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  return grading;
}

export async function getGradings(): Promise<SavedGrading[]> {
  const data = await AsyncStorage.getItem(STORAGE_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function deleteGrading(id: string): Promise<void> {
  const existing = await getGradings();
  const filtered = existing.filter((g) => g.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export async function updateGrading(id: string, updates: Partial<SavedGrading>): Promise<void> {
  const existing = await getGradings();
  const index = existing.findIndex((g) => g.id === id);
  if (index !== -1) {
    existing[index] = { ...existing[index], ...updates };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  }
}

export async function clearAllGradings(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
