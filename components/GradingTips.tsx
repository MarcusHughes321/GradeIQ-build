import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface GradingTipsProps {
  centeringGrade: number;
  cornersGrade: number;
  edgesGrade: number;
  surfaceGrade: number;
}

function getGradientColor(grade: number, maxGrade: number = 10): string {
  const ratio = Math.max(0, Math.min(1, (grade - 1) / (maxGrade - 1)));
  if (ratio <= 0.5) {
    const t = ratio * 2;
    const r = Math.round(239 + (245 - 239) * t);
    const g = Math.round(68 + (158 - 68) * t);
    const b = Math.round(68 + (11 - 68) * t);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const t = (ratio - 0.5) * 2;
    const r = Math.round(245 + (16 - 245) * t);
    const g = Math.round(158 + (185 - 158) * t);
    const b = Math.round(11 + (129 - 11) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function getTip(area: string, grade: number): string {
  if (area === "Centering") {
    if (grade < 8) return "Centering issues are factory defects from the cutting process and cannot be fixed. Consider this when deciding whether professional grading is worthwhile for this card.";
    if (grade <= 9) return "Your centering is slightly off but still within acceptable range for most graders. This is caused during the manufacturing cut process and can't be corrected.";
    return "Your centering is very good with only a slight offset. This is minor and shouldn't significantly impact your overall grade.";
  }
  if (area === "Corners") {
    if (grade < 8) return "Corner wear is clearly visible on this card. Store it in a penny sleeve and toploader immediately to prevent further damage. Avoid handling without clean, dry hands.";
    if (grade <= 9) return "Some corner whitening is visible. This commonly occurs from cards rubbing against each other in binders or from being shuffled. A penny sleeve inside a toploader will prevent further wear.";
    return "Very minor corner wear detected. This is common even on well-kept cards and typically only visible under close inspection.";
  }
  if (area === "Edges") {
    if (grade < 8) return "Edge wear is noticeable on this card. This often happens from cards sliding against each other in storage. Use individual sleeves to prevent further damage.";
    if (grade <= 9) return "Minor edge whitening detected, likely from friction during storage or handling. Keep cards individually sleeved to protect edges.";
    return "Very faint edge wear detected. This level of wear is minimal and common on most raw cards.";
  }
  if (grade < 8) return "Surface imperfections are visible. Avoid touching the card face directly and store away from direct sunlight to prevent further degradation. Scratches on holographic cards are especially impactful.";
  if (grade <= 9) return "Minor surface marks detected. Handle cards by their edges, not the face. Store in a cool, dry place away from sunlight to maintain surface quality.";
  return "Very light surface marks detected. This is common and usually only visible under certain lighting conditions.";
}

export default function GradingTips({ centeringGrade, cornersGrade, edgesGrade, surfaceGrade }: GradingTipsProps) {
  const [expanded, setExpanded] = useState(true);

  const areas: { name: string; grade: number }[] = [
    { name: "Centering", grade: centeringGrade },
    { name: "Corners", grade: cornersGrade },
    { name: "Edges", grade: edgesGrade },
    { name: "Surface", grade: surfaceGrade },
  ];

  const weakAreas = areas
    .filter((a) => a.grade < 9.5)
    .sort((a, b) => a.grade - b.grade);

  const allExcellent = weakAreas.length === 0;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={({ pressed }) => [styles.header, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={styles.headerLeft}>
          <Ionicons name="bulb-outline" size={16} color="#A0A0A0" />
          <Text style={styles.headerTitle}>Grading Tips</Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color="#666666"
        />
      </Pressable>

      {expanded && (
        <View style={styles.content}>
          {allExcellent ? (
            <Text style={styles.congratsText}>
              Your card is in excellent condition! Keep it protected in a penny sleeve and toploader.
            </Text>
          ) : (
            weakAreas.map((area) => (
              <View key={area.name} style={styles.tipSection}>
                <View style={styles.tipHeader}>
                  <Text style={styles.areaName}>{area.name}</Text>
                  <Text style={[styles.areaGrade, { color: getGradientColor(area.grade) }]}>
                    {area.grade}
                  </Text>
                </View>
                <Text style={styles.tipText}>{getTip(area.name, area.grade)}</Text>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#111111",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#FFFFFF",
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  congratsText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#A0A0A0",
    lineHeight: 20,
  },
  tipSection: {
    gap: 4,
  },
  tipHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  areaName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#FFFFFF",
  },
  areaGrade: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  tipText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#A0A0A0",
    lineHeight: 20,
  },
});
