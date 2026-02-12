import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { DefectMarker, CardBounds } from "@/lib/types";
import Colors from "@/constants/colors";

const SEVERITY_COLORS: Record<string, string> = {
  minor: "#F59E0B",
  moderate: "#FB923C",
  major: "#EF4444",
};

const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  corner: "resize-outline",
  edge: "remove-outline",
  surface: "layers-outline",
};

interface DefectOverlayProps {
  defects: DefectMarker[];
  side: "front" | "back";
  cardBounds?: CardBounds | null;
}

function mapToImagePosition(
  defectX: number,
  defectY: number,
  bounds?: CardBounds | null
): { imgX: number; imgY: number } {
  if (!bounds) {
    return { imgX: defectX, imgY: defectY };
  }
  const cardLeft = bounds.leftPercent;
  const cardTop = bounds.topPercent;
  const cardWidth = bounds.rightPercent - bounds.leftPercent;
  const cardHeight = bounds.bottomPercent - bounds.topPercent;

  const imgX = cardLeft + (defectX / 100) * cardWidth;
  const imgY = cardTop + (defectY / 100) * cardHeight;

  return {
    imgX: Math.max(0, Math.min(100, imgX)),
    imgY: Math.max(0, Math.min(100, imgY)),
  };
}

function DefectPin({
  defect,
  onPress,
  isSelected,
  cardBounds,
}: {
  defect: DefectMarker;
  onPress: () => void;
  isSelected: boolean;
  cardBounds?: CardBounds | null;
}) {
  const color = SEVERITY_COLORS[defect.severity] || "#F59E0B";
  const { imgX, imgY } = mapToImagePosition(defect.x, defect.y, cardBounds);

  return (
    <View
      style={[
        styles.pinContainer,
        { left: `${imgX}%`, top: `${imgY}%` },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onPress}
        hitSlop={12}
        style={({ pressed }) => [
          styles.pin,
          { backgroundColor: color, opacity: pressed ? 0.8 : 1 },
          isSelected && styles.pinSelected,
        ]}
      >
        <View style={[styles.pinInner, { borderColor: color }]} />
      </Pressable>
      {isSelected && (
        <View style={[styles.tooltip, imgX > 60 ? styles.tooltipLeft : styles.tooltipRight]}>
          <View style={styles.tooltipHeader}>
            <Ionicons name={TYPE_ICONS[defect.type] || "alert-circle-outline"} size={12} color={color} />
            <Text style={[styles.tooltipType, { color }]}>
              {defect.type.charAt(0).toUpperCase() + defect.type.slice(1)}
            </Text>
            <View style={[styles.severityBadge, { backgroundColor: color + "22" }]}>
              <Text style={[styles.severityText, { color }]}>
                {defect.severity}
              </Text>
            </View>
          </View>
          <Text style={styles.tooltipDesc}>{defect.description}</Text>
        </View>
      )}
    </View>
  );
}

export default function DefectOverlay({ defects, side, cardBounds }: DefectOverlayProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const sideDefects = defects.filter((d) => d.side === side);

  if (sideDefects.length === 0) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {sideDefects.map((defect, index) => (
        <DefectPin
          key={`${defect.side}-${defect.x}-${defect.y}-${index}`}
          defect={defect}
          isSelected={selectedId === index}
          onPress={() => setSelectedId(selectedId === index ? null : index)}
          cardBounds={cardBounds}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  pinContainer: {
    position: "absolute",
    zIndex: 10,
    transform: [{ translateX: -8 }, { translateY: -8 }],
  },
  pin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  pinSelected: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#fff",
  },
  pinInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  tooltip: {
    position: "absolute",
    top: 24,
    width: 180,
    backgroundColor: "rgba(17,17,17,0.95)",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 100,
  },
  tooltipRight: {
    left: -4,
  },
  tooltipLeft: {
    right: -4,
  },
  tooltipHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  tooltipType: {
    fontSize: 11,
    fontWeight: "700",
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  severityText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  tooltipDesc: {
    fontSize: 11,
    color: "#ccc",
    lineHeight: 15,
  },
});
