import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { ALL_COMPANIES, type CompanyId } from "@/lib/settings";
import { useSettings } from "@/lib/settings-context";
import CompanyLabel from "@/components/CompanyLabel";

export default function CompanySelectScreen() {
  const insets = useSafeAreaInsets();
  const { setEnabledCompanies } = useSettings();
  const [selected, setSelected] = useState<CompanyId[]>([]);
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const toggle = (id: CompanyId) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setSelected(ALL_COMPANIES.map((c) => c.id));
  };

  const handleContinue = () => {
    if (selected.length === 0) return;
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setEnabledCompanies(selected);
    router.replace("/(tabs)");
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#1a0a08", "#000000"]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.content, { paddingTop: insets.top + webTopInset + 20, paddingBottom: insets.bottom + webBottomInset + 20 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Choose Your Grading{"\n"}Companies</Text>
          <Text style={styles.subtitle}>
            Select which grading companies you want to see grades for. You can change this anytime in Settings.
          </Text>
        </View>

        <View style={styles.companiesWrap}>
          {ALL_COMPANIES.map((company) => {
            const isSelected = selected.includes(company.id);
            return (
              <Pressable
                key={company.id}
                style={[
                  styles.companyRow,
                  isSelected && styles.companyRowSelected,
                ]}
                onPress={() => toggle(company.id)}
              >
                <View style={styles.companyInfo}>
                  <CompanyLabel company={company.id} fontSize={16} />
                  <Text style={styles.companyName}>{company.label}</Text>
                </View>
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={selectAll} style={({ pressed }) => [styles.selectAllBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={styles.selectAllText}>Select All</Text>
        </Pressable>

        <View style={styles.bottomSection}>
          <Pressable
            style={[
              styles.continueBtn,
              selected.length === 0 && styles.continueBtnDisabled,
            ]}
            onPress={handleContinue}
            disabled={selected.length === 0}
          >
            <Text style={styles.continueBtnText}>
              {selected.length === 0 ? "Select at least one" : `Continue with ${selected.length} ${selected.length === 1 ? "company" : "companies"}`}
            </Text>
            {selected.length > 0 && <Ionicons name="arrow-forward" size={20} color="#fff" />}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  header: {
    gap: 12,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: Colors.text,
    lineHeight: 34,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  companiesWrap: {
    gap: 10,
  },
  companyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
  },
  companyRowSelected: {
    borderColor: Colors.primary,
    backgroundColor: "rgba(255,60,49,0.08)",
  },
  companyInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  companyName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  selectAllBtn: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  selectAllText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.primary,
  },
  bottomSection: {
    gap: 12,
  },
  continueBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
  },
  continueBtnDisabled: {
    backgroundColor: Colors.surfaceBorder,
  },
  continueBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
  },
});
