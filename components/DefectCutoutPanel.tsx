import React, { useEffect, useState } from "react";
import { View, Text, Image, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { DefectMarker, CardBounds } from "@/lib/types";
import Colors from "@/constants/colors";

const TILE = 96;
const ZOOM = 3.5;

const SEVERITY_COLOR: Record<string, string> = {
  minor: "#F59E0B",
  moderate: "#FB923C",
  major: "#EF4444",
};

const SEVERITY_LABEL: Record<string, string> = {
  minor: "Minor",
  moderate: "Moderate",
  major: "Major",
};

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  corner: "resize-outline",
  edge: "remove-outline",
  surface: "layers-outline",
};

function mapToImagePosition(
  x: number,
  y: number,
  bounds?: CardBounds | null
): { imgX: number; imgY: number } {
  if (!bounds) return { imgX: x, imgY: y };
  const cardLeft = bounds.leftPercent;
  const cardTop = bounds.topPercent;
  const cardWidth = bounds.rightPercent - bounds.leftPercent;
  const cardHeight = bounds.bottomPercent - bounds.topPercent;
  return {
    imgX: Math.max(0, Math.min(100, cardLeft + (x / 100) * cardWidth)),
    imgY: Math.max(0, Math.min(100, cardTop + (y / 100) * cardHeight)),
  };
}

interface DefectTileProps {
  defect: DefectMarker;
  imageUri: string;
  imgWidth: number;
  imgHeight: number;
  cardBounds?: CardBounds | null;
}

function DefectTile({ defect, imageUri, imgWidth, imgHeight, cardBounds }: DefectTileProps) {
  const color = SEVERITY_COLOR[defect.severity] || "#F59E0B";
  const { imgX, imgY } = mapToImagePosition(defect.x, defect.y, cardBounds);

  const scaledW = TILE * ZOOM;
  const scaledH = imgWidth > 0 ? scaledW * (imgHeight / imgWidth) : scaledW * 1.4;

  const rawLeft = -(imgX / 100) * scaledW + TILE / 2;
  const rawTop = -(imgY / 100) * scaledH + TILE / 2;

  const clampedLeft = Math.max(-(scaledW - TILE), Math.min(0, rawLeft));
  const clampedTop = Math.max(-(scaledH - TILE), Math.min(0, rawTop));

  return (
    <View style={styles.tile}>
      <View style={[styles.tileImageWrap, { borderColor: color + "CC" }]}>
        {imgWidth > 0 ? (
          <Image
            source={{ uri: imageUri }}
            style={[
              styles.tileImage,
              { width: scaledW, height: scaledH, left: clampedLeft, top: clampedTop },
            ]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.tilePlaceholder, { backgroundColor: Colors.surface }]} />
        )}

        <View style={[styles.tileTypeBadge, { backgroundColor: color }]}>
          <Ionicons name={TYPE_ICON[defect.type] || "alert-circle-outline"} size={9} color="#fff" />
        </View>

        <View style={styles.tileSideBadge}>
          <Text style={styles.tileSideTxt}>{defect.side === "front" ? "F" : "B"}</Text>
        </View>

        <View style={styles.crosshairWrap} pointerEvents="none">
          <View style={[styles.crosshairRing, { borderColor: color }]} />
          <View style={[styles.crosshairDot, { backgroundColor: color }]} />
        </View>
      </View>

      <View style={styles.tileLabel}>
        <Text style={[styles.tileSeverity, { color }]}>{SEVERITY_LABEL[defect.severity]}</Text>
        <Text style={styles.tileType}>
          {defect.type.charAt(0).toUpperCase() + defect.type.slice(1)}
        </Text>
        <Text style={styles.tileDesc} numberOfLines={2}>
          {defect.description}
        </Text>
      </View>
    </View>
  );
}

interface Props {
  defects: DefectMarker[];
  frontImage: string;
  backImage: string;
  frontCardBounds?: CardBounds | null;
  backCardBounds?: CardBounds | null;
}

export default function DefectCutoutPanel({
  defects,
  frontImage,
  backImage,
  frontCardBounds,
  backCardBounds,
}: Props) {
  const [frontDims, setFrontDims] = useState<{ w: number; h: number } | null>(null);
  const [backDims, setBackDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    Image.getSize(frontImage, (w, h) => setFrontDims({ w, h }), () => setFrontDims({ w: 0, h: 0 }));
    Image.getSize(backImage, (w, h) => setBackDims({ w, h }), () => setBackDims({ w: 0, h: 0 }));
  }, [frontImage, backImage]);

  const majorCount = defects.filter(d => d.severity === "major").length;
  const moderateCount = defects.filter(d => d.severity === "moderate").length;

  const sorted = [...defects].sort((a, b) => {
    const order = { major: 0, moderate: 1, minor: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="scan-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.headerTitle}>Detected Flaws</Text>
        </View>
        <View style={styles.headerBadges}>
          {defects.length === 0 ? (
            <View style={styles.cleanBadge}>
              <Ionicons name="checkmark-circle" size={11} color="#22c55e" />
              <Text style={styles.cleanBadgeTxt}>Clean</Text>
            </View>
          ) : (
            <>
              {majorCount > 0 && (
                <View style={[styles.badge, styles.badgeMajor]}>
                  <Text style={[styles.badgeTxt, { color: "#EF4444" }]}>{majorCount} major</Text>
                </View>
              )}
              {moderateCount > 0 && (
                <View style={[styles.badge, styles.badgeModerate]}>
                  <Text style={[styles.badgeTxt, { color: "#FB923C" }]}>{moderateCount} mod</Text>
                </View>
              )}
              <View style={styles.badge}>
                <Text style={styles.badgeTxt}>{defects.length} total</Text>
              </View>
            </>
          )}
        </View>
      </View>

      {defects.length === 0 ? (
        <View style={styles.emptyRow}>
          <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
          <Text style={styles.emptyTxt}>No defects detected — clean card</Text>
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollRow}
          >
            {sorted.map((defect, i) => {
              const isFront = defect.side === "front";
              const dims = isFront ? frontDims : backDims;
              return (
                <DefectTile
                  key={`${defect.side}-${defect.x.toFixed(1)}-${defect.y.toFixed(1)}-${i}`}
                  defect={defect}
                  imageUri={isFront ? frontImage : backImage}
                  imgWidth={dims?.w ?? 0}
                  imgHeight={dims?.h ?? 0}
                  cardBounds={isFront ? frontCardBounds : backCardBounds}
                />
              );
            })}
          </ScrollView>
          <Text style={styles.footnote}>
            AI-identified areas · sorted by severity
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingTop: 14,
    paddingBottom: 14,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  headerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  headerBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  badge: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeMajor: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
  },
  badgeModerate: {
    backgroundColor: "rgba(251,146,60,0.12)",
    borderWidth: 1,
    borderColor: "rgba(251,146,60,0.25)",
  },
  badgeTxt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: Colors.textSecondary,
  },
  cleanBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(34,197,94,0.12)",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.25)",
  },
  cleanBadgeTxt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: "#22c55e",
  },
  scrollRow: {
    gap: 12,
    paddingHorizontal: 16,
  },
  tile: {
    width: TILE,
    alignItems: "center",
    gap: 7,
  },
  tileImageWrap: {
    width: TILE,
    height: TILE,
    borderRadius: 11,
    overflow: "hidden",
    borderWidth: 2,
    position: "relative",
    backgroundColor: Colors.background,
  },
  tileImage: {
    position: "absolute",
  },
  tilePlaceholder: {
    width: TILE,
    height: TILE,
  },
  tileTypeBadge: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 3,
  },
  tileSideBadge: {
    position: "absolute",
    top: 5,
    left: 5,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    zIndex: 10,
  },
  tileSideTxt: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    color: "#fff",
  },
  crosshairWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  crosshairRing: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: "transparent",
    opacity: 0.85,
  },
  crosshairDot: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.9,
  },
  tileLabel: {
    alignItems: "center",
    gap: 1,
    width: TILE + 8,
  },
  tileSeverity: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
  },
  tileType: {
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    color: Colors.textMuted,
  },
  tileDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 12,
    marginTop: 1,
  },
  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  emptyTxt: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "#22c55e",
  },
  footnote: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
    paddingHorizontal: 16,
    marginTop: 10,
  },
});
