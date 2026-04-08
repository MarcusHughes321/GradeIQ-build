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
  containerSize?: { width: number; height: number };
  naturalImageSize?: { w: number; h: number } | null;
}

function mapToContainerPosition(
  defectX: number,
  defectY: number,
  bounds?: CardBounds | null,
  containerSize?: { width: number; height: number },
  naturalImageSize?: { w: number; h: number } | null
): { left: number; top: number } {
  // Step 1: card-relative (0-100) → image-relative (0-100)
  let imageRelX = defectX;
  let imageRelY = defectY;
  if (bounds) {
    const cardLeft = bounds.leftPercent;
    const cardTop = bounds.topPercent;
    const cardWidth = bounds.rightPercent - bounds.leftPercent;
    const cardHeight = bounds.bottomPercent - bounds.topPercent;
    imageRelX = cardLeft + (defectX / 100) * cardWidth;
    imageRelY = cardTop + (defectY / 100) * cardHeight;
  }

  // Step 2: account for contentFit="contain" letterboxing
  if (
    containerSize && containerSize.width > 0 && containerSize.height > 0 &&
    naturalImageSize && naturalImageSize.w > 0 && naturalImageSize.h > 0
  ) {
    const { width: cw, height: ch } = containerSize;
    const { w: nw, h: nh } = naturalImageSize;
    const scale = Math.min(cw / nw, ch / nh);
    const renderedW = nw * scale;
    const renderedH = nh * scale;
    const offsetX = (cw - renderedW) / 2;
    const offsetY = (ch - renderedH) / 2;

    const pxX = offsetX + (imageRelX / 100) * renderedW;
    const pxY = offsetY + (imageRelY / 100) * renderedH;

    return {
      left: Math.max(0, Math.min(100, (pxX / cw) * 100)),
      top: Math.max(0, Math.min(100, (pxY / ch) * 100)),
    };
  }

  return {
    left: Math.max(0, Math.min(100, imageRelX)),
    top: Math.max(0, Math.min(100, imageRelY)),
  };
}

function DefectPin({
  defect,
  onPress,
  isSelected,
  cardBounds,
  containerSize,
  naturalImageSize,
}: {
  defect: DefectMarker;
  onPress: () => void;
  isSelected: boolean;
  cardBounds?: CardBounds | null;
  containerSize?: { width: number; height: number };
  naturalImageSize?: { w: number; h: number } | null;
}) {
  const color = SEVERITY_COLORS[defect.severity] || "#F59E0B";
  const { left, top } = mapToContainerPosition(
    defect.x, defect.y, cardBounds, containerSize, naturalImageSize
  );

  return (
    <View
      style={[styles.pinContainer, { left: `${left}%`, top: `${top}%` }]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onPress}
        hitSlop={12}
        style={({ pressed }) => [
          styles.pin,
          { borderColor: color, opacity: pressed ? 0.8 : 1 },
          isSelected && styles.pinSelected,
        ]}
      >
        <View style={styles.crossH} />
        <View style={styles.crossV} />
      </Pressable>
      {isSelected && (
        <View style={[styles.tooltip, left > 60 ? styles.tooltipLeft : styles.tooltipRight]}>
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

export default function DefectOverlay({
  defects, side, cardBounds, containerSize, naturalImageSize,
}: DefectOverlayProps) {
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
          containerSize={containerSize}
          naturalImageSize={naturalImageSize}
        />
      ))}
    </View>
  );
}

const PIN_SIZE = 20;
const CROSS_THICK = 2;
const CROSS_LEN = 8;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  pinContainer: {
    position: "absolute",
    zIndex: 10,
    transform: [{ translateX: -(PIN_SIZE / 2) }, { translateY: -(PIN_SIZE / 2) }],
  },
  pin: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    borderWidth: 2,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
    elevation: 5,
  },
  pinSelected: {
    borderWidth: 2.5,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  crossH: {
    position: "absolute",
    width: CROSS_LEN * 2,
    height: CROSS_THICK,
    backgroundColor: "#fff",
    borderRadius: 1,
  },
  crossV: {
    position: "absolute",
    width: CROSS_THICK,
    height: CROSS_LEN * 2,
    backgroundColor: "#fff",
    borderRadius: 1,
  },
  tooltip: {
    position: "absolute",
    top: PIN_SIZE + 4,
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
