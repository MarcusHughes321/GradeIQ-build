import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

interface SubGradeRowProps {
  label: string;
  grade: number;
  notes: string;
  color: string;
}

function getBarWidth(grade: number): `${number}%` {
  return `${(grade / 10) * 100}%` as `${number}%`;
}

function getBarColor(grade: number): string {
  if (grade >= 9.5) return "#10B981";
  if (grade >= 9) return "#34D399";
  if (grade >= 8) return "#FFB703";
  if (grade >= 7) return "#F59E0B";
  if (grade >= 5) return "#F97316";
  return "#EF4444";
}

export default function SubGradeRow({ label, grade, notes, color }: SubGradeRowProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.grade, { color: getBarColor(grade) }]}>
          {grade % 1 === 0 ? grade.toString() : grade.toFixed(1)}
        </Text>
      </View>
      <View style={styles.barBackground}>
        <View
          style={[
            styles.barFill,
            {
              width: getBarWidth(grade),
              backgroundColor: getBarColor(grade),
            },
          ]}
        />
      </View>
      <Text style={styles.notes} numberOfLines={2}>{notes}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 3,
    paddingVertical: 6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  grade: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  barBackground: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.surfaceBorder,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 1.5,
  },
  notes: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 15,
  },
});
