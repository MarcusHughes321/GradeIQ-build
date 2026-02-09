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
  const outerInset = 0.02;
  const outerLeft = imgW * outerInset;
  const outerRight = imgW * (1 - outerInset);
  const outerTop = imgH * outerInset;
  const outerBottom = imgH * (1 - outerInset);

  const cardW = outerRight - outerLeft;
  const cardH = outerBottom - outerTop;
  const avgBorderH = cardW * 0.06;
  const avgBorderV = cardH * 0.06;
  const leftBorder = avgBorderH * (lr / 50);
  const rightBorder = avgBorderH * ((100 - lr) / 50);
  const topBorder = avgBorderV * (tb / 50);
  const bottomBorder = avgBorderV * ((100 - tb) / 50);

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
}

function DragLine({ orientation, position, imgSize, color, label, dashed, onDrag, minPos, maxPos }: DragLineProps) {
  const posRef = useRef(position);
  const startRef = useRef(position);
  const cbRef = useRef(onDrag);
  const minRef = useRef(minPos);
  const maxRef = useRef(maxPos);
  posRef.current = position;
  cbRef.current = onDrag;
  minRef.current = minPos;
  maxRef.current = maxPos;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderGrant: () => { startRef.current = posRef.current; },
      onPanResponderMove: (_: GestureResponderEvent, g: PanResponderGestureState) => {
        const d = orientation === "v" ? g.dx : g.dy;
        cbRef.current(Math.max(minRef.current, Math.min(maxRef.current, startRef.current + d)));
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  if (orientation === "v") {
    return (
      <View
        style={{
          position: "absolute" as const,
          top: 0,
          left: position - LINE_HIT / 2,
          width: LINE_HIT,
          height: imgSize.height,
          zIndex: dashed ? 8 : 12,
          alignItems: "center" as const,
          justifyContent: "center" as const,
        }}
        {...pan.panHandlers}
      >
        <View style={{
          position: "absolute" as const,
          width: dashed ? 1.5 : 2.5,
          height: "100%" as const,
          left: LINE_HIT / 2 - (dashed ? 0.75 : 1.25),
          backgroundColor: color,
          opacity: dashed ? 0.6 : 1,
          ...(dashed ? { borderStyle: "dashed" as const } : {}),
        }} />
        {!dashed && (
          <View style={{
            width: 18,
            height: 36,
            borderRadius: 9,
            backgroundColor: color,
            alignItems: "center" as const,
            justifyContent: "center" as const,
          }}>
            <View style={{ gap: 3 }}>
              <View style={dot} />
              <View style={dot} />
              <View style={dot} />
            </View>
          </View>
        )}
        {dashed && (
          <View style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: color,
            opacity: 0.8,
            alignItems: "center" as const,
            justifyContent: "center" as const,
          }}>
            <View style={{ width: 6, height: 1.5, backgroundColor: "#fff", borderRadius: 1 }} />
          </View>
        )}
        <Text style={{
          position: "absolute" as const,
          top: 4,
          left: LINE_HIT / 2 + 6,
          fontFamily: "Inter_700Bold",
          fontSize: 10,
          color,
          textShadowColor: "rgba(0,0,0,0.9)",
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 3,
        }}>{label}</Text>
      </View>
    );
  }

  return (
    <View
      style={{
        position: "absolute" as const,
        left: 0,
        top: position - LINE_HIT / 2,
        width: imgSize.width,
        height: LINE_HIT,
        zIndex: dashed ? 8 : 12,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      }}
      {...pan.panHandlers}
    >
      <View style={{
        position: "absolute" as const,
        height: dashed ? 1.5 : 2.5,
        width: "100%" as const,
        top: LINE_HIT / 2 - (dashed ? 0.75 : 1.25),
        backgroundColor: color,
        opacity: dashed ? 0.6 : 1,
      }} />
      {!dashed && (
        <View style={{
          width: 36,
          height: 18,
          borderRadius: 9,
          backgroundColor: color,
          alignItems: "center" as const,
          justifyContent: "center" as const,
        }}>
          <View style={{ flexDirection: "row" as const, gap: 3 }}>
            <View style={dot} />
            <View style={dot} />
            <View style={dot} />
          </View>
        </View>
      )}
      {dashed && (
        <View style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: color,
          opacity: 0.8,
          alignItems: "center" as const,
          justifyContent: "center" as const,
        }}>
          <View style={{ width: 1.5, height: 6, backgroundColor: "#fff", borderRadius: 1 }} />
        </View>
      )}
      <Text style={{
        position: "absolute" as const,
        left: 6,
        top: LINE_HIT / 2 + 6,
        fontFamily: "Inter_700Bold",
        fontSize: 10,
        color,
        textShadowColor: "rgba(0,0,0,0.9)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      }}>{label}</Text>
    </View>
  );
}

const dot = { width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.85)" };

export default function CenteringTool({ frontImage, backImage, centering, onSave, onClose }: CenteringToolProps) {
  const insets = useSafeAreaInsets();
  const [showFront, setShowFront] = useState(true);
  const [imageLayout, setImageLayout] = useState({ width: 0, height: 0 });
  const [frontPos, setFrontPos] = useState<BorderPositions | null>(null);
  const [backPos, setBackPos] = useState<BorderPositions | null>(null);
  const initRef = useRef(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const pad = 16;
  const imgWidth = SCREEN_WIDTH - pad * 2;
  const imgHeight = imgWidth / 0.714;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setImageLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
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
  };

  const computed = useMemo((): CenteringMeasurement => {
    if (!frontPos || !backPos) return centering;
    const fr = computeRatio(frontPos);
    const br = computeRatio(backPos);
    return { frontLeftRight: fr.lr, frontTopBottom: fr.tb, backLeftRight: br.lr, backTopBottom: br.tb };
  }, [frontPos, backPos, centering]);

  const lrColor = getCenteringColor(ratio.lr);
  const tbColor = getCenteringColor(ratio.tb);
  const w = imageLayout.width;
  const h = imageLayout.height;

  const OUTER_COLOR = "rgba(255,255,255,0.7)";
  const INNER_L = "#FF3C31";
  const INNER_R = "#3B82F6";
  const INNER_T = "#F59E0B";
  const INNER_B = "#10B981";

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={onClose} style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Centering Tool</Text>
        <Pressable onPress={handleSave} style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <Ionicons name="checkmark" size={18} color="#fff" />
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </View>

      <View style={styles.ratioBar}>
        <View style={styles.ratioItem}>
          <Text style={styles.ratioLabel}>L/R</Text>
          <Text style={[styles.ratioValue, { color: lrColor }]}>{formatRatio(ratio.lr)}</Text>
        </View>
        <View style={styles.ratioSep} />
        <View style={styles.ratioItem}>
          <Text style={styles.ratioLabel}>T/B</Text>
          <Text style={[styles.ratioValue, { color: tbColor }]}>{formatRatio(ratio.tb)}</Text>
        </View>
      </View>

      <View style={styles.imageArea}>
        <View style={[styles.imageContainer, { width: imgWidth, height: imgHeight }]} onLayout={onLayout}>
          <View style={styles.imageClip}>
            <Image source={{ uri: showFront ? frontImage : backImage }} style={styles.cardImage} contentFit="contain" />
          </View>

          {pos && w > 0 && (
            <View style={styles.linesOverlay}>
              <DragLine orientation="v" position={pos.outerLeft} imgSize={imageLayout} color={OUTER_COLOR} label="" dashed onDrag={v => drag("outerLeft", v)} minPos={2} maxPos={pos.innerLeft - 4} />
              <DragLine orientation="v" position={pos.innerLeft} imgSize={imageLayout} color={INNER_L} label="L" onDrag={v => drag("innerLeft", v)} minPos={pos.outerLeft + 4} maxPos={w * 0.4} />

              <DragLine orientation="v" position={pos.outerRight} imgSize={imageLayout} color={OUTER_COLOR} label="" dashed onDrag={v => drag("outerRight", v)} minPos={pos.innerRight + 4} maxPos={w - 2} />
              <DragLine orientation="v" position={pos.innerRight} imgSize={imageLayout} color={INNER_R} label="R" onDrag={v => drag("innerRight", v)} minPos={w * 0.6} maxPos={pos.outerRight - 4} />

              <DragLine orientation="h" position={pos.outerTop} imgSize={imageLayout} color={OUTER_COLOR} label="" dashed onDrag={v => drag("outerTop", v)} minPos={2} maxPos={pos.innerTop - 4} />
              <DragLine orientation="h" position={pos.innerTop} imgSize={imageLayout} color={INNER_T} label="T" onDrag={v => drag("innerTop", v)} minPos={pos.outerTop + 4} maxPos={h * 0.4} />

              <DragLine orientation="h" position={pos.outerBottom} imgSize={imageLayout} color={OUTER_COLOR} label="" dashed onDrag={v => drag("outerBottom", v)} minPos={pos.innerBottom + 4} maxPos={h - 2} />
              <DragLine orientation="h" position={pos.innerBottom} imgSize={imageLayout} color={INNER_B} label="B" onDrag={v => drag("innerBottom", v)} minPos={h * 0.6} maxPos={pos.outerBottom - 4} />

              <View pointerEvents="none" style={[styles.borderShade, { left: pos.outerLeft, top: pos.outerTop, width: pos.innerLeft - pos.outerLeft, height: pos.outerBottom - pos.outerTop }]} />
              <View pointerEvents="none" style={[styles.borderShade, { left: pos.innerRight, top: pos.outerTop, width: pos.outerRight - pos.innerRight, height: pos.outerBottom - pos.outerTop }]} />
              <View pointerEvents="none" style={[styles.borderShade, { left: pos.innerLeft, top: pos.outerTop, width: pos.innerRight - pos.innerLeft, height: pos.innerTop - pos.outerTop }]} />
              <View pointerEvents="none" style={[styles.borderShade, { left: pos.innerLeft, top: pos.innerBottom, width: pos.innerRight - pos.innerLeft, height: pos.outerBottom - pos.innerBottom }]} />
            </View>
          )}
        </View>
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDash, { backgroundColor: "rgba(255,255,255,0.5)" }]} />
          <Text style={styles.legendText}>Card edge</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSolid, { backgroundColor: INNER_L }]} />
          <Text style={styles.legendText}>Border margin</Text>
        </View>
      </View>

      <View style={styles.sideToggle}>
        <Pressable style={[styles.sideBtn, showFront && styles.sideBtnActive]} onPress={() => setShowFront(true)}>
          <Text style={[styles.sideBtnText, showFront && styles.sideBtnTextActive]}>Front</Text>
        </Pressable>
        <Pressable style={[styles.sideBtn, !showFront && styles.sideBtnActive]} onPress={() => setShowFront(false)}>
          <Text style={[styles.sideBtnText, !showFront && styles.sideBtnTextActive]}>Back</Text>
        </Pressable>
      </View>

      <View style={styles.gradePreview}>
        <GradeRow company="PSA" front10={55} back10={75} centering={computed} />
        <GradeRow company="BGS" front10={50} back10={50} centering={computed} />
        <GradeRow company="Ace" front10={60} back10={60} centering={computed} />
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + webBottomInset + 8 }]}>
        <Pressable onPress={handleReset} style={({ pressed }) => [styles.resetBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name="refresh" size={16} color={Colors.textSecondary} />
          <Text style={styles.resetText}>Reset to AI</Text>
        </Pressable>
        <Text style={styles.hintText}>Drag lines to adjust borders</Text>
      </View>
    </View>
  );
}

interface GradeRowProps { company: string; front10: number; back10: number; centering: CenteringMeasurement; }

function GradeRow({ company, front10, back10, centering }: GradeRowProps) {
  const frontWorst = Math.max(centering.frontLeftRight, centering.frontTopBottom);
  const backWorst = Math.max(centering.backLeftRight, centering.backTopBottom);
  const passes = frontWorst <= front10 && backWorst <= back10;
  const color = passes ? "#10B981" : getCenteringColor(frontWorst);
  const label = passes ? "10 eligible" : frontWorst <= front10 + 5 ? "Close" : "Off";
  return (
    <View style={styles.gradeRow}>
      <Text style={styles.gradeCompany}>{company}</Text>
      <View style={styles.gradeReq}>
        <Text style={styles.gradeReqText}>{front10}/{100 - front10} / {back10}/{100 - back10}</Text>
      </View>
      <View style={[styles.gradeBadge, { backgroundColor: color + "20" }]}>
        <View style={[styles.gradeDot, { backgroundColor: color }]} />
        <Text style={[styles.gradeLabel, { color }]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  headerBtn: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: "#fff" },
  saveBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  saveBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
  ratioBar: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 20, paddingVertical: 8, marginHorizontal: 20, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12 },
  ratioItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  ratioLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textMuted },
  ratioValue: { fontFamily: "Inter_700Bold", fontSize: 18 },
  ratioSep: { width: 1, height: 20, backgroundColor: "rgba(255,255,255,0.15)" },
  imageArea: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 6 },
  imageContainer: { borderRadius: 10, backgroundColor: Colors.surfaceLight },
  imageClip: { width: "100%", height: "100%", borderRadius: 10, overflow: "hidden" },
  cardImage: { width: "100%", height: "100%" },
  linesOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },
  borderShade: { position: "absolute", backgroundColor: "rgba(255, 60, 49, 0.10)" },
  legend: { flexDirection: "row", justifyContent: "center", gap: 20, paddingVertical: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDash: { width: 14, height: 2, borderRadius: 1 },
  legendSolid: { width: 14, height: 3, borderRadius: 1.5 },
  legendText: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted },
  sideToggle: { flexDirection: "row", marginHorizontal: 60, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 10, padding: 3, marginVertical: 4 },
  sideBtn: { flex: 1, paddingVertical: 7, alignItems: "center", borderRadius: 8 },
  sideBtnActive: { backgroundColor: Colors.primary },
  sideBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.textMuted },
  sideBtnTextActive: { color: "#fff" },
  gradePreview: { marginHorizontal: 20, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, padding: 10, gap: 6 },
  gradeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  gradeCompany: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.textSecondary, width: 34 },
  gradeReq: { flex: 1 },
  gradeReqText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted },
  gradeBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  gradeDot: { width: 6, height: 6, borderRadius: 3 },
  gradeLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  bottomBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 6 },
  resetBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  resetText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary },
  hintText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted },
});
