import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import type { CenteringMeasurement } from "@/lib/types";

interface CenteringCardProps {
  centering: CenteringMeasurement;
  onOpenTool: () => void;
}

function formatRatio(value: number): string {
  const other = 100 - value;
  return `${value}/${other}`;
}

function getCenteringColor(value: number): string {
  if (value <= 52) return "#10B981";
  if (value <= 55) return "#34D399";
  if (value <= 60) return "#F59E0B";
  if (value <= 65) return "#FB923C";
  return "#EF4444";
}

interface CenteringStandard {
  company: string;
  front10: number;
  back10: number;
  color: string;
}

const STANDARDS: CenteringStandard[] = [
  { company: "PSA", front10: 55, back10: 75, color: Colors.cardPSA },
  { company: "BGS", front10: 50, back10: 50, color: Colors.cardBeckett },
  { company: "Ace", front10: 60, back10: 60, color: Colors.cardAce },
];

function getCenteringGradeForCompany(
  frontLR: number,
  frontTB: number,
  backLR: number,
  backTB: number,
  standard: CenteringStandard
): { grade: number; passes10: boolean } {
  const frontWorst = Math.max(frontLR, frontTB);
  const backWorst = Math.max(backLR, backTB);

  if (standard.company === "PSA") {
    if (frontWorst <= 55 && backWorst <= 75) return { grade: 10, passes10: true };
    if (frontWorst <= 60 && backWorst <= 75) return { grade: 9, passes10: false };
    if (frontWorst <= 65 && backWorst <= 90) return { grade: 8, passes10: false };
    if (frontWorst <= 70 && backWorst <= 90) return { grade: 7, passes10: false };
    return { grade: 6, passes10: false };
  }
  if (standard.company === "BGS") {
    if (frontWorst <= 50 && backWorst <= 50) return { grade: 10, passes10: true };
    if (frontWorst <= 55 && backWorst <= 55) return { grade: 9.5, passes10: false };
    if (frontWorst <= 60 && backWorst <= 60) return { grade: 9, passes10: false };
    if (frontWorst <= 65 && backWorst <= 65) return { grade: 8.5, passes10: false };
    if (frontWorst <= 70 && backWorst <= 70) return { grade: 8, passes10: false };
    return { grade: 7, passes10: false };
  }
  if (frontWorst <= 60 && backWorst <= 60) return { grade: 10, passes10: true };
  if (frontWorst <= 65 && backWorst <= 65) return { grade: 9, passes10: false };
  if (frontWorst <= 70 && backWorst <= 70) return { grade: 8, passes10: false };
  return { grade: 7, passes10: false };
}

interface RatioDisplayProps {
  label: string;
  lr: number;
  tb: number;
}

function RatioDisplay({ label, lr, tb }: RatioDisplayProps) {
  const lrColor = getCenteringColor(lr);
  const tbColor = getCenteringColor(tb);

  return (
    <View style={styles.ratioSection}>
      <Text style={styles.ratioSectionLabel}>{label}</Text>
      <View style={styles.ratioRow}>
        <View style={styles.ratioItem}>
          <Text style={styles.ratioAxisLabel}>L/R</Text>
          <Text style={[styles.ratioValue, { color: lrColor }]}>{formatRatio(lr)}</Text>
        </View>
        <View style={styles.ratioDivider} />
        <View style={styles.ratioItem}>
          <Text style={styles.ratioAxisLabel}>T/B</Text>
          <Text style={[styles.ratioValue, { color: tbColor }]}>{formatRatio(tb)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function CenteringCard({ centering, onOpenTool }: CenteringCardProps) {
  const c = centering;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="scan-outline" size={20} color={Colors.primary} />
          <Text style={styles.title}>Centering</Text>
        </View>
        <Pressable
          onPress={onOpenTool}
          style={({ pressed }) => [styles.measureBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="resize-outline" size={16} color="#fff" />
          <Text style={styles.measureBtnText}>Measure</Text>
        </Pressable>
      </View>

      <View style={styles.ratiosContainer}>
        <RatioDisplay label="Front" lr={c.frontLeftRight} tb={c.frontTopBottom} />
        <RatioDisplay label="Back" lr={c.backLeftRight} tb={c.backTopBottom} />
      </View>

      <View style={styles.divider} />

      <View style={styles.gradesContainer}>
        {STANDARDS.map((standard) => {
          const result = getCenteringGradeForCompany(
            c.frontLeftRight,
            c.frontTopBottom,
            c.backLeftRight,
            c.backTopBottom,
            standard
          );
          const gradeColor = result.passes10 ? "#10B981" : getCenteringColor(
            Math.max(c.frontLeftRight, c.frontTopBottom)
          );

          return (
            <View key={standard.company} style={styles.gradeItem}>
              <Text style={[styles.gradeCompany, { color: standard.color === "#FFFFFF" ? Colors.textSecondary : standard.color }]}>
                {standard.company}
              </Text>
              <Text style={[styles.gradeValue, { color: gradeColor }]}>{result.grade}</Text>
              <Text style={styles.gradeMaxLabel}>
                {result.passes10 ? "10 eligible" : `max ${result.grade}`}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  measureBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  measureBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
  ratiosContainer: {
    flexDirection: "row",
    gap: 12,
  },
  ratioSection: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 12,
  },
  ratioSectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: Colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  ratioRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  ratioItem: {
    flex: 1,
    alignItems: "center",
  },
  ratioAxisLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  ratioValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  ratioDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.surfaceBorder,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: 14,
  },
  gradesContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  gradeItem: {
    alignItems: "center",
    gap: 2,
  },
  gradeCompany: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  gradeValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
  },
  gradeMaxLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
  },
});
