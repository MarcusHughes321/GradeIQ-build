import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  View, Text, Image, ScrollView, StyleSheet, Modal,
  FlatList, Dimensions, Pressable, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { DefectMarker, CardBounds } from "@/lib/types";
import Colors from "@/constants/colors";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const TILE = 96;
const TILE_ZOOM = 3.5;

const VIEWER_SIZE = Math.min(SCREEN_W - 48, SCREEN_H * 0.44);
const VIEWER_ZOOM = 2.5;

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

type FilterDef = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
  filter: object[];
};

const FILTER_PRESETS: FilterDef[] = [
  {
    id: "normal",
    label: "Normal",
    icon: "image-outline",
    description: "Original image",
    filter: [],
  },
  {
    id: "contrast",
    label: "Contrast",
    icon: "contrast-outline",
    description: "High contrast reveals wear marks, edge chips and surface scratches",
    filter: [{ contrast: 2.8 }, { brightness: 0.95 }],
  },
  {
    id: "sharpen",
    label: "Sharpen",
    icon: "scan-outline",
    description: "Simulates AI sharpening — fine scratches and corner frays become clearer",
    filter: [{ contrast: 1.7 }, { brightness: 1.15 }, { saturate: 1.2 }],
  },
  {
    id: "grayscale",
    label: "Grayscale",
    icon: "color-filter-outline",
    description: "Strips holo shimmer — surface scratches and print defects stand out",
    filter: [{ grayscale: 1 }, { contrast: 1.8 }],
  },
  {
    id: "invert",
    label: "Invert",
    icon: "eye-outline",
    description: "Inverts light & dark — light surface scratches on dark cards become obvious",
    filter: [{ invert: 1 }, { contrast: 1.2 }],
  },
  {
    id: "saturate",
    label: "Saturate",
    icon: "color-palette-outline",
    description: "Boosts colour to reveal ink bleed, print lines and foil inconsistencies",
    filter: [{ saturate: 4 }, { contrast: 1.3 }],
  },
  {
    id: "warm",
    label: "Edge Detect",
    icon: "analytics-outline",
    description: "Sepia + high contrast — highlights border wear and edge whitening",
    filter: [{ sepia: 0.8 }, { contrast: 2.5 }, { brightness: 0.85 }],
  },
];

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

function CropImage({
  imageUri,
  imgWidth,
  imgHeight,
  imgX,
  imgY,
  size,
  zoom,
}: {
  imageUri: string;
  imgWidth: number;
  imgHeight: number;
  imgX: number;
  imgY: number;
  size: number;
  zoom: number;
}) {
  const scaledW = size * zoom;
  const scaledH = imgWidth > 0 ? scaledW * (imgHeight / imgWidth) : scaledW * 1.4;
  const rawLeft = -(imgX / 100) * scaledW + size / 2;
  const rawTop = -(imgY / 100) * scaledH + size / 2;
  const clampedLeft = Math.max(-(scaledW - size), Math.min(0, rawLeft));
  const clampedTop = Math.max(-(scaledH - size), Math.min(0, rawTop));

  return (
    <Image
      source={{ uri: imageUri }}
      style={{
        position: "absolute",
        width: scaledW,
        height: scaledH,
        left: clampedLeft,
        top: clampedTop,
      }}
      resizeMode="cover"
    />
  );
}

interface DefectTileProps {
  defect: DefectMarker;
  imageUri: string;
  imgWidth: number;
  imgHeight: number;
  cardBounds?: CardBounds | null;
  onPress: () => void;
}

function DefectTile({ defect, imageUri, imgWidth, imgHeight, cardBounds, onPress }: DefectTileProps) {
  const color = SEVERITY_COLOR[defect.severity] || "#F59E0B";
  const { imgX, imgY } = mapToImagePosition(defect.x, defect.y, cardBounds);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={[styles.tileImageWrap, { borderColor: color + "CC" }]}>
        {imgWidth > 0 ? (
          <CropImage
            imageUri={imageUri}
            imgWidth={imgWidth}
            imgHeight={imgHeight}
            imgX={imgX}
            imgY={imgY}
            size={TILE}
            zoom={TILE_ZOOM}
          />
        ) : (
          <View style={styles.tilePlaceholder} />
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
        <View style={styles.expandIcon}>
          <Ionicons name="expand-outline" size={11} color="rgba(255,255,255,0.9)" />
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
    </Pressable>
  );
}

interface DefectViewerPageProps {
  defect: DefectMarker;
  imageUri: string;
  imgWidth: number;
  imgHeight: number;
  cardBounds?: CardBounds | null;
  index: number;
  total: number;
  activeFilter: FilterDef;
}

function DefectViewerPage({
  defect, imageUri, imgWidth, imgHeight, cardBounds, index, total, activeFilter,
}: DefectViewerPageProps) {
  const color = SEVERITY_COLOR[defect.severity] || "#F59E0B";
  const { imgX, imgY } = mapToImagePosition(defect.x, defect.y, cardBounds);

  const filterStyle = activeFilter.filter.length > 0
    ? { filter: activeFilter.filter } as any
    : undefined;

  return (
    <View style={styles.viewerPage}>
      <View style={[styles.viewerCropWrap, { borderColor: color + "55" }]}>
        <View style={[StyleSheet.absoluteFillObject, filterStyle]}>
          {imgWidth > 0 ? (
            <CropImage
              imageUri={imageUri}
              imgWidth={imgWidth}
              imgHeight={imgHeight}
              imgX={imgX}
              imgY={imgY}
              size={VIEWER_SIZE}
              zoom={VIEWER_ZOOM}
            />
          ) : (
            <View style={[styles.viewerPlaceholder, { backgroundColor: Colors.surface }]} />
          )}
        </View>
        <View style={styles.crosshairWrapLg} pointerEvents="none">
          <View style={[styles.crosshairRingLg, { borderColor: color }]} />
          <View style={[styles.crosshairDotLg, { backgroundColor: color }]} />
        </View>
      </View>

      <View style={[styles.viewerInfoBox, { borderColor: color + "33" }]}>
        <View style={styles.viewerInfoTop}>
          <View style={[styles.viewerSeverityPill, { backgroundColor: color + "22", borderColor: color + "55" }]}>
            <View style={[styles.viewerSeverityDot, { backgroundColor: color }]} />
            <Text style={[styles.viewerSeverityTxt, { color }]}>{SEVERITY_LABEL[defect.severity]}</Text>
          </View>
          <View style={styles.viewerTypePill}>
            <Ionicons name={TYPE_ICON[defect.type] || "alert-circle-outline"} size={12} color={Colors.textMuted} />
            <Text style={styles.viewerTypeTxt}>
              {defect.type.charAt(0).toUpperCase() + defect.type.slice(1)}
            </Text>
          </View>
          <View style={styles.viewerSidePill}>
            <Text style={styles.viewerSideTxt}>{defect.side === "front" ? "Front" : "Back"}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Text style={styles.viewerPageCount}>{index + 1} / {total}</Text>
        </View>
        <Text style={styles.viewerDesc}>{defect.description}</Text>
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
  const insets = useSafeAreaInsets();
  const [frontDims, setFrontDims] = useState<{ w: number; h: number } | null>(null);
  const [backDims, setBackDims] = useState<{ w: number; h: number } | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [activeFilterId, setActiveFilterId] = useState("normal");
  const listRef = useRef<FlatList>(null);
  const filterScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    Image.getSize(frontImage, (w, h) => setFrontDims({ w, h }), () => setFrontDims({ w: 0, h: 0 }));
    Image.getSize(backImage, (w, h) => setBackDims({ w, h }), () => setBackDims({ w: 0, h: 0 }));
  }, [frontImage, backImage]);

  const sorted = useMemo(
    () =>
      [...defects].sort((a, b) => {
        const order = { major: 0, moderate: 1, minor: 2 };
        return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
      }),
    [defects]
  );

  const activeFilter = FILTER_PRESETS.find(f => f.id === activeFilterId) ?? FILTER_PRESETS[0];

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setActiveFilterId("normal");
    setViewerOpen(true);
  };

  const majorCount = defects.filter(d => d.severity === "major").length;
  const moderateCount = defects.filter(d => d.severity === "moderate").length;

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
                  onPress={() => openViewer(i)}
                />
              );
            })}
          </ScrollView>
          <Text style={styles.footnote}>Tap a flaw to enlarge · sorted by severity</Text>
        </>
      )}

      <Modal
        visible={viewerOpen}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setViewerOpen(false)}
        statusBarTranslucent={Platform.OS === "android"}
      >
        <View style={[styles.viewerModal, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.viewerHeader}>
            <Pressable
              onPress={() => setViewerOpen(false)}
              style={({ pressed }) => [styles.viewerCloseBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
            <Text style={styles.viewerHeaderTitle}>Defect Detail</Text>
            <View style={{ width: 44 }} />
          </View>

          <FlatList
            ref={listRef}
            data={sorted}
            keyExtractor={(_, i) => String(i)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={viewerIndex}
            getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
            onMomentumScrollEnd={(e) => {
              const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
              setViewerIndex(page);
            }}
            renderItem={({ item, index }) => {
              const isFront = item.side === "front";
              const dims = isFront ? frontDims : backDims;
              return (
                <DefectViewerPage
                  defect={item}
                  imageUri={isFront ? frontImage : backImage}
                  imgWidth={dims?.w ?? 0}
                  imgHeight={dims?.h ?? 0}
                  cardBounds={isFront ? frontCardBounds : backCardBounds}
                  index={index}
                  total={sorted.length}
                  activeFilter={activeFilter}
                />
              );
            }}
          />

          {/* ── Filter strip ── */}
          <View style={styles.filterSection}>
            <ScrollView
              ref={filterScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {FILTER_PRESETS.map((f) => {
                const isActive = activeFilterId === f.id;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => setActiveFilterId(f.id)}
                    style={({ pressed }) => [
                      styles.filterPill,
                      isActive && styles.filterPillActive,
                      { opacity: pressed ? 0.75 : 1 },
                    ]}
                  >
                    <Ionicons
                      name={f.icon}
                      size={13}
                      color={isActive ? "#fff" : Colors.textMuted}
                    />
                    <Text style={[styles.filterPillTxt, isActive && styles.filterPillTxtActive]}>
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {activeFilter.id !== "normal" && (
              <Text style={styles.filterHint} numberOfLines={2}>
                {activeFilter.description}
              </Text>
            )}
          </View>

          {/* ── Dot scrubber ── */}
          {sorted.length > 1 && (
            <View style={styles.viewerDots}>
              {sorted.map((d, i) => {
                const color = SEVERITY_COLOR[d.severity] || "#F59E0B";
                return (
                  <Pressable
                    key={i}
                    onPress={() => {
                      setViewerIndex(i);
                      listRef.current?.scrollToIndex({ index: i, animated: true });
                    }}
                  >
                    <View
                      style={[
                        styles.dot,
                        i === viewerIndex
                          ? [styles.dotActive, { backgroundColor: color }]
                          : styles.dotInactive,
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </Modal>
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
  tilePlaceholder: {
    width: TILE,
    height: TILE,
    backgroundColor: Colors.surface,
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
  expandIcon: {
    position: "absolute",
    bottom: 5,
    right: 5,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 4,
    padding: 2,
    zIndex: 10,
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

  viewerModal: {
    flex: 1,
    backgroundColor: "#000",
  },
  viewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  viewerCloseBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  viewerHeaderTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },

  viewerPage: {
    width: SCREEN_W,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 16,
  },
  viewerCropWrap: {
    width: VIEWER_SIZE,
    height: VIEWER_SIZE,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2,
    backgroundColor: "#111",
    position: "relative",
  },
  viewerPlaceholder: {
    width: VIEWER_SIZE,
    height: VIEWER_SIZE,
  },
  crosshairWrapLg: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  crosshairRingLg: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    backgroundColor: "transparent",
    opacity: 0.9,
  },
  crosshairDotLg: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.9,
  },
  viewerInfoBox: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  viewerInfoTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  viewerSeverityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  viewerSeverityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  viewerSeverityTxt: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  viewerTypePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  viewerTypeTxt: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textMuted,
  },
  viewerSidePill: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  viewerSideTxt: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textMuted,
  },
  viewerPageCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
  },
  viewerDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    lineHeight: 20,
  },

  filterSection: {
    paddingTop: 4,
    gap: 6,
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 8,
    paddingVertical: 6,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  filterPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterPillTxt: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
  },
  filterPillTxtActive: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
  },
  filterHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    paddingHorizontal: 20,
    lineHeight: 15,
  },

  viewerDots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingBottom: 8,
    paddingTop: 6,
  },
  dot: {
    borderRadius: 4,
  },
  dotActive: {
    width: 16,
    height: 6,
  },
  dotInactive: {
    width: 6,
    height: 6,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
});
