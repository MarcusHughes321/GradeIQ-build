import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { getSettings, saveSettings, DEFAULT_SETTINGS, type AppSettings, type CompanyId, type CurrencyCode, type ProfitDisplay } from "./settings";

interface SettingsContextValue {
  settings: AppSettings;
  isCompanyEnabled: (company: CompanyId) => boolean;
  toggleCompany: (company: CompanyId) => void;
  setEnabledCompanies: (companies: CompanyId[]) => void;
  setCurrency: (currency: CurrencyCode) => void;
  setPreferredPicksCompany: (company: CompanyId) => void;
  setProfitDisplay: (display: ProfitDisplay) => void;
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
        const newEnabled = enabled
          ? prev.enabledCompanies.filter((c) => c !== company)
          : [...prev.enabledCompanies, company];
        // If the preferred picks company was just disabled, reset to the first remaining enabled company
        const preferred =
          newEnabled.includes(prev.preferredPicksCompany)
            ? prev.preferredPicksCompany
            : (newEnabled[0] ?? prev.preferredPicksCompany);
        const next: AppSettings = {
          ...prev,
          enabledCompanies: newEnabled,
          preferredPicksCompany: preferred,
        };
        saveSettings(next);
        return next;
      });
    },
    []
  );

  const setPreferredPicksCompany = useCallback((company: CompanyId) => {
    setSettings((prev) => {
      const next: AppSettings = { ...prev, preferredPicksCompany: company };
      saveSettings(next);
      return next;
    });
  }, []);

  const setEnabledCompanies = useCallback((companies: CompanyId[]) => {
    if (companies.length === 0) return;
    setSettings((prev) => {
      const next: AppSettings = { ...prev, enabledCompanies: companies };
      saveSettings(next);
      return next;
    });
  }, []);

  const setCurrency = useCallback((currency: CurrencyCode) => {
    setSettings((prev) => {
      const next: AppSettings = { ...prev, currency };
      saveSettings(next);
      return next;
    });
  }, []);

  const setProfitDisplay = useCallback((display: ProfitDisplay) => {
    setSettings((prev) => {
      const next: AppSettings = { ...prev, profitDisplay: display };
      saveSettings(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ settings, isCompanyEnabled, toggleCompany, setEnabledCompanies, setCurrency, setPreferredPicksCompany, setProfitDisplay, loading }),
    [settings, isCompanyEnabled, toggleCompany, setEnabledCompanies, setCurrency, setPreferredPicksCompany, setProfitDisplay, loading]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
