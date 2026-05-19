import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import type { CenteringMeasurement } from "@/lib/types";

interface Props {
  centering: CenteringMeasurement;
  onReAdjust: () => void;
  onDone: () => void;
}

interface GradeStandard {
  grade: string;
  label: string;
  frontMaxDev: number;
  backMaxDev: number;
}

interface CompanyStandard {
  name: string;
  color: string;
  grades: GradeStandard[];
  note?: string;
}

const STANDARDS: CompanyStandard[] = [
  {
    name: "PSA",
    color: "#3B82F6",
    note: "PSA allows more leniency on the back",
    grades: [
      { grade: "10", label: "Gem Mint", frontMaxDev: 5,  backMaxDev: 25 },
      { grade: "9",  label: "Mint",     frontMaxDev: 10, backMaxDev: 25 },
      { grade: "8",  label: "NM-MT",    frontMaxDev: 15, backMaxDev: 30 },
      { grade: "7",  label: "NM",       frontMaxDev: 20, backMaxDev: 35 },
    ],
  },
  {
    name: "BGS",
    color: "#8B5CF6",
    note: "Beckett grades centering as a sub-grade",
    grades: [
      { grade: "10",  label: "Pristine",  frontMaxDev: 1,  backMaxDev: 1  },
      { grade: "9.5", label: "Gem Mint",  frontMaxDev: 5,  backMaxDev: 5  },
      { grade: "9",   label: "Mint",      frontMaxDev: 10, backMaxDev: 10 },
      { grade: "8.5", label: "NM-MT+",    frontMaxDev: 15, backMaxDev: 15 },
      { grade: "8",   label: "NM-MT",     frontMaxDev: 20, backMaxDev: 20 },
    ],
  },
  {
    name: "ACE",
    color: "#10B981",
    grades: [
      { grade: "10", label: "Pristine", frontMaxDev: 5,  backMaxDev: 10 },
      { grade: "9",  label: "Mint+",    frontMaxDev: 10, backMaxDev: 15 },
      { grade: "8",  label: "Mint",     frontMaxDev: 15, backMaxDev: 20 },
      { grade: "7",  label: "NM+",      frontMaxDev: 20, backMaxDev: 25 },
    ],
  },
  {
    name: "CGC",
    color: "#F59E0B",
    grades: [
      { grade: "10",  label: "Pristine",  frontMaxDev: 5,  backMaxDev: 5  },
      { grade: "9.5", label: "Gem Mint+", frontMaxDev: 10, backMaxDev: 10 },
      { grade: "9",   label: "Mint",      frontMaxDev: 15, backMaxDev: 15 },
      { grade: "8.5", label: "NM-MT+",    frontMaxDev: 20, backMaxDev: 20 },
    ],
  },
  {
    name: "TAG",
    color: "#EF4444",
    note: "TAG applies very strict centering thresholds",
    grades: [
      { grade: "10", label: "Perfect", frontMaxDev: 1,  backMaxDev: 1  },
      { grade: "9",  label: "Mint+",   frontMaxDev: 5,  backMaxDev: 5  },
      { grade: "8",  label: "Mint",    frontMaxDev: 10, backMaxDev: 10 },
      { grade: "7",  label: "NM+",     frontMaxDev: 15, backMaxDev: 15 },
    ],
  },
];

function toRatio(value: number): string {
  const v = Math.round(value);
  const worse = Math.max(v, 100 - v);
  const better = 100 - worse;
  return `${worse}/${better}`;
}

function deviation(value: number): number {
  return Math.abs(value - 50);
}

function axisColor(dev: number): string {
  if (dev <= 5) return "#10B981";
  if (dev <= 10) return "#F59E0B";
  if (dev <= 20) return "#F97316";
  return "#EF4444";
}

function qualifiesForGrade(m: CenteringMeasurement, g: GradeStandard): boolean {
  const frontDev = Math.max(deviation(m.frontLeftRight), deviation(m.frontTopBottom));
  const backDev  = Math.max(deviation(m.backLeftRight),  deviation(m.backTopBottom));
  return frontDev <= g.frontMaxDev && backDev <= g.backMaxDev;
}

function bestGrade(m: CenteringMeasurement, company: CompanyStandard): GradeStandard | null {
  for (const g of company.grades) {
    if (qualifiesForGrade(m, g)) return g;
  }
  return null;
}

function MetricPill({ label, value }: { label: string; value: number }) {
  const dev = deviation(value);
  const color = axisColor(dev);
  return (
    <View style={metricStyles.pill}>
      <Text style={metricStyles.pillLabel}>{label}</Text>
      <Text style={[metricStyles.pillValue, { color }]}>{toRatio(value)}</Text>
    </View>
  );
}

const metricStyles = StyleSheet.create({
  pill: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  pillLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pillValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
});

function CompanyCard({ company, centering }: { company: CompanyStandard; centering: CenteringMeasurement }) {
  const [expanded, setExpanded] = useState(false);
  const best = bestGrade(centering, company);

  return (
    <Pressable
      style={({ pressed }) => [styles.companyCard, { opacity: pressed ? 0.9 : 1 }]}
      onPress={() => setExpanded((v) => !v)}
    >
      <View style={styles.companyHeader}>
        <View style={[styles.companyPill, { backgroundColor: company.color + "20", borderColor: company.color + "50" }]}>
          <Text style={[styles.companyName, { color: company.color }]}>{company.name}</Text>
        </View>
        <View style={styles.companyResult}>
          {best ? (
            <>
              <View style={styles.qualifyBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                <Text style={styles.qualifyText}>
                  Up to <Text style={styles.qualifyGrade}>{company.name} {best.grade}</Text> {best.label}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.failBadge}>
              <Ionicons name="close-circle" size={14} color="#EF4444" />
              <Text style={styles.failText}>Centering too wide</Text>
            </View>
          )}
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={Colors.textMuted}
        />
      </View>

      {expanded && (
        <View style={styles.gradeList}>
          {company.note && (
            <Text style={styles.companyNote}>{company.note}</Text>
          )}
          {company.grades.map((g) => {
            const pass = qualifiesForGrade(centering, g);
            return (
              <View key={g.grade} style={styles.gradeRow}>
                <Ionicons
                  name={pass ? "checkmark-circle" : "close-circle"}
                  size={16}
                  color={pass ? "#10B981" : Colors.surfaceBorder}
                />
                <Text style={[styles.gradeNum, pass ? styles.gradeNumPass : styles.gradeNumFail]}>
                  {company.name} {g.grade}
                </Text>
                <Text style={[styles.gradeLabel, pass ? styles.gradeLabelPass : styles.gradeLabelFail]}>
                  {g.label}
                </Text>
                <View style={{ flex: 1 }} />
                <Text style={styles.gradeThreshold}>
                  F:{g.frontMaxDev + 50}/{50 - g.frontMaxDev}
                  {"  "}
                  B:{g.backMaxDev + 50}/{50 - g.backMaxDev}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </Pressable>
  );
}

export default function CenteringReport({ centering, onReAdjust, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const frontLRDev = deviation(centering.frontLeftRight);
  const frontTBDev = deviation(centering.frontTopBottom);
  const backLRDev  = deviation(centering.backLeftRight);
  const backTBDev  = deviation(centering.backTopBottom);
  const worstDev   = Math.max(frontLRDev, frontTBDev, backLRDev, backTBDev);

  const overallColor = axisColor(worstDev);
  const overallLabel =
    worstDev <= 5  ? "Excellent" :
    worstDev <= 10 ? "Good" :
    worstDev <= 20 ? "Fair" :
    "Poor";

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable
          onPress={onReAdjust}
          hitSlop={10}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Centering Report</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View>
              <Text style={styles.summaryTitle}>Overall Centering</Text>
              <Text style={[styles.summaryLabel, { color: overallColor }]}>{overallLabel}</Text>
            </View>
            <View style={[styles.overallBadge, { backgroundColor: overallColor + "20", borderColor: overallColor + "50" }]}>
              <Text style={[styles.overallBadgeText, { color: overallColor }]}>{overallLabel}</Text>
            </View>
          </View>

          <View style={styles.metricsRow}>
            <MetricPill label="Front L/R" value={centering.frontLeftRight} />
            <MetricPill label="Front T/B" value={centering.frontTopBottom} />
          </View>
          <View style={styles.metricsRow}>
            <MetricPill label="Back L/R"  value={centering.backLeftRight} />
            <MetricPill label="Back T/B"  value={centering.backTopBottom} />
          </View>

          <Text style={styles.ratioHint}>
            Ratios show the split across the border. 50/50 is perfect — the closer to even, the better.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Grading Company Standards</Text>
        <Text style={styles.sectionSubtitle}>
          Based on community-reported guidelines. Tap a company to see the full breakdown.
        </Text>

        {STANDARDS.map((company) => (
          <CompanyCard key={company.name} company={company} centering={centering} />
        ))}

        <Text style={styles.disclaimer}>
          Centering is one factor in a card's grade. Surface, corners, and edges also affect the final result. These thresholds are community guidelines — graders use judgement.
        </Text>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={({ pressed }) => [styles.reAdjustBtn, { opacity: pressed ? 0.8 : 1 }]}
          onPress={onReAdjust}
        >
          <Ionicons name="resize-outline" size={18} color={Colors.text} />
          <Text style={styles.reAdjustText}>Re-adjust</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.doneBtn, { opacity: pressed ? 0.85 : 1 }]}
          onPress={onDone}
        >
          <Text style={styles.doneBtnText}>Done</Text>
        </Pressable>
      </View>
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: Colors.text,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 12,
  },

  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 16,
    gap: 12,
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  summaryLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
  },
  overallBadge: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  overallBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
  },
  ratioHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 16,
  },

  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
    marginTop: 4,
  },
  sectionSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: -6,
    lineHeight: 17,
  },

  companyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 14,
    gap: 0,
  },
  companyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  companyPill: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  companyName: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  companyResult: {
    flex: 1,
  },
  qualifyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  qualifyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    flexShrink: 1,
  },
  qualifyGrade: {
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  failBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  failText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#EF4444",
  },

  gradeList: {
    marginTop: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    paddingTop: 12,
  },
  companyNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: "italic",
    marginBottom: 4,
  },
  gradeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  gradeNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    width: 54,
  },
  gradeNumPass: { color: Colors.text },
  gradeNumFail: { color: Colors.textMuted },
  gradeLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  gradeLabelPass: { color: Colors.textSecondary },
  gradeLabelFail: { color: Colors.textMuted },
  gradeThreshold: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
  },

  disclaimer: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 16,
    textAlign: "center",
    paddingHorizontal: 8,
    marginTop: 4,
    marginBottom: 8,
  },

  bottomBar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    backgroundColor: Colors.background,
  },
  reAdjustBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  reAdjustText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  doneBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  doneBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#fff",
  },
});
