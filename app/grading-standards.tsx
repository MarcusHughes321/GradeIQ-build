import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

type CompanyKey = "psa" | "bgs" | "ace" | "tag" | "cgc";

interface CompanySection {
  key: CompanyKey;
  name: string;
  color: string;
  icon: string;
  philosophy: string;
  gradingMethod: string;
  centeringSummary: string;
  defectApproach: string;
  strictestArea: string;
  gradeScale: string;
  keyThresholds: string[];
}

const COMPANIES: CompanySection[] = [
  {
    key: "psa",
    name: "PSA",
    color: "#1E56A0",
    icon: "shield",
    philosophy: "Weakest-Link System",
    gradingMethod: "PSA grades based on the weakest category. One bad area drags the entire overall grade down. This makes PSA typically the strictest on overall grade.",
    centeringSummary: "PSA 10 requires 55/45 or better on the front and 75/25 or better on the back (updated 2025 standard).",
    defectApproach: "PSA 10 allows zero defects. PSA 9 allows only ONE minor flaw in the entire card — not per category. A single visible scratch, whitening spot, or edge nick can drop a card from 10 to 9 or lower.",
    strictestArea: "Overall grade — because weakest-link means even one weak category pulls everything down.",
    gradeScale: "1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10 (no 9.5)",
    keyThresholds: [
      "10: Zero defects. Perfectly sharp corners, edges, surface, and centering.",
      "9: ONE minor flaw in the entire card (slight wax stain, printing imperfection, or slightly off-white borders).",
      "8: Slight fraying at 1-2 corners, or very slight wax stain, or minor printing imperfection.",
      "7: Slight fraying on some corners, minimal edge wear, slight surface wear. Most gloss retained.",
    ],
  },
  {
    key: "bgs",
    name: "Beckett (BGS)",
    color: "#C0C0C0",
    icon: "layers",
    philosophy: "Weighted Averaging System",
    gradingMethod: "BGS averages the four sub-grades (centering, corners, edges, surface) but the lowest sub-grade heavily caps the overall. This means BGS can legitimately be 0.5-1.5 higher than PSA for the same card when one category is weak but others are strong.",
    centeringSummary: "BGS 10 requires 50/50 on front and back. BGS 9.5 allows 55/45 front and 60/40 back.",
    defectApproach: "BGS provides numeric sub-grades in 0.5 increments. Each category is graded independently. A card with Corners 8 but Edges 9.5, Surface 9.5, Centering 9.5 could still achieve an overall 9 — whereas PSA would likely give it an 8.",
    strictestArea: "Surface sub-grade — BGS 10 surface requires zero scratches, zero print spots, zero metallic print lines, flawless colour, and perfect gloss.",
    gradeScale: "0.5 increments from 1 to 10 (e.g., 7, 7.5, 8, 8.5, 9, 9.5, 10). Gold Label = three 10s + one 9.5 minimum.",
    keyThresholds: [
      "10 (Pristine): Virtually flawless in every category. Extremely rare.",
      "9.5 (Gem Mint): Near-perfect. Very minor imperfection under magnification only.",
      "9 (Mint): Sharp corners, clean surface, 1-2 tiny imperfections visible under close examination.",
      "8.5 (NM-MT+): Very minor wear on 2-3 corners. Few noticeable print spots.",
    ],
  },
  {
    key: "ace",
    name: "Ace Grading",
    color: "#FFD700",
    icon: "ribbon",
    philosophy: "Whole Numbers Only, Strict Capping",
    gradingMethod: "Ace uses whole numbers only (no half grades like 8.5 or 9.5). The overall grade can never be more than 1 above the lowest sub-grade. A card that BGS would give 8.5 gets Ace 8 — Ace effectively rounds down.",
    centeringSummary: "Ace 10 requires centering within 60/40 on front and back. For a card to receive an overall Ace 10, centering MUST be a 10.",
    defectApproach: "Ace 10 requires an additional rule: centering must be 10, at least 2 other sub-grades must be 10, and only ONE 9 is allowed. This makes Ace 10 harder to achieve than most companies.",
    strictestArea: "Overall 10 — the Ace 10 rule (mandatory centering 10, max one 9 elsewhere) makes their top grade particularly strict.",
    gradeScale: "Whole numbers only: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.",
    keyThresholds: [
      "10: Sharp corners, sharp edges, beautiful surface. Centering must be 10. Max one 9 in other sub-grades.",
      "9: Nearly identical to 10. May have ONE minor imperfection in one category.",
      "8: Few minor imperfections such as slight whitening across corners, edges, or surface.",
      "7: More noticeable damage. Visible whitening on corners/edges. Perceptible printing defects.",
    ],
  },
  {
    key: "tag",
    name: "TAG Grading",
    color: "#FFFFFF",
    icon: "scan",
    philosophy: "AI-Automated, Strictest on Surface",
    gradingMethod: "TAG uses automated high-resolution imaging and a 1000-point composite score. They focus on \"DINGS\" (Defects Identified of Notable Grade Significance) — defects that meaningfully affect the grade. TAG does not use 9.5 grades.",
    centeringSummary: "TAG Pristine 10 requires 51/49 front centering. TAG Gem Mint 10 allows 60/40 front (same threshold as BGS 9 centering).",
    defectApproach: "TAG's Pristine 10 allows only \"Non-Human Observable Defects\" (NHODs) — flaws so tiny that only high-resolution imaging can detect them. Their automated system catches every surface flaw, making them the strictest company on surface condition.",
    strictestArea: "Surface — TAG is the strictest of all five companies on surface defects. A surface scratch that PSA or BGS might grade 8 could be a TAG 7-7.5. Their automated imaging catches everything.",
    gradeScale: "0.5 increments: 7, 7.5, 8, 8.5, 9, 10, Pristine 10. No 9.5 grade exists.",
    keyThresholds: [
      "Pristine 10: Only Non-Human Observable Defects allowed. Virtually flawless.",
      "Gem Mint 10: Very minor defects under high-res imaging. 4 sharp corners with minor artifacts. Tiny pit or light scratch not penetrating gloss.",
      "9: Sharp corners, minor edge fill/fray under hi-res. Light scratches on front (no gloss penetration). Back can have small scratch penetrating gloss.",
      "8.5: Multiple light front corner touches. Deeper pits, scratches penetrating gloss on back, print lines.",
    ],
  },
  {
    key: "cgc",
    name: "CGC Cards",
    color: "#E63946",
    icon: "eye",
    philosophy: "Strict on Whitening & Silvering",
    gradingMethod: "CGC evaluates all four categories and gives a single overall grade with optional sub-grades. They assess holistically rather than using a strict weakest-link approach, making their system closer to BGS in methodology.",
    centeringSummary: "CGC Pristine 10 requires 50/50 centering. CGC Gem Mint 10 allows 55/45 front and 60/40 back.",
    defectApproach: "CGC is notably strict on whitening and silvering on coloured borders — even tiny whitening on blue or coloured borders can drop a card from 10 to 9. They are also strict on holo/foil surface scratches.",
    strictestArea: "Whitening on coloured borders and holo scratches — CGC's hallmark strictness. A card with minor border whitening that PSA might give 9 could get CGC 8.5.",
    gradeScale: "0.5 increments from 1 to 10 (e.g., 7, 7.5, 8, 8.5, 9, 9.5, 10). Pristine 10 is the highest label.",
    keyThresholds: [
      "Pristine 10: Virtually flawless. No defects visible under 5x magnification.",
      "Gem Mint 10: Free of wear and white spots on corners/edges. Perfect gloss, no print spots.",
      "9.5 (Mint+): Very minor imperfections only. Slight printing defects or very minor white spots.",
      "9 (Mint): ONE small imperfection — slight minor wear on edges/corners, or very minor surface scratches.",
    ],
  },
];

export default function GradingStandardsScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const [expanded, setExpanded] = useState<CompanyKey | null>(null);

  const toggleExpand = (key: CompanyKey) => {
    setExpanded(prev => prev === key ? null : key);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Grading Standards</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + webBottomInset + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.disclaimerCard}>
          <View style={styles.disclaimerHeader}>
            <Ionicons name="information-circle" size={22} color={Colors.warning} />
            <Text style={styles.disclaimerTitle}>Important Notice</Text>
          </View>
          <Text style={styles.disclaimerBody}>
            Grade.IQ is not affiliated with, endorsed by, or partnered with any grading company. Our grading estimates are built from our own analysis of publicly available grading standards and documentation.
          </Text>
          <Text style={[styles.disclaimerBody, { marginTop: 8 }]}>
            These estimates should not be treated as official grades. Real-world results may differ — professional graders use equipment and expertise that AI cannot fully replicate. Use Grade.IQ as a helpful guide, not a guarantee.
          </Text>
        </View>

        <View style={styles.howCard}>
          <View style={styles.howHeader}>
            <View style={styles.howIcon}>
              <Ionicons name="construct" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.howTitle}>How We Built Our Standards</Text>
          </View>
          <Text style={styles.howBody}>
            We studied each company's published grading criteria, official documentation, and community knowledge to build our AI grading model. Our approach:
          </Text>
          <View style={styles.howList}>
            <HowItem text="Analysed official grading scales, centering tolerances, and defect descriptions from each company" />
            <HowItem text="Mapped each company's unique philosophy — from PSA's weakest-link approach to BGS's averaging system" />
            <HowItem text="Calibrated defect tolerances per company so grades reflect their real-world strictness differences" />
            <HowItem text="Continuously refined based on user feedback and community-submitted real grade comparisons" />
          </View>
        </View>

        <Text style={styles.sectionLabel}>Company Breakdowns</Text>

        {COMPANIES.map((company) => {
          const isExpanded = expanded === company.key;
          return (
            <View key={company.key} style={styles.companyCard}>
              <Pressable
                onPress={() => toggleExpand(company.key)}
                style={({ pressed }) => [styles.companyHeader, { opacity: pressed ? 0.85 : 1 }]}
              >
                <View style={styles.companyHeaderLeft}>
                  <View style={[styles.companyIcon, { backgroundColor: company.color + "20" }]}>
                    <Ionicons name={company.icon as any} size={18} color={company.color} />
                  </View>
                  <View style={styles.companyHeaderText}>
                    <Text style={styles.companyName}>{company.name}</Text>
                    <Text style={styles.companyPhilosophy}>{company.philosophy}</Text>
                  </View>
                </View>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={Colors.textMuted}
                />
              </Pressable>

              {isExpanded && (
                <View style={styles.companyDetails}>
                  <DetailRow label="How They Grade" value={company.gradingMethod} color={company.color} />
                  <DetailRow label="Centering" value={company.centeringSummary} color={company.color} />
                  <DetailRow label="Defect Tolerance" value={company.defectApproach} color={company.color} />
                  <DetailRow label="Strictest Area" value={company.strictestArea} color={company.color} />
                  <DetailRow label="Grade Scale" value={company.gradeScale} color={company.color} />

                  <View style={styles.thresholdSection}>
                    <Text style={[styles.thresholdTitle, { color: company.color }]}>Key Grade Thresholds</Text>
                    {company.keyThresholds.map((t, i) => (
                      <View key={i} style={styles.thresholdRow}>
                        <View style={[styles.thresholdDot, { backgroundColor: company.color }]} />
                        <Text style={styles.thresholdText}>{t}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          );
        })}

        <View style={styles.comparisonCard}>
          <View style={styles.comparisonHeader}>
            <Ionicons name="git-compare" size={20} color="#60A5FA" />
            <Text style={styles.comparisonTitle}>How Companies Compare</Text>
          </View>
          <View style={styles.comparisonList}>
            <ComparisonRow label="Strictest Overall" value="PSA (weakest-link drags grade down)" />
            <ComparisonRow label="Most Lenient Overall" value="BGS (averaging allows higher overalls)" />
            <ComparisonRow label="Strictest on Surface" value="TAG (automated imaging catches everything)" />
            <ComparisonRow label="Strictest on Whitening" value="CGC (even tiny border whitening penalised)" />
            <ComparisonRow label="Hardest to Get 10" value="Ace (centering must be 10, max one 9 elsewhere)" />
            <ComparisonRow label="No Half Grades" value="Ace (whole numbers only) and TAG (no 9.5)" />
          </View>
        </View>

        <Text style={styles.footer}>
          Our standards are regularly reviewed and updated based on the latest publicly available company documentation and community feedback.
        </Text>
      </ScrollView>
    </View>
  );
}

function HowItem({ text }: { text: string }) {
  return (
    <View style={styles.howRow}>
      <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
      <Text style={styles.howItemText}>{text}</Text>
    </View>
  );
}

function DetailRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color }]}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function ComparisonRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.comparisonRow}>
      <Text style={styles.comparisonLabel}>{label}</Text>
      <Text style={styles.comparisonValue}>{value}</Text>
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
  },
  disclaimerCard: {
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
  },
  disclaimerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  disclaimerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.warning,
  },
  disclaimerBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  howCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  howHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  howIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255, 60, 49, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  howTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
    flex: 1,
  },
  howBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  howList: {
    gap: 10,
  },
  howRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  howItemText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
    flex: 1,
  },
  sectionLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
    marginTop: 8,
    marginBottom: 14,
  },
  companyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: "hidden",
  },
  companyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  companyHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  companyIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  companyHeaderText: {
    flex: 1,
    gap: 2,
  },
  companyName: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
  },
  companyPhilosophy: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  companyDetails: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    paddingTop: 14,
  },
  detailRow: {
    gap: 4,
  },
  detailLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  detailValue: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  thresholdSection: {
    marginTop: 4,
    gap: 8,
  },
  thresholdTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  thresholdRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  thresholdDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  thresholdText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
    flex: 1,
  },
  comparisonCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    marginTop: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  comparisonHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  comparisonTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  comparisonList: {
    gap: 12,
  },
  comparisonRow: {
    gap: 3,
  },
  comparisonLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  comparisonValue: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  footer: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
});
