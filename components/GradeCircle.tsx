import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

interface GradeCircleProps {
  grade: number;
  size?: number;
  color?: string;
  label?: string;
}

function getGradeColor(grade: number): string {
  if (grade >= 9.5) return "#10B981";
  if (grade >= 9) return "#34D399";
  if (grade >= 8) return Colors.accent;
  if (grade >= 7) return Colors.warning;
  if (grade >= 5) return "#F97316";
  return Colors.error;
}

export default function GradeCircle({ grade, size = 80, color, label }: GradeCircleProps) {
  const gradeColor = color || getGradeColor(grade);
  const fontSize = size * 0.35;
  const labelSize = size * 0.14;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: gradeColor,
          },
        ]}
      >
        <Text
          style={[
            styles.grade,
            {
              fontSize,
              color: gradeColor,
            },
          ]}
        >
          {grade % 1 === 0 ? grade.toString() : grade.toFixed(1)}
        </Text>
      </View>
      {label && (
        <Text style={[styles.label, { fontSize: labelSize < 11 ? 11 : labelSize }]}>{label}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 6,
  },
  circle: {
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  grade: {
    fontFamily: "Inter_700Bold",
  },
  label: {
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
});
