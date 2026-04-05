import AsyncStorage from "@react-native-async-storage/async-storage";

const SETTINGS_KEY = "gradeiq_settings";

export type CompanyId = "PSA" | "Beckett" | "Ace" | "TAG" | "CGC";

export type CurrencyCode = "GBP" | "USD" | "EUR" | "AUD" | "CAD" | "JPY";

export type ProfitDisplay = "value" | "percentage" | "both";

export const CURRENCIES: { code: CurrencyCode; symbol: string; label: string }[] = [
  { code: "GBP", symbol: "£", label: "GBP (£)" },
  { code: "USD", symbol: "$", label: "USD ($)" },
  { code: "EUR", symbol: "€", label: "EUR (€)" },
  { code: "AUD", symbol: "A$", label: "AUD (A$)" },
  { code: "CAD", symbol: "C$", label: "CAD (C$)" },
  { code: "JPY", symbol: "¥", label: "JPY (¥)" },
];

export interface AppSettings {
  enabledCompanies: CompanyId[];
  currency: CurrencyCode;
  preferredPicksCompany: CompanyId;
  profitDisplay: ProfitDisplay;
}

export const ALL_COMPANIES: { id: CompanyId; label: string; shortLabel: string; color: string }[] = [
  { id: "PSA", label: "PSA", shortLabel: "PSA", color: "#1E56A0" },
  { id: "Beckett", label: "Beckett (BGS)", shortLabel: "BGS", color: "#C0C0C0" },
  { id: "Ace", label: "Ace Grading", shortLabel: "ACE", color: "#FFD700" },
  { id: "TAG", label: "TAG Grading", shortLabel: "TAG", color: "#FFFFFF" },
  { id: "CGC", label: "CGC Cards", shortLabel: "CGC", color: "#E63946" },
];

export const DEFAULT_SETTINGS: AppSettings = {
  enabledCompanies: [],
  currency: "GBP",
  preferredPicksCompany: "PSA",
  profitDisplay: "value",
};

export async function getSettings(): Promise<AppSettings> {
  try {
    const data = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!data) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(data);
    if (!parsed.enabledCompanies || !Array.isArray(parsed.enabledCompanies)) {
      return DEFAULT_SETTINGS;
    }
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
