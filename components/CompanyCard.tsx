import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import GradeCircle from "./GradeCircle";
import SubGradeRow from "./SubGradeRow";
import CompanyLabel from "./CompanyLabel";
import type { PSAGrade, BeckettGrade, AceGrade, TAGGrade, CGCGrade } from "@/lib/types";

const COMPANY_LABELS: Record<string, string> = {
  PSA: "PSA",
  Beckett: "BGS",
  Ace: "ACE",
  TAG: "TAG",
  CGC: "CGC",
};

function getGradientColor(grade: number): string {
  const ratio = Math.max(0, Math.min(1, (grade - 1) / 9));
  if (ratio <= 0.5) {
    const t = ratio * 2;
    const r = Math.round(239 + (245 - 239) * t);
    const g = Math.round(68 + (158 - 68) * t);
    const b = Math.round(68 + (11 - 68) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
  const t = (ratio - 0.5) * 2;
  const r = Math.round(245 + (16 - 245) * t);
  const g = Math.round(158 + (185 - 158) * t);
  const b = Math.round(11 + (129 - 11) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function formatGrade(g: number): string {
  return g % 1 === 0 ? g.toString() : g.toFixed(1);
}

interface CompanyCardProps {
  company: "PSA" | "Beckett" | "Ace" | "TAG" | "CGC";
  grade: PSAGrade | BeckettGrade | AceGrade | TAGGrade | CGCGrade;
  color: string;
  defaultExpanded?: boolean;
}

interface SubGradeInfo {
  label: string;
  grade: number;
  notes: string;
}

function getSubGrades(company: string, grade: PSAGrade | BeckettGrade | AceGrade | TAGGrade | CGCGrade): SubGradeInfo[] {
  if (company === "PSA") {
    const psa = grade as PSAGrade;
    const overall = psa.grade;
    return [
      { label: "Centering", grade: psa.centeringGrade ?? overall, notes: psa.centering },
      { label: "Corners", grade: overall, notes: psa.corners },
      { label: "Edges", grade: overall, notes: psa.edges },
      { label: "Surface", grade: overall, notes: psa.surface },
    ];
  }
  if (company === "CGC") {
    const cgc = grade as CGCGrade;
    const overall = cgc.grade;
    return [
      { label: "Centering", grade: (cgc as any).centeringGrade ?? overall, notes: cgc.centering },
      { label: "Corners", grade: overall, notes: cgc.corners },
      { label: "Edges", grade: overall, notes: cgc.edges },
      { label: "Surface", grade: overall, notes: cgc.surface },
    ];
  }
  const sub = grade as BeckettGrade | AceGrade | TAGGrade;
  return [
    { label: "Centering", grade: sub.centering.grade, notes: sub.centering.notes },
    { label: "Corners", grade: sub.corners.grade, notes: sub.corners.notes },
    { label: "Edges", grade: sub.edges.grade, notes: sub.edges.notes },
    { label: "Surface", grade: sub.surface.grade, notes: sub.surface.notes },
  ];
}

export default function CompanyCard({ company, grade, color, defaultExpanded = false }: CompanyCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isPSA = company === "PSA";
  const isCGC = company === "CGC";
  const overallGrade = isPSA ? (grade as PSAGrade).grade : isCGC ? (grade as CGCGrade).grade : (grade as BeckettGrade | AceGrade | TAGGrade).overallGrade;
  const subGrades = getSubGrades(company, grade);

  return (
    <View style={[styles.card, { borderColor: color + "20" }]}>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={({ pressed }) => [styles.headerRow, { opacity: pressed ? 0.85 : 1 }]}
      >
        <View style={styles.companyInfo}>
          <View style={styles.companyTextWrap}>
            <CompanyLabel company={COMPANY_LABELS[company]} fontSize={18} />
            {!expanded && (
              <View style={styles.miniSubGrades}>
                {subGrades.map((sg) => (
                  <View key={sg.label} style={styles.miniSubGradeItem}>
                    <View style={[styles.miniDot, { backgroundColor: getGradientColor(sg.grade) }]} />
                    <Text style={styles.miniLabel}>{sg.label.substring(0, 3)}</Text>
                    <Text style={[styles.miniValue, { color: getGradientColor(sg.grade) }]}>{formatGrade(sg.grade)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
        <View style={styles.headerRight}>
          <GradeCircle grade={overallGrade} size={46} />
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={Colors.textMuted}
            style={styles.chevron}
          />
        </View>
      </Pressable>

      {expanded && (
        <>
          <View style={styles.divider} />
          <View style={styles.subGrades}>
            {subGrades.map((sg) => (
              <SubGradeRow key={sg.label} label={sg.label} grade={sg.grade} notes={sg.notes} color={color} />
            ))}
          </View>
          {grade.notes ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.notes}>{grade.notes}</Text>
            </>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  companyInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  companyTextWrap: {
    flex: 1,
    gap: 6,
  },
  companyName: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  miniSubGrades: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  miniSubGradeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  miniDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  miniLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
  },
  miniValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  chevron: {
    marginLeft: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: 12,
  },
  subGrades: {
    gap: 2,
  },
  notes: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
  },
});
