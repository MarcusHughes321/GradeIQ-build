import React from "react";
import { View, Text, StyleSheet, Platform, Switch, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useSettings } from "@/lib/settings-context";
import { ALL_COMPANIES, type CompanyId } from "@/lib/settings";
import CompanyLabel from "@/components/CompanyLabel";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, toggleCompany } = useSettings();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const enabledCount = settings.enabledCompanies.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: insets.bottom + webBottomInset + 100 }}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Grading Companies</Text>
          <Text style={styles.sectionSubtitle}>
            Choose which grading companies to show in your results and dashboard
          </Text>
        </View>

        <View style={styles.companyList}>
          {ALL_COMPANIES.map((company) => {
            const enabled = settings.enabledCompanies.includes(company.id);
            const isLastEnabled = enabled && enabledCount <= 1;

            return (
              <CompanyRow
                key={company.id}
                id={company.id}
                label={company.label}
                shortLabel={company.shortLabel}
                color={company.color}
                enabled={enabled}
                disabled={isLastEnabled}
                onToggle={toggleCompany}
              />
            );
          })}
        </View>

        <Text style={styles.hint}>
          At least one grading company must remain enabled. More companies coming soon.
        </Text>
      </ScrollView>
    </View>
  );
}

function CompanyRow({
  id,
  label,
  shortLabel,
  color,
  enabled,
  disabled,
  onToggle,
}: {
  id: CompanyId;
  label: string;
  shortLabel: string;
  color: string;
  enabled: boolean;
  disabled: boolean;
  onToggle: (id: CompanyId) => void;
}) {
  return (
    <View style={[styles.companyRow, !enabled && styles.companyRowDisabled]}>
      <View style={styles.companyInfo}>
        <View style={{ width: 40, opacity: enabled ? 1 : 0.4 }}><CompanyLabel company={shortLabel} fontSize={16} /></View>
        <Text style={[styles.companyLabel, !enabled && styles.companyLabelDisabled]}>{label}</Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={() => {
          if (!disabled) onToggle(id);
        }}
        disabled={disabled}
        trackColor={{ false: Colors.surfaceBorder, true: Colors.primary + "80" }}
        thumbColor={enabled ? Colors.primary : Colors.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.text,
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  companyList: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: "hidden",
  },
  companyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  companyRowDisabled: {
    opacity: 0.5,
  },
  companyInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  companyShort: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    width: 40,
  },
  companyLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: Colors.text,
  },
  companyLabelDisabled: {
    color: Colors.textMuted,
  },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 12,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
});
