import AsyncStorage from "@react-native-async-storage/async-storage";

const SETTINGS_KEY = "gradeiq_settings";

export type CompanyId = "PSA" | "Beckett" | "Ace" | "TAG" | "CGC";

export interface AppSettings {
  enabledCompanies: CompanyId[];
}

export const ALL_COMPANIES: { id: CompanyId; label: string; shortLabel: string; color: string }[] = [
  { id: "PSA", label: "PSA", shortLabel: "PSA", color: "#FF3C31" },
  { id: "Beckett", label: "Beckett (BGS)", shortLabel: "BGS", color: "#FFFFFF" },
  { id: "Ace", label: "Ace Grading", shortLabel: "ACE", color: "#A0A0A0" },
  { id: "TAG", label: "TAG Grading", shortLabel: "TAG", color: "#00B4D8" },
  { id: "CGC", label: "CGC Cards", shortLabel: "CGC", color: "#FFD700" },
];

export const DEFAULT_SETTINGS: AppSettings = {
  enabledCompanies: ["PSA", "Beckett", "Ace", "TAG", "CGC"],
};

export async function getSettings(): Promise<AppSettings> {
  try {
    const data = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!data) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(data);
    if (!parsed.enabledCompanies || !Array.isArray(parsed.enabledCompanies)) {
      return DEFAULT_SETTINGS;
    }
    return parsed;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
