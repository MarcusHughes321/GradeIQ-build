import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
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

export default function SubGradeRow({ label, grade, notes, color }: SubGradeRowProps) {
  const [expanded, setExpanded] = useState(false);

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
      <Pressable
        onPress={() => setExpanded(prev => !prev)}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <Text
          style={styles.notes}
          numberOfLines={expanded ? undefined : 2}
        >
          {notes}
        </Text>
      </Pressable>
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
