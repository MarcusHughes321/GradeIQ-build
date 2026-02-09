import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";
import GradeCircle from "./GradeCircle";
import SubGradeRow from "./SubGradeRow";
import type { PSAGrade, BeckettGrade, AceGrade } from "@/lib/types";

interface CompanyCardProps {
  company: "PSA" | "Beckett" | "Ace";
  grade: PSAGrade | BeckettGrade | AceGrade;
  color: string;
}

export default function CompanyCard({ company, grade, color }: CompanyCardProps) {
  const isPSA = company === "PSA";
  const psaGrade = grade as PSAGrade;
  const subGrade = grade as BeckettGrade | AceGrade;

  const overallGrade = isPSA ? psaGrade.grade : subGrade.overallGrade;

  return (
    <View style={[styles.card, { borderColor: color + "30" }]}>
      <View style={styles.headerRow}>
        <View style={styles.companyBadge}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={[styles.companyName, { color }]}>{company}</Text>
        </View>
        <GradeCircle grade={overallGrade} size={56} color={color} />
      </View>

      <View style={styles.divider} />

      {isPSA ? (
        <View style={styles.subGrades}>
          <SubGradeRow label="Centering" grade={overallGrade} notes={psaGrade.centering} color={color} />
          <SubGradeRow label="Corners" grade={overallGrade} notes={psaGrade.corners} color={color} />
          <SubGradeRow label="Edges" grade={overallGrade} notes={psaGrade.edges} color={color} />
          <SubGradeRow label="Surface" grade={overallGrade} notes={psaGrade.surface} color={color} />
        </View>
      ) : (
        <View style={styles.subGrades}>
          <SubGradeRow label="Centering" grade={subGrade.centering.grade} notes={subGrade.centering.notes} color={color} />
          <SubGradeRow label="Corners" grade={subGrade.corners.grade} notes={subGrade.corners.notes} color={color} />
          <SubGradeRow label="Edges" grade={subGrade.edges.grade} notes={subGrade.edges.notes} color={color} />
          <SubGradeRow label="Surface" grade={subGrade.surface.grade} notes={subGrade.surface.notes} color={color} />
        </View>
      )}

      {grade.notes && (
        <>
          <View style={styles.divider} />
          <Text style={styles.notes}>{grade.notes}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  companyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  companyName: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: 16,
  },
  subGrades: {
    gap: 4,
  },
  notes: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
  },
});
