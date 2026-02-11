import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { getSettings, saveSettings, DEFAULT_SETTINGS, type AppSettings, type CompanyId } from "./settings";

interface SettingsContextValue {
  settings: AppSettings;
  isCompanyEnabled: (company: CompanyId) => boolean;
  toggleCompany: (company: CompanyId) => void;
  setEnabledCompanies: (companies: CompanyId[]) => void;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  const isCompanyEnabled = useCallback(
    (company: CompanyId) => settings.enabledCompanies.includes(company),
    [settings.enabledCompanies]
  );

  const toggleCompany = useCallback(
    (company: CompanyId) => {
      setSettings((prev) => {
        const enabled = prev.enabledCompanies.includes(company);
        if (enabled && prev.enabledCompanies.length <= 1) return prev;
        const next: AppSettings = {
          ...prev,
          enabledCompanies: enabled
            ? prev.enabledCompanies.filter((c) => c !== company)
            : [...prev.enabledCompanies, company],
        };
        saveSettings(next);
        return next;
      });
    },
    []
  );

  const setEnabledCompanies = useCallback((companies: CompanyId[]) => {
    if (companies.length === 0) return;
    const next: AppSettings = { enabledCompanies: companies };
    setSettings(next);
    saveSettings(next);
  }, []);

  const value = useMemo(
    () => ({ settings, isCompanyEnabled, toggleCompany, setEnabledCompanies, loading }),
    [settings, isCompanyEnabled, toggleCompany, setEnabledCompanies, loading]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
