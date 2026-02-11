import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";
import CompanyLabel from "./CompanyLabel";

interface GradeCircleProps {
  grade: number;
  size?: number;
  color?: string;
  label?: string;
}

function getGradeColor(grade: number): string {
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
        <CompanyLabel company={label} fontSize={labelSize < 11 ? 11 : labelSize} fontFamily="Inter_500Medium" />
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
