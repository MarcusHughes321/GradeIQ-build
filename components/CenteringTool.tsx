import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  Dimensions,
  LayoutChangeEvent,
  Platform,
  GestureResponderEvent,
  PanResponderGestureState,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import type { CenteringMeasurement } from "@/lib/types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface CenteringToolProps {
  frontImage: string;
  backImage: string;
  centering: CenteringMeasurement;
  onSave: (centering: CenteringMeasurement) => void;
  onClose: () => void;
}

interface BorderPositions {
  outerLeft: number;
  innerLeft: number;
  innerRight: number;
  outerRight: number;
  outerTop: number;
  innerTop: number;
  innerBottom: number;
  outerBottom: number;
}

function initPositions(lr: number, tb: number, imgW: number, imgH: number): BorderPositions {
  const edgeInset = 0.025;
  const outerLeft = imgW * edgeInset;
  const outerRight = imgW * (1 - edgeInset);
  const outerTop = imgH * edgeInset;
  const outerBottom = imgH * (1 - edgeInset);

  const cardW = outerRight - outerLeft;
  const cardH = outerBottom - outerTop;

  const totalBorderH = cardW * 0.10;
  const totalBorderV = cardH * 0.10;

  const leftBorder = totalBorderH * (lr / 100);
  const rightBorder = totalBorderH * ((100 - lr) / 100);
  const topBorder = totalBorderV * (tb / 100);
  const bottomBorder = totalBorderV * ((100 - tb) / 100);

  return {
    outerLeft,
    innerLeft: outerLeft + leftBorder,
    innerRight: outerRight - rightBorder,
    outerRight,
    outerTop,
    innerTop: outerTop + topBorder,
    innerBottom: outerBottom - bottomBorder,
    outerBottom,
  };
}

function computeRatio(pos: BorderPositions) {
  const leftBorder = Math.max(0, pos.innerLeft - pos.outerLeft);
  const rightBorder = Math.max(0, pos.outerRight - pos.innerRight);
  const topBorder = Math.max(0, pos.innerTop - pos.outerTop);
  const bottomBorder = Math.max(0, pos.outerBottom - pos.innerBottom);
  const totalH = leftBorder + rightBorder;
  const totalV = topBorder + bottomBorder;
  const lrRaw = totalH > 0 ? Math.round((leftBorder / totalH) * 100) : 50;
  const tbRaw = totalV > 0 ? Math.round((topBorder / totalV) * 100) : 50;
  return {
    lr: Math.max(50, Math.min(95, Math.max(lrRaw, 100 - lrRaw))),
    tb: Math.max(50, Math.min(95, Math.max(tbRaw, 100 - tbRaw))),
  };
}

function formatRatio(value: number): string {
  return `${value}/${100 - value}`;
}

function getCenteringColor(value: number): string {
  if (value <= 52) return "#10B981";
  if (value <= 55) return "#34D399";
  if (value <= 60) return "#F59E0B";
  if (value <= 65) return "#FB923C";
  return "#EF4444";
}

const LINE_HIT = 34;

interface DragLineProps {
  orientation: "h" | "v";
  position: number;
  imgSize: { width: number; height: number };
  color: string;
  label: string;
  dashed?: boolean;
  onDrag: (pos: number) => void;
  minPos: number;
  maxPos: number;
  scale: number;
}

function DragLine({ orientation, position, imgSize, color, label, dashed, onDrag, minPos, maxPos, scale }: DragLineProps) {
  const posRef = useRef(position);
  const startRef = useRef(position);
  const cbRef = useRef(onDrag);
  const minRef = useRef(minPos);
  const maxRef = useRef(maxPos);
  const scaleRef = useRef(scale);
  posRef.current = position;
  cbRef.current = onDrag;
  minRef.current = minPos;
  maxRef.current = maxPos;
  scaleRef.current = scale;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderGrant: () => { startRef.current = posRef.current; },
      onPanResponderMove: (_: GestureResponderEvent, g: PanResponderGestureState) => {
        const d = orientation === "v" ? g.dx / scaleRef.current : g.dy / scaleRef.current;
        cbRef.current(Math.max(minRef.current, Math.min(maxRef.current, startRef.current + d)));
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const dotStyle = { width: 3, height: 3, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.85)" } as const;
  const lineW = dashed ? 1 : 2.5;

  if (orientation === "v") {
    return (
      <View
        style={{ position: "absolute" as const, top: 0, left: position - LINE_HIT / 2, width: LINE_HIT, height: imgSize.height, zIndex: dashed ? 8 : 12, alignItems: "center" as const, justifyContent: "center" as const }}
        {...pan.panHandlers}
      >
        <View style={{ position: "absolute" as const, width: lineW, height: "100%" as const, left: LINE_HIT / 2 - lineW / 2, backgroundColor: color, opacity: dashed ? 0.5 : 1 }} />
        {!dashed && (
          <View style={{ width: 16, height: 32, borderRadius: 8, backgroundColor: color, alignItems: "center" as const, justifyContent: "center" as const }}>
            <View style={{ gap: 2.5 }}>
              <View style={dotStyle} />
              <View style={dotStyle} />
              <View style={dotStyle} />
            </View>
          </View>
        )}
        {label ? <Text style={{ position: "absolute" as const, top: 3, left: LINE_HIT / 2 + 5, fontFamily: "Inter_700Bold", fontSize: 9, color, textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>{label}</Text> : null}
      </View>
    );
  }

  return (
    <View
      style={{ position: "absolute" as const, left: 0, top: position - LINE_HIT / 2, width: imgSize.width, height: LINE_HIT, zIndex: dashed ? 8 : 12, alignItems: "center" as const, justifyContent: "center" as const }}
      {...pan.panHandlers}
    >
      <View style={{ position: "absolute" as const, height: lineW, width: "100%" as const, top: LINE_HIT / 2 - lineW / 2, backgroundColor: color, opacity: dashed ? 0.5 : 1 }} />
      {!dashed && (
        <View style={{ width: 32, height: 16, borderRadius: 8, backgroundColor: color, alignItems: "center" as const, justifyContent: "center" as const }}>
          <View style={{ flexDirection: "row" as const, gap: 2.5 }}>
            <View style={dotStyle} />
            <View style={dotStyle} />
            <View style={dotStyle} />
          </View>
        </View>
      )}
      {label ? <Text style={{ position: "absolute" as const, left: 5, top: LINE_HIT / 2 + 5, fontFamily: "Inter_700Bold", fontSize: 9, color, textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>{label}</Text> : null}
    </View>
  );
}

const ZOOM_LEVELS = [1, 1.5, 2, 3];

export default function CenteringTool({ frontImage, backImage, centering, onSave, onClose }: CenteringToolProps) {
  const insets = useSafeAreaInsets();
  const [showFront, setShowFront] = useState(true);
  const [imageLayout, setImageLayout] = useState({ width: 0, height: 0 });
  const [frontPos, setFrontPos] = useState<BorderPositions | null>(null);
  const [backPos, setBackPos] = useState<BorderPositions | null>(null);
  const [frontRotation, setFrontRotation] = useState(0);
  const [backRotation, setBackRotation] = useState(0);
  const [showRotation, setShowRotation] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const initRef = useRef(false);
  const lastTapRef = useRef(0);
  const panStartRef = useRef({ x: 0, y: 0 });
  const containerLayoutRef = useRef({ width: 0, height: 0 });

  const rotation = showFront ? frontRotation : backRotation;
  const setRotation = showFront ? setFrontRotation : setBackRotation;

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setImageLayout({ width, height });
      containerLayoutRef.current = { width, height };
    }
  }, []);

  if (imageLayout.width > 0 && !initRef.current) {
    initRef.current = true;
    setFrontPos(initPositions(centering.frontLeftRight, centering.frontTopBottom, imageLayout.width, imageLayout.height));
    setBackPos(initPositions(centering.backLeftRight, centering.backTopBottom, imageLayout.width, imageLayout.height));
  }

  const pos = showFront ? frontPos : backPos;
  const setPos = showFront ? setFrontPos : setBackPos;

  const ratio = useMemo(() => {
    if (!pos) return { lr: 50, tb: 50 };
    return computeRatio(pos);
  }, [pos]);

  const drag = useCallback((key: keyof BorderPositions, val: number) => {
    setPos(prev => prev ? { ...prev, [key]: val } : prev);
  }, [setPos]);

  const handleSave = () => {
    if (!frontPos || !backPos) return;
    const fr = computeRatio(frontPos);
    const br = computeRatio(backPos);
    onSave({ frontLeftRight: fr.lr, frontTopBottom: fr.tb, backLeftRight: br.lr, backTopBottom: br.tb });
  };

  const handleReset = () => {
    if (imageLayout.width === 0) return;
    setFrontPos(initPositions(centering.frontLeftRight, centering.frontTopBottom, imageLayout.width, imageLayout.height));
    setBackPos(initPositions(centering.backLeftRight, centering.backTopBottom, imageLayout.width, imageLayout.height));
    setFrontRotation(0);
    setBackRotation(0);
  };

  const cycleZoom = () => {
    const currentIdx = ZOOM_LEVELS.indexOf(zoomLevel);
    const nextIdx = (currentIdx + 1) % ZOOM_LEVELS.length;
    const newZoom = ZOOM_LEVELS[nextIdx];
    if (newZoom === 1) {
      setPanOffset({ x: 0, y: 0 });
    }
    setZoomLevel(newZoom);
  };

  const resetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const clampPan = useCallback((x: number, y: number, scale: number) => {
    if (scale <= 1) return { x: 0, y: 0 };
    const { width, height } = containerLayoutRef.current;
    const maxPanX = (width * (scale - 1)) / (2 * scale);
    const maxPanY = (height * (scale - 1)) / (2 * scale);
    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, x)),
      y: Math.max(-maxPanY, Math.min(maxPanY, y)),
    };
  }, []);

  const bgPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        if (evt.nativeEvent.touches.length >= 2) return true;
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
          return true;
        }
        lastTapRef.current = now;
        return false;
      },
      onMoveShouldSetPanResponder: (evt, g) => {
        if (evt.nativeEvent.touches.length >= 2) return true;
        return false;
      },
      onPanResponderGrant: (evt) => {
        const now = Date.now();
        if (evt.nativeEvent.touches.length < 2 && now - lastTapRef.current < 50) {
          return;
        }
        panStartRef.current = { x: 0, y: 0 };
      },
      onPanResponderMove: (evt, g) => {
        if (evt.nativeEvent.touches.length >= 2) {
          return;
        }
      },
      onPanResponderRelease: (evt) => {
      },
    })
  ).current;

  const lrColor = getCenteringColor(ratio.lr);
  const tbColor = getCenteringColor(ratio.tb);
  const w = imageLayout.width;
  const h = imageLayout.height;

  const OUTER_COLOR = "rgba(255,255,255,0.7)";
  const INNER_L = "#FF3C31";
  const INNER_R = "#3B82F6";
  const INNER_T = "#F59E0B";
  const INNER_B = "#10B981";

  const rotClamp = (v: number) => Math.max(-15, Math.min(15, Math.round(v * 10) / 10));

  const nudgePan = (dx: number, dy: number) => {
    const step = 30 / zoomLevel;
    setPanOffset(prev => clampPan(prev.x + dx * step, prev.y + dy * step, zoomLevel));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset, paddingBottom: insets.bottom + webBottomInset }]}>
      <View style={styles.header}>
        <Pressable onPress={onClose} style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <View style={styles.ratioInline}>
          <Text style={[styles.ratioText, { color: lrColor }]}>L/R {formatRatio(ratio.lr)}</Text>
          <View style={styles.ratioDot} />
          <Text style={[styles.ratioText, { color: tbColor }]}>T/B {formatRatio(ratio.tb)}</Text>
        </View>
        <Pressable onPress={handleSave} style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <Ionicons name="checkmark" size={16} color="#fff" />
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </View>

      <View style={styles.imageArea}>
        <View style={styles.imageViewport}>
          <View
            style={[
              styles.imageContainer,
              {
                transform: [
                  { scale: zoomLevel },
                  { translateX: panOffset.x },
                  { translateY: panOffset.y },
                ],
              },
            ]}
            onLayout={onLayout}
          >
            <Image
              source={{ uri: showFront ? frontImage : backImage }}
              style={[styles.cardImage, rotation !== 0 ? { transform: [{ rotate: `${rotation}deg` }] } : undefined]}
              contentFit="contain"
            />

            {pos && w > 0 && (
              <View style={styles.linesOverlay}>
                <DragLine orientation="v" position={pos.outerLeft} imgSize={imageLayout} color={OUTER_COLOR} label="" dashed onDrag={v => drag("outerLeft", v)} minPos={0} maxPos={pos.innerLeft - 4} scale={zoomLevel} />
                <DragLine orientation="v" position={pos.innerLeft} imgSize={imageLayout} color={INNER_L} label="L" onDrag={v => drag("innerLeft", v)} minPos={pos.outerLeft + 4} maxPos={w * 0.45} scale={zoomLevel} />

                <DragLine orientation="v" position={pos.outerRight} imgSize={imageLayout} color={OUTER_COLOR} label="" dashed onDrag={v => drag("outerRight", v)} minPos={pos.innerRight + 4} maxPos={w} scale={zoomLevel} />
                <DragLine orientation="v" position={pos.innerRight} imgSize={imageLayout} color={INNER_R} label="R" onDrag={v => drag("innerRight", v)} minPos={w * 0.55} maxPos={pos.outerRight - 4} scale={zoomLevel} />

                <DragLine orientation="h" position={pos.outerTop} imgSize={imageLayout} color={OUTER_COLOR} label="" dashed onDrag={v => drag("outerTop", v)} minPos={0} maxPos={pos.innerTop - 4} scale={zoomLevel} />
                <DragLine orientation="h" position={pos.innerTop} imgSize={imageLayout} color={INNER_T} label="T" onDrag={v => drag("innerTop", v)} minPos={pos.outerTop + 4} maxPos={h * 0.45} scale={zoomLevel} />

                <DragLine orientation="h" position={pos.outerBottom} imgSize={imageLayout} color={OUTER_COLOR} label="" dashed onDrag={v => drag("outerBottom", v)} minPos={pos.innerBottom + 4} maxPos={h} scale={zoomLevel} />
                <DragLine orientation="h" position={pos.innerBottom} imgSize={imageLayout} color={INNER_B} label="B" onDrag={v => drag("innerBottom", v)} minPos={h * 0.55} maxPos={pos.outerBottom - 4} scale={zoomLevel} />

                <View pointerEvents="none" style={[styles.borderShade, { left: pos.outerLeft, top: pos.outerTop, width: Math.max(0, pos.innerLeft - pos.outerLeft), height: Math.max(0, pos.outerBottom - pos.outerTop) }]} />
                <View pointerEvents="none" style={[styles.borderShade, { left: pos.innerRight, top: pos.outerTop, width: Math.max(0, pos.outerRight - pos.innerRight), height: Math.max(0, pos.outerBottom - pos.outerTop) }]} />
                <View pointerEvents="none" style={[styles.borderShade, { left: pos.innerLeft, top: pos.outerTop, width: Math.max(0, pos.innerRight - pos.innerLeft), height: Math.max(0, pos.innerTop - pos.outerTop) }]} />
                <View pointerEvents="none" style={[styles.borderShade, { left: pos.innerLeft, top: pos.innerBottom, width: Math.max(0, pos.innerRight - pos.innerLeft), height: Math.max(0, pos.outerBottom - pos.innerBottom) }]} />
              </View>
            )}
          </View>

          {zoomLevel > 1 && (
            <View style={styles.panControls}>
              <View style={styles.panRow}>
                <View style={styles.panSpacer} />
                <Pressable onPress={() => nudgePan(0, 1)} style={({ pressed }) => [styles.panBtn, { opacity: pressed ? 0.5 : 1 }]}>
                  <Ionicons name="chevron-up" size={16} color="#fff" />
                </Pressable>
                <View style={styles.panSpacer} />
              </View>
              <View style={styles.panRow}>
                <Pressable onPress={() => nudgePan(1, 0)} style={({ pressed }) => [styles.panBtn, { opacity: pressed ? 0.5 : 1 }]}>
                  <Ionicons name="chevron-back" size={16} color="#fff" />
                </Pressable>
                <View style={styles.panSpacer} />
                <Pressable onPress={() => nudgePan(-1, 0)} style={({ pressed }) => [styles.panBtn, { opacity: pressed ? 0.5 : 1 }]}>
                  <Ionicons name="chevron-forward" size={16} color="#fff" />
                </Pressable>
              </View>
              <View style={styles.panRow}>
                <View style={styles.panSpacer} />
                <Pressable onPress={() => nudgePan(0, -1)} style={({ pressed }) => [styles.panBtn, { opacity: pressed ? 0.5 : 1 }]}>
                  <Ionicons name="chevron-down" size={16} color="#fff" />
                </Pressable>
                <View style={styles.panSpacer} />
              </View>
            </View>
          )}

          <View style={styles.zoomBadge}>
            <Pressable onPress={cycleZoom} style={({ pressed }) => [styles.zoomBtn, { opacity: pressed ? 0.6 : 1 }]}>
              <Ionicons name="search" size={14} color="#fff" />
              <Text style={styles.zoomText}>{zoomLevel}x</Text>
            </Pressable>
            {zoomLevel > 1 && (
              <Pressable onPress={resetZoom} style={({ pressed }) => [styles.zoomResetBtn, { opacity: pressed ? 0.6 : 1 }]}>
                <Ionicons name="contract-outline" size={14} color="#fff" />
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <View style={styles.controls}>
        <View style={styles.controlRow}>
          <View style={styles.sideToggle}>
            <Pressable style={[styles.sideBtn, showFront && styles.sideBtnActive]} onPress={() => setShowFront(true)}>
              <Text style={[styles.sideBtnText, showFront && styles.sideBtnTextActive]}>Front</Text>
            </Pressable>
            <Pressable style={[styles.sideBtn, !showFront && styles.sideBtnActive]} onPress={() => setShowFront(false)}>
              <Text style={[styles.sideBtnText, !showFront && styles.sideBtnTextActive]}>Back</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => setShowRotation(!showRotation)} style={({ pressed }) => [styles.toolBtn, showRotation && styles.toolBtnActive, { opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="sync-outline" size={16} color={showRotation ? "#fff" : Colors.textMuted} />
          </Pressable>
          <Pressable onPress={handleReset} style={({ pressed }) => [styles.toolBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="refresh" size={16} color={Colors.textMuted} />
          </Pressable>
        </View>

        {showRotation && (
          <View style={styles.rotRow}>
            <Pressable onPress={() => setRotation(rotClamp(rotation - 0.5))} style={({ pressed }) => [styles.rotBtn, { opacity: pressed ? 0.5 : 1 }]}>
              <Ionicons name="remove" size={14} color="#fff" />
            </Pressable>
            <View style={styles.rotTrack}>
              <View style={styles.rotTrackBg}>
                {[-10, -5, 0, 5, 10].map(t => (
                  <View key={t} style={[styles.rotTick, t === 0 && styles.rotTickCenter, { left: `${((t + 15) / 30) * 100}%` }]} />
                ))}
              </View>
              <View style={[styles.rotThumb, { left: `${((rotation + 15) / 30) * 100}%` }]} />
              <View style={styles.rotScrub} {...PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onMoveShouldSetPanResponder: () => true,
                onPanResponderGrant: (e) => { setRotation(rotClamp((e.nativeEvent.locationX / (SCREEN_WIDTH - 120)) * 30 - 15)); },
                onPanResponderMove: (e) => { setRotation(rotClamp((e.nativeEvent.locationX / (SCREEN_WIDTH - 120)) * 30 - 15)); },
              }).panHandlers} />
            </View>
            <Pressable onPress={() => setRotation(rotClamp(rotation + 0.5))} style={({ pressed }) => [styles.rotBtn, { opacity: pressed ? 0.5 : 1 }]}>
              <Ionicons name="add" size={14} color="#fff" />
            </Pressable>
            <Text style={styles.rotDeg}>{rotation > 0 ? "+" : ""}{rotation.toFixed(1)}</Text>
          </View>
        )}

        <Text style={styles.hint}>Drag lines to adjust centering</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, height: 40 },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  ratioInline: { flexDirection: "row", alignItems: "center", gap: 10 },
  ratioText: { fontFamily: "Inter_700Bold", fontSize: 14 },
  ratioDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)" },
  saveBtn: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  saveBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
  imageArea: { flex: 1, paddingHorizontal: 4, paddingVertical: 2 },
  imageViewport: { flex: 1, borderRadius: 8, overflow: "hidden", backgroundColor: Colors.surfaceLight },
  imageContainer: { width: "100%", height: "100%" },
  cardImage: { width: "100%", height: "100%" },
  linesOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },
  borderShade: { position: "absolute", backgroundColor: "rgba(255, 60, 49, 0.1)" },
  zoomBadge: { position: "absolute", bottom: 8, right: 8, flexDirection: "row", gap: 4, zIndex: 20 },
  zoomBtn: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  zoomText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#fff" },
  zoomResetBtn: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.65)", width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  panControls: { position: "absolute", bottom: 8, left: 8, zIndex: 20, gap: 1 },
  panRow: { flexDirection: "row", gap: 1 },
  panBtn: { width: 28, height: 28, borderRadius: 6, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  panSpacer: { width: 28, height: 28 },
  controls: { paddingHorizontal: 10, paddingTop: 4, paddingBottom: 4 },
  controlRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sideToggle: { flex: 1, flexDirection: "row", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 8, padding: 2 },
  sideBtn: { flex: 1, paddingVertical: 6, alignItems: "center", borderRadius: 6 },
  sideBtnActive: { backgroundColor: Colors.primary },
  sideBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.textMuted },
  sideBtnTextActive: { color: "#fff" },
  toolBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  toolBtnActive: { backgroundColor: "rgba(255,255,255,0.18)" },
  rotRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, paddingHorizontal: 4 },
  rotBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  rotTrack: { flex: 1, height: 26, justifyContent: "center", position: "relative" },
  rotTrackBg: { height: 2, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 1 },
  rotTick: { position: "absolute", top: -3, width: 1, height: 8, backgroundColor: "rgba(255,255,255,0.2)" },
  rotTickCenter: { backgroundColor: "rgba(255,255,255,0.5)", width: 1.5, height: 10, top: -4 },
  rotThumb: { position: "absolute", width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.primary, top: 7, marginLeft: -6, borderWidth: 1.5, borderColor: "#fff" },
  rotScrub: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  rotDeg: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: Colors.textSecondary, width: 32, textAlign: "right" as const },
  hint: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "center" as const, marginTop: 3, marginBottom: 2 },
});
