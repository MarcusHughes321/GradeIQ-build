import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  View, Text, Image, ScrollView, StyleSheet, Modal,
  FlatList, Dimensions, Pressable, ActivityIndicator, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImageManipulator from "expo-image-manipulator";
import type { DefectMarker, CardBounds } from "@/lib/types";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const TILE = 96;
const TILE_ZOOM = 3.5;
const VIEWER_SIZE = Math.min(SCREEN_W - 48, SCREEN_H * 0.42);
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

// ── Filter types ─────────────────────────────────────────────────────────────
type FilterMode = "normal" | "server";
type FilterDef = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
  mode: FilterMode;
  serverType?: string;
};

const FILTER_PRESETS: FilterDef[] = [
  {
    id: "normal",
    label: "Normal",
    icon: "image-outline",
    description: "Original image",
    mode: "normal",
  },
  {
    id: "texture",
    label: "Texture Map",
    icon: "grid-outline",
    description: "CLAHE adaptive equalisation — locally adjusts brightness across the card surface to reveal micro-scratches and print texture invisible to global contrast",
    mode: "server",
    serverType: "texture",
  },
  {
    id: "emboss",
    label: "Surface Relief",
    icon: "layers-outline",
    description: "Emboss convolution — 3-D relief view exposes deformations, dents and creases (same technique used by TAG & DCG graders)",
    mode: "server",
    serverType: "emboss",
  },
  {
    id: "edge",
    label: "Edge Detect",
    icon: "analytics-outline",
    description: "Laplacian kernel — mathematically finds every edge, scratch and print line; highlights defects that eyes miss",
    mode: "server",
    serverType: "edge",
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if bounds are real (not null, not near-full-image defaults). */
function boundsLookValid(b?: CardBounds | null): boolean {
  if (!b) return false;
  const w = b.rightPercent - b.leftPercent;
  const h = b.bottomPercent - b.topPercent;
  // Reject bounds that cover ≥90% of the image — those are just defaults.
  return w < 90 && h < 90 && b.leftPercent > 3 && b.topPercent > 1;
}

/** Maps card-relative defect coords (0-100) to image-relative coords (0-100). */
function mapToImagePosition(x: number, y: number, bounds?: CardBounds | null) {
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

/**
 * Computes the crop pan position AND the actual crosshair pixel position
 * inside the crop box, accounting for clamping at image edges.
 *
 * The crop box pans the scaled image so the defect is at center — but when
 * the defect is near an edge the pan is clamped. This returns where the
 * defect point actually lands in the view after clamping.
 */
function computeCropGeometry(
  imgWidth: number, imgHeight: number,
  imgX: number, imgY: number,
  size: number, zoom: number
) {
  const scaledW = size * zoom;
  const scaledH = imgWidth > 0 ? scaledW * (imgHeight / imgWidth) : scaledW * 1.4;
  const rawLeft = -(imgX / 100) * scaledW + size / 2;
  const rawTop = -(imgY / 100) * scaledH + size / 2;
  const clampedLeft = Math.max(-(scaledW - size), Math.min(0, rawLeft));
  const clampedTop = Math.max(-(scaledH - size), Math.min(0, rawTop));
  // Where the defect point actually appears in the view (pixel offset from top-left of crop box)
  const crossX = (imgX / 100) * scaledW + clampedLeft;
  const crossY = (imgY / 100) * scaledH + clampedTop;
  return { scaledW, scaledH, clampedLeft, clampedTop, crossX, crossY };
}

/** Crosshair ring + dot positioned at the actual defect location in the view. */
function Crosshair({
  x, y, ringSize, dotSize, color,
}: {
  x: number; y: number; ringSize: number; dotSize: number; color: string;
}) {
  return (
    <>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: x - ringSize / 2,
          top: y - ringSize / 2,
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderWidth: ringSize > 24 ? 2 : 1.5,
          borderColor: color,
          backgroundColor: "transparent",
          opacity: 0.9,
          zIndex: 5,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: x - dotSize / 2,
          top: y - dotSize / 2,
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: color,
          opacity: 0.9,
          zIndex: 5,
        }}
      />
    </>
  );
}

// ── Defect tile (in the horizontal scroll strip) ──────────────────────────────
function DefectTile({
  defect, imageUri, imgWidth, imgHeight, cardBounds, onPress,
}: {
  defect: DefectMarker; imageUri: string; imgWidth: number; imgHeight: number;
  cardBounds?: CardBounds | null; onPress: () => void;
}) {
  const color = SEVERITY_COLOR[defect.severity] || "#F59E0B";
  const { imgX, imgY } = mapToImagePosition(defect.x, defect.y, cardBounds);
  const geo = imgWidth > 0
    ? computeCropGeometry(imgWidth, imgHeight, imgX, imgY, TILE, TILE_ZOOM)
    : null;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.75 : 1 }]}>
      <View style={[styles.tileImageWrap, { borderColor: color + "CC" }]}>
        {geo ? (
          <Image
            source={{ uri: imageUri }}
            style={{ position: "absolute", width: geo.scaledW, height: geo.scaledH, left: geo.clampedLeft, top: geo.clampedTop }}
            resizeMode="cover"
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
        <View style={styles.expandIcon}>
          <Ionicons name="expand-outline" size={11} color="rgba(255,255,255,0.9)" />
        </View>
        {geo && (
          <Crosshair x={geo.crossX} y={geo.crossY} ringSize={20} dotSize={4} color={color} />
        )}
      </View>
      <View style={styles.tileLabel}>
        <Text style={[styles.tileSeverity, { color }]}>{SEVERITY_LABEL[defect.severity]}</Text>
        <Text style={styles.tileType}>{defect.type.charAt(0).toUpperCase() + defect.type.slice(1)}</Text>
        <Text style={styles.tileDesc} numberOfLines={2}>{defect.description}</Text>
      </View>
    </Pressable>
  );
}

// ── Viewer page (one per defect in the modal FlatList) ────────────────────────
function DefectViewerPage({
  defect, imageUri, filteredUri, imgWidth, imgHeight, cardBounds, index, total, isLoading,
}: {
  defect: DefectMarker; imageUri: string; filteredUri: string | null;
  imgWidth: number; imgHeight: number; cardBounds?: CardBounds | null;
  index: number; total: number; isLoading: boolean;
}) {
  const color = SEVERITY_COLOR[defect.severity] || "#F59E0B";
  const { imgX, imgY } = mapToImagePosition(defect.x, defect.y, cardBounds);
  const displayUri = filteredUri ?? imageUri;

  const geo = imgWidth > 0
    ? computeCropGeometry(imgWidth, imgHeight, imgX, imgY, VIEWER_SIZE, VIEWER_ZOOM)
    : null;

  return (
    <View style={styles.viewerPage}>
      <View style={[styles.viewerCropWrap, { borderColor: color + "55" }]}>
        {/* Image layer */}
        <View style={[StyleSheet.absoluteFillObject, { overflow: "hidden" }]}>
          {geo ? (
            <Image
              source={{ uri: displayUri }}
              style={{ position: "absolute", width: geo.scaledW, height: geo.scaledH, left: geo.clampedLeft, top: geo.clampedTop }}
              resizeMode="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: Colors.surface }]} />
          )}
        </View>
        {/* Crosshair at actual defect location */}
        {geo && (
          <Crosshair x={geo.crossX} y={geo.crossY} ringSize={44} dotSize={8} color={color} />
        )}
        {/* Loading overlay */}
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={Colors.primary} />
          </View>
        )}
      </View>

      <View style={[styles.viewerInfoBox, { borderColor: color + "33" }]}>
        <View style={styles.viewerInfoTop}>
          <View style={[styles.viewerSeverityPill, { backgroundColor: color + "22", borderColor: color + "55" }]}>
            <View style={[styles.viewerSeverityDot, { backgroundColor: color }]} />
            <Text style={[styles.viewerSeverityTxt, { color }]}>{SEVERITY_LABEL[defect.severity]}</Text>
          </View>
          <View style={styles.viewerTypePill}>
            <Ionicons name={TYPE_ICON[defect.type] || "alert-circle-outline"} size={12} color={Colors.textMuted} />
            <Text style={styles.viewerTypeTxt}>{defect.type.charAt(0).toUpperCase() + defect.type.slice(1)}</Text>
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

// ── Main component ─────────────────────────────────────────────────────────────
interface Props {
  defects: DefectMarker[];
  frontImage: string;
  backImage: string;
  frontCardBounds?: CardBounds | null;
  backCardBounds?: CardBounds | null;
}

export default function DefectCutoutPanel({ defects, frontImage, backImage, frontCardBounds, backCardBounds }: Props) {
  const insets = useSafeAreaInsets();
  const [frontDims, setFrontDims] = useState<{ w: number; h: number } | null>(null);
  const [backDims, setBackDims] = useState<{ w: number; h: number } | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [activeFilterId, setActiveFilterId] = useState("normal");
  const filteredCache = useRef<Record<string, string>>({});
  const [filteredFrontUri, setFilteredFrontUri] = useState<string | null>(null);
  const [filteredBackUri, setFilteredBackUri] = useState<string | null>(null);
  const [loadingFront, setLoadingFront] = useState(false);
  const [loadingBack, setLoadingBack] = useState(false);
  const listRef = useRef<FlatList>(null);

  // Resolved bounds — may be auto-detected if the stored ones look like defaults
  const [resolvedFrontBounds, setResolvedFrontBounds] = useState<CardBounds | null>(frontCardBounds ?? null);
  const [resolvedBackBounds, setResolvedBackBounds] = useState<CardBounds | null>(backCardBounds ?? null);

  useEffect(() => {
    Image.getSize(frontImage, (w, h) => setFrontDims({ w, h }), () => setFrontDims({ w: 0, h: 0 }));
    Image.getSize(backImage, (w, h) => setBackDims({ w, h }), () => setBackDims({ w: 0, h: 0 }));
  }, [frontImage, backImage]);

  // If stored bounds look like wide defaults, auto-detect real card bounds
  useEffect(() => {
    const needFront = !boundsLookValid(frontCardBounds);
    const needBack = !boundsLookValid(backCardBounds);
    if (!needFront && !needBack) return;

    const detectOne = async (uri: string): Promise<CardBounds | null> => {
      try {
        const compressed = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 600 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        if (!compressed.base64) return null;
        const resp = await apiRequest("POST", "/api/detect-bounds", { image: compressed.base64 });
        if (!resp.ok) return null;
        return await resp.json() as CardBounds;
      } catch {
        return null;
      }
    };

    (async () => {
      const [fb, bb] = await Promise.all([
        needFront ? detectOne(frontImage) : Promise.resolve(frontCardBounds ?? null),
        needBack ? detectOne(backImage) : Promise.resolve(backCardBounds ?? null),
      ]);
      if (fb && boundsLookValid(fb)) setResolvedFrontBounds(fb);
      if (bb && boundsLookValid(bb)) setResolvedBackBounds(bb);
    })();
  }, []);

  const sorted = useMemo(
    () => [...defects].sort((a, b) => {
      const order: Record<string, number> = { major: 0, moderate: 1, minor: 2 };
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
    }),
    [defects]
  );

  const activeFilter = FILTER_PRESETS.find(f => f.id === activeFilterId) ?? FILTER_PRESETS[0];

  const fetchServerFilter = async (side: "front" | "back", serverType: string) => {
    const cacheKey = `${side}:${serverType}`;
    if (filteredCache.current[cacheKey]) {
      if (side === "front") setFilteredFrontUri(filteredCache.current[cacheKey]);
      else setFilteredBackUri(filteredCache.current[cacheKey]);
      return;
    }

    const uri = side === "front" ? frontImage : backImage;
    if (side === "front") setLoadingFront(true);
    else setLoadingBack(true);

    try {
      let base64: string;

      if (uri.startsWith("data:")) {
        base64 = uri.split(",")[1];
      } else {
        const compressed = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 400 } }],
          { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        if (!compressed.base64) throw new Error("Compression returned no base64");
        base64 = compressed.base64;
      }

      const resp = await apiRequest("POST", "/api/filter-image", { imageBase64: base64, filterType: serverType });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Server ${resp.status}: ${errText}`);
      }
      const data = await resp.json() as { resultBase64: string };
      const dataUri = `data:image/jpeg;base64,${data.resultBase64}`;
      filteredCache.current[cacheKey] = dataUri;
      if (side === "front") setFilteredFrontUri(dataUri);
      else setFilteredBackUri(dataUri);
    } catch (err: any) {
      console.error("[DefectCutoutPanel] filter-image failed:", err?.message ?? err);
    } finally {
      if (side === "front") setLoadingFront(false);
      else setLoadingBack(false);
    }
  };

  const handleFilterSelect = (filterId: string) => {
    setActiveFilterId(filterId);
    const preset = FILTER_PRESETS.find(f => f.id === filterId);
    if (!preset || preset.mode !== "server" || !preset.serverType) {
      setFilteredFrontUri(null);
      setFilteredBackUri(null);
      return;
    }
    const serverType = preset.serverType;
    fetchServerFilter("front", serverType);
    setTimeout(() => fetchServerFilter("back", serverType), 600);
  };

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setActiveFilterId("normal");
    setFilteredFrontUri(null);
    setFilteredBackUri(null);
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
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
                  cardBounds={isFront ? resolvedFrontBounds : resolvedBackBounds}
                  onPress={() => openViewer(i)}
                />
              );
            })}
          </ScrollView>
          <Text style={styles.footnote}>Tap a flaw to enlarge · sorted by severity</Text>
        </>
      )}

      {/* ── Fullscreen viewer modal ─────────────────────────────────────────── */}
      <Modal
        visible={viewerOpen}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setViewerOpen(false)}
        statusBarTranslucent={Platform.OS === "android"}
      >
        <View style={[styles.viewerModal, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.viewerHeader}>
            <Pressable onPress={() => setViewerOpen(false)}
              style={({ pressed }) => [styles.viewerCloseBtn, { opacity: pressed ? 0.6 : 1 }]}>
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
              const filteredUri = isFront ? filteredFrontUri : filteredBackUri;
              const isLoading = isFront ? loadingFront : loadingBack;
              return (
                <DefectViewerPage
                  defect={item}
                  imageUri={isFront ? frontImage : backImage}
                  filteredUri={filteredUri}
                  imgWidth={dims?.w ?? 0}
                  imgHeight={dims?.h ?? 0}
                  cardBounds={isFront ? resolvedFrontBounds : resolvedBackBounds}
                  index={index}
                  total={sorted.length}
                  isLoading={isLoading}
                />
              );
            }}
          />

          {/* ── Filter strip ──────────────────────────────────────────────────── */}
          <View style={styles.filterSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {FILTER_PRESETS.map((f) => {
                const isActive = activeFilterId === f.id;
                const isServer = f.mode === "server";
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => handleFilterSelect(f.id)}
                    style={({ pressed }) => [
                      styles.filterPill,
                      isActive && styles.filterPillActive,
                      { opacity: pressed ? 0.75 : 1 },
                    ]}
                  >
                    <Ionicons name={f.icon} size={13} color={isActive ? "#fff" : Colors.textMuted} />
                    <Text style={[styles.filterPillTxt, isActive && styles.filterPillTxtActive]}>{f.label}</Text>
                    {isServer && (
                      <View style={[styles.aiBadge, isActive && styles.aiBadgeActive]}>
                        <Text style={[styles.aiBadgeTxt, isActive && styles.aiBadgeTxtActive]}>AI</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
            {activeFilter.id !== "normal" && (
              <Text style={styles.filterHint} numberOfLines={2}>{activeFilter.description}</Text>
            )}
          </View>

          {/* ── Dot scrubber ───────────────────────────────────────────────────── */}
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
                    <View style={[styles.dot, i === viewerIndex
                      ? [styles.dotActive, { backgroundColor: color }]
                      : styles.dotInactive]} />
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
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  headerTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  headerBadges: { flexDirection: "row", alignItems: "center", gap: 6 },
  badge: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeMajor: { backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)" },
  badgeModerate: { backgroundColor: "rgba(251,146,60,0.12)", borderWidth: 1, borderColor: "rgba(251,146,60,0.25)" },
  badgeTxt: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: Colors.textSecondary },
  cleanBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(34,197,94,0.12)", borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: "rgba(34,197,94,0.25)",
  },
  cleanBadgeTxt: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#22c55e" },
  scrollRow: { gap: 12, paddingHorizontal: 16 },
  tile: { width: TILE, alignItems: "center", gap: 7 },
  tileImageWrap: {
    width: TILE, height: TILE, borderRadius: 11, overflow: "hidden",
    borderWidth: 2, position: "relative", backgroundColor: Colors.background,
  },
  tilePlaceholder: { width: TILE, height: TILE, backgroundColor: Colors.surface },
  tileTypeBadge: {
    position: "absolute", top: 5, right: 5, width: 18, height: 18,
    borderRadius: 9, alignItems: "center", justifyContent: "center", zIndex: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.5, shadowRadius: 2, elevation: 3,
  },
  tileSideBadge: {
    position: "absolute", top: 5, left: 5, backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, zIndex: 10,
  },
  tileSideTxt: { fontFamily: "Inter_700Bold", fontSize: 9, color: "#fff" },
  expandIcon: {
    position: "absolute", bottom: 5, right: 5, backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 4, padding: 2, zIndex: 10,
  },
  tileLabel: { alignItems: "center", gap: 1, width: TILE + 8 },
  tileSeverity: { fontFamily: "Inter_700Bold", fontSize: 10 },
  tileType: { fontFamily: "Inter_500Medium", fontSize: 9, color: Colors.textMuted },
  tileDesc: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted, textAlign: "center", lineHeight: 12, marginTop: 1 },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  emptyTxt: { fontFamily: "Inter_500Medium", fontSize: 13, color: "#22c55e" },
  footnote: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, paddingHorizontal: 16, marginTop: 10 },

  viewerModal: { flex: 1, backgroundColor: "#000" },
  viewerHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 10,
  },
  viewerCloseBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  viewerHeaderTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: "#fff" },
  viewerPage: { width: SCREEN_W, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 14 },
  viewerCropWrap: { width: VIEWER_SIZE, height: VIEWER_SIZE, borderRadius: 16, overflow: "hidden", borderWidth: 2, backgroundColor: "#111", position: "relative" },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", zIndex: 10 },
  viewerInfoBox: { width: "100%", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  viewerInfoTop: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  viewerSeverityPill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  viewerSeverityDot: { width: 6, height: 6, borderRadius: 3 },
  viewerSeverityTxt: { fontFamily: "Inter_700Bold", fontSize: 11 },
  viewerTypePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  viewerTypeTxt: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textMuted },
  viewerSidePill: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  viewerSideTxt: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textMuted },
  viewerPageCount: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.4)" },
  viewerDesc: { fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 20 },

  filterSection: { paddingTop: 2, gap: 4 },
  filterRow: { paddingHorizontal: 14, gap: 7, paddingVertical: 8, alignItems: "center" },
  filterPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  filterPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterPillTxt: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textMuted },
  filterPillTxtActive: { color: "#fff", fontFamily: "Inter_600SemiBold" },
  aiBadge: {
    backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  aiBadgeActive: { backgroundColor: "rgba(255,255,255,0.25)" },
  aiBadgeTxt: { fontFamily: "Inter_700Bold", fontSize: 8, color: Colors.textMuted },
  aiBadgeTxtActive: { color: "#fff" },
  filterHint: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.45)", paddingHorizontal: 18, lineHeight: 15, paddingBottom: 4 },

  viewerDots: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingBottom: 8, paddingTop: 4 },
  dot: { borderRadius: 4 },
  dotActive: { width: 16, height: 6 },
  dotInactive: { width: 6, height: 6, backgroundColor: "rgba(255,255,255,0.25)" },
});
