import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import * as ImageManipulator from "expo-image-manipulator";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  Dimensions,
  LayoutChangeEvent,
  Platform,
  Image as RNImage,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import type { CenteringMeasurement, CardBounds, SavedLinePositions } from "@/lib/types";
import { apiRequest } from "@/lib/query-client";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface CenteringToolProps {
  frontImage: string;
  backImage: string;
  centering: CenteringMeasurement;
  originalCentering: CenteringMeasurement;
  frontCardBounds?: CardBounds;
  backCardBounds?: CardBounds;
  onSave: (centering: CenteringMeasurement) => void;
  onClose: (wasStraightened?: boolean) => void;
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

interface ImageBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_CARD_BOUNDS: CardBounds = {
  leftPercent: 2,
  topPercent: 3,
  rightPercent: 98,
  bottomPercent: 97,
};

const CARD_ASPECT_RATIO = 0.714;

const MIN_LINE_MARGIN = 12;

function restoreFromSavedPositions(saved: SavedLinePositions, imageBounds: ImageBounds): BorderPositions {
  const fromPctX = (pct: number) => imageBounds.x + imageBounds.w * (pct / 100);
  const fromPctY = (pct: number) => imageBounds.y + imageBounds.h * (pct / 100);
  return {
    outerLeft: Math.max(fromPctX(saved.outerLeftPct), MIN_LINE_MARGIN),
    innerLeft: fromPctX(saved.innerLeftPct),
    innerRight: fromPctX(saved.innerRightPct),
    outerRight: Math.min(fromPctX(saved.outerRightPct), imageBounds.x + imageBounds.w - MIN_LINE_MARGIN),
    outerTop: Math.max(fromPctY(saved.outerTopPct), MIN_LINE_MARGIN),
    innerTop: fromPctY(saved.innerTopPct),
    innerBottom: fromPctY(saved.innerBottomPct),
    outerBottom: Math.min(fromPctY(saved.outerBottomPct), imageBounds.y + imageBounds.h - MIN_LINE_MARGIN),
  };
}

function initPositions(lr: number, tb: number, imageBounds: ImageBounds, cardBounds?: CardBounds): BorderPositions {
  const cb = cardBounds || DEFAULT_CARD_BOUNDS;

  let outerLeft = imageBounds.x + imageBounds.w * (cb.leftPercent / 100);
  let outerRight = imageBounds.x + imageBounds.w * (cb.rightPercent / 100);
  let outerTop = imageBounds.y + imageBounds.h * (cb.topPercent / 100);
  let outerBottom = imageBounds.y + imageBounds.h * (cb.bottomPercent / 100);

  outerLeft = Math.max(outerLeft, MIN_LINE_MARGIN);
  outerTop = Math.max(outerTop, MIN_LINE_MARGIN);
  outerRight = Math.min(outerRight, imageBounds.x + imageBounds.w - MIN_LINE_MARGIN);
  outerBottom = Math.min(outerBottom, imageBounds.y + imageBounds.h - MIN_LINE_MARGIN);

  const cardW = outerRight - outerLeft;
  const cardH = outerBottom - outerTop;

  const hasDetectedInner = cb.innerLeftPercent != null && cb.innerRightPercent != null &&
    cb.innerTopPercent != null && cb.innerBottomPercent != null;

  let innerLeft: number, innerRight: number, innerTop: number, innerBottom: number;

  if (hasDetectedInner) {
    const detectedInnerL = imageBounds.x + imageBounds.w * (cb.innerLeftPercent! / 100);
    const detectedInnerR = imageBounds.x + imageBounds.w * (cb.innerRightPercent! / 100);
    const detectedInnerT = imageBounds.y + imageBounds.h * (cb.innerTopPercent! / 100);
    const detectedInnerB = imageBounds.y + imageBounds.h * (cb.innerBottomPercent! / 100);

    const detectedLeftBorder = detectedInnerL - outerLeft;
    const detectedRightBorder = outerRight - detectedInnerR;
    const detectedTopBorder = detectedInnerT - outerTop;
    const detectedBottomBorder = outerBottom - detectedInnerB;

    const totalBorderH = detectedLeftBorder + detectedRightBorder;
    const totalBorderV = detectedTopBorder + detectedBottomBorder;

    const leftBorder = totalBorderH * (lr / 100);
    const rightBorder = totalBorderH * ((100 - lr) / 100);
    const topBorder = totalBorderV * (tb / 100);
    const bottomBorder = totalBorderV * ((100 - tb) / 100);

    innerLeft = outerLeft + leftBorder;
    innerRight = outerRight - rightBorder;
    innerTop = outerTop + topBorder;
    innerBottom = outerBottom - bottomBorder;
  } else {
    const totalBorderH = cardW * 0.10;
    const totalBorderV = cardH * 0.07;

    const leftBorder = totalBorderH * (lr / 100);
    const rightBorder = totalBorderH * ((100 - lr) / 100);
    const topBorder = totalBorderV * (tb / 100);
    const bottomBorder = totalBorderV * ((100 - tb) / 100);

    innerLeft = outerLeft + leftBorder;
    innerRight = outerRight - rightBorder;
    innerTop = outerTop + topBorder;
    innerBottom = outerBottom - bottomBorder;
  }

  return {
    outerLeft,
    innerLeft,
    innerRight,
    outerRight,
    outerTop,
    innerTop,
    innerBottom,
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
    lr: Math.max(5, Math.min(95, lrRaw)),
    tb: Math.max(5, Math.min(95, tbRaw)),
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

function calcContainBounds(containerW: number, containerH: number, naturalW: number, naturalH: number): ImageBounds {
  if (!naturalW || !naturalH || !containerW || !containerH) {
    return { x: 0, y: 0, w: containerW, h: containerH };
  }
  const imgAspect = naturalW / naturalH;
  const containerAspect = containerW / containerH;

  if (imgAspect > containerAspect) {
    const w = containerW;
    const h = containerW / imgAspect;
    return { x: 0, y: (containerH - h) / 2, w, h };
  } else {
    const h = containerH;
    const w = containerH * imgAspect;
    return { x: (containerW - w) / 2, y: 0, w, h };
  }
}

const HANDLE_OFFSET_INNER = 0.5;
const HANDLE_OFFSET_OUTER = 0.5;
const TENTATIVE_MOVE_THRESHOLD_BASE = 6;

type LineKey = "outerLeft" | "innerLeft" | "outerRight" | "innerRight" | "outerTop" | "innerTop" | "outerBottom" | "innerBottom";

interface LineConfig {
  key: LineKey;
  orientation: "h" | "v";
  color: string;
  label: string;
  isOuter: boolean;
}

const LINE_CONFIGS: LineConfig[] = [
  { key: "outerLeft", orientation: "v", color: "#FF3C31", label: "", isOuter: true },
  { key: "innerLeft", orientation: "v", color: "#FF3C31", label: "L", isOuter: false },
  { key: "outerRight", orientation: "v", color: "#3B82F6", label: "", isOuter: true },
  { key: "innerRight", orientation: "v", color: "#3B82F6", label: "R", isOuter: false },
  { key: "outerTop", orientation: "h", color: "#F59E0B", label: "", isOuter: true },
  { key: "innerTop", orientation: "h", color: "#F59E0B", label: "T", isOuter: false },
  { key: "outerBottom", orientation: "h", color: "#10B981", label: "", isOuter: true },
  { key: "innerBottom", orientation: "h", color: "#10B981", label: "B", isOuter: false },
];

function getTouchDistance(touches: any[]): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getHandleOffset(config: LineConfig): number {
  return config.isOuter ? HANDLE_OFFSET_OUTER : HANDLE_OFFSET_INNER;
}

interface LineCandidate { key: LineKey; dist: number; orientation: "v" | "h"; }

const LINE_PAIRS: [LineKey, LineKey][] = [
  ["outerLeft", "innerLeft"],
  ["outerRight", "innerRight"],
  ["outerTop", "innerTop"],
  ["outerBottom", "innerBottom"],
];

function findNearLines(
  x: number, y: number, pos: BorderPositions,
  containerW: number, containerH: number, scale: number
): LineCandidate[] {
  const lineTouchPad = Math.max(28, 52 / scale);
  const candidates: LineCandidate[] = [];

  for (const config of LINE_CONFIGS) {
    const linePos = pos[config.key];

    if (config.orientation === "v") {
      const dx = Math.abs(x - linePos);
      if (dx <= lineTouchPad && y >= 0 && y <= containerH) {
        candidates.push({ key: config.key, dist: dx, orientation: "v" });
      }
    } else {
      const dy = Math.abs(y - linePos);
      if (dy <= lineTouchPad && x >= 0 && x <= containerW) {
        candidates.push({ key: config.key, dist: dy, orientation: "h" });
      }
    }
  }

  for (const [outerKey, innerKey] of LINE_PAIRS) {
    const outerCand = candidates.find(c => c.key === outerKey);
    const innerCand = candidates.find(c => c.key === innerKey);
    if (outerCand && innerCand) {
      const outerPos = pos[outerKey];
      const innerPos = pos[innerKey];
      const midpoint = (outerPos + innerPos) / 2;
      const touchCoord = outerCand.orientation === "v" ? x : y;

      const outerIsLarger = outerPos > innerPos;
      const touchOnOuterSide = outerIsLarger ? touchCoord >= midpoint : touchCoord <= midpoint;

      if (touchOnOuterSide) {
        const idx = candidates.indexOf(innerCand);
        if (idx >= 0) candidates.splice(idx, 1);
      } else {
        const idx = candidates.indexOf(outerCand);
        if (idx >= 0) candidates.splice(idx, 1);
      }
    }
  }

  const CROSS_PAIRS: [LineKey, LineKey][] = [
    ["innerTop", "innerBottom"],
    ["outerTop", "outerBottom"],
    ["innerLeft", "innerRight"],
    ["outerLeft", "outerRight"],
  ];
  for (const [keyA, keyB] of CROSS_PAIRS) {
    const candA = candidates.find(c => c.key === keyA);
    const candB = candidates.find(c => c.key === keyB);
    if (candA && candB) {
      const posA = pos[keyA];
      const posB = pos[keyB];
      const midpoint = (posA + posB) / 2;
      const touchCoord = candA.orientation === "v" ? x : y;

      if (touchCoord <= midpoint) {
        const smaller = posA < posB ? keyA : keyB;
        const larger = posA < posB ? keyB : keyA;
        const idxToRemove = candidates.findIndex(c => c.key === larger);
        if (idxToRemove >= 0) candidates.splice(idxToRemove, 1);
      } else {
        const smaller = posA < posB ? keyA : keyB;
        const larger = posA < posB ? keyB : keyA;
        const idxToRemove = candidates.findIndex(c => c.key === smaller);
        if (idxToRemove >= 0) candidates.splice(idxToRemove, 1);
      }
    }
  }

  candidates.sort((a, b) => a.dist - b.dist);
  return candidates;
}

function getLineMinMax(key: LineKey, pos: BorderPositions, cw: number, ch: number): { min: number; max: number } {
  switch (key) {
    case "outerLeft": return { min: 0, max: pos.innerLeft - 4 };
    case "innerLeft": return { min: pos.outerLeft + 4, max: cw * 0.45 };
    case "outerRight": return { min: pos.innerRight + 4, max: cw };
    case "innerRight": return { min: cw * 0.55, max: pos.outerRight - 4 };
    case "outerTop": return { min: 0, max: pos.innerTop - 4 };
    case "innerTop": return { min: pos.outerTop + 4, max: ch * 0.45 };
    case "outerBottom": return { min: pos.innerBottom + 4, max: ch };
    case "innerBottom": return { min: ch * 0.55, max: pos.outerBottom - 4 };
  }
}

function isVLine(key: LineKey): boolean {
  return key === "outerLeft" || key === "innerLeft" || key === "outerRight" || key === "innerRight";
}

function viewportToContainer(
  lx: number, ly: number,
  scale: number, px: number, py: number,
  cw: number, ch: number
): { x: number; y: number } {
  return {
    x: (lx - px - cw / 2) / scale + cw / 2,
    y: (ly - py - ch / 2) / scale + ch / 2,
  };
}

const HANDLE_W = 16;
const HANDLE_H = 32;

interface ViewportInfo {
  scale: number;
  panX: number;
  panY: number;
}

function getVisibleCenter(
  config: LineConfig,
  containerSize: { width: number; height: number },
  viewport: ViewportInfo
): number {
  if (viewport.scale <= 1.05) return 0.5;

  const s = viewport.scale;
  const cw = containerSize.width;
  const ch = containerSize.height;

  if (config.orientation === "v") {
    const centerContainerY = ch / 2 - viewport.panY / s;
    const fraction = Math.max(0.1, Math.min(0.9, centerContainerY / ch));
    return fraction;
  } else {
    const centerContainerX = cw / 2 - viewport.panX / s;
    const fraction = Math.max(0.1, Math.min(0.9, centerContainerX / cw));
    return fraction;
  }
}

function renderLine(
  config: LineConfig, pos: number,
  containerSize: { width: number; height: number },
  isActive?: boolean, viewport?: ViewportInfo
) {
  const lineW = isActive ? 3 : (config.isOuter ? 2 : 2.5);
  const opacity = isActive ? 0.7 : (config.isOuter ? 0.45 : 0.6);
  const s = viewport?.scale ?? 1;
  const sizeScale = s > 1.05 ? 1 / s : 1;
  const activeScale = isActive ? 1.4 : 1;
  const handleW = HANDLE_W * activeScale * sizeScale;
  const handleH = HANDLE_H * activeScale * sizeScale;
  const handleCenter = viewport ? getVisibleCenter(config, containerSize, viewport) : 0.5;

  if (config.orientation === "v") {
    const handleTop = containerSize.height * handleCenter - handleH / 2;
    return (
      <React.Fragment key={config.key}>
        <View
          style={{
            position: "absolute" as const,
            top: 0,
            left: pos - lineW / 2,
            width: lineW,
            height: containerSize.height,
            backgroundColor: config.color,
            opacity,
            zIndex: config.isOuter ? 8 : 12,
          }}
          pointerEvents="none"
        />
        <View
          style={{
            position: "absolute" as const,
            left: pos - handleW / 2,
            top: handleTop,
            width: handleW,
            height: handleH,
            borderRadius: handleW / 2,
            backgroundColor: isActive ? config.color + "AA" : config.color + "55",
            borderWidth: isActive ? 2 : 1.5,
            borderColor: isActive ? "#fff" : config.color + "AA",
            zIndex: config.isOuter ? 9 : 13,
          }}
          pointerEvents="none"
        />
      </React.Fragment>
    );
  }

  const handleLeft = containerSize.width * handleCenter - handleH / 2;
  return (
    <React.Fragment key={config.key}>
      <View
        style={{
          position: "absolute" as const,
          left: 0,
          top: pos - lineW / 2,
          width: containerSize.width,
          height: lineW,
          backgroundColor: config.color,
          opacity,
          zIndex: config.isOuter ? 8 : 12,
        }}
        pointerEvents="none"
      />
      <View
        style={{
          position: "absolute" as const,
          left: handleLeft,
          top: pos - handleW / 2,
          width: handleH,
          height: handleW,
          borderRadius: handleW / 2,
          backgroundColor: isActive ? config.color + "AA" : config.color + "55",
          borderWidth: isActive ? 2 : 1.5,
          borderColor: isActive ? "#fff" : config.color + "AA",
          zIndex: config.isOuter ? 9 : 13,
        }}
        pointerEvents="none"
      />
    </React.Fragment>
  );
}

function HatchPattern({ width: w, height: h, color }: { width: number; height: number; color: string }) {
  if (w <= 1 || h <= 1) return null;
  const spacing = 5;
  const diagSpan = w + h;
  const lineLen = Math.sqrt(w * w + h * h) + 10;
  const count = Math.min(Math.ceil(diagSpan / spacing), 80);
  const stripes: React.ReactNode[] = [];

  for (let i = 0; i < count; i++) {
    const offset = i * spacing;
    stripes.push(
      <View
        key={i}
        style={{
          position: "absolute" as const,
          left: offset - h,
          top: -5,
          width: 1,
          height: lineLen,
          backgroundColor: color,
          opacity: 0.25,
          transform: [{ rotate: "45deg" }],
        }}
      />
    );
  }

  return <>{stripes}</>;
}

function renderHatchOverlay(pos: BorderPositions, _containerSize: { width: number; height: number }) {
  const zones = [
    { key: "hatch-left", left: pos.outerLeft, top: pos.outerTop, w: Math.max(0, pos.innerLeft - pos.outerLeft), h: Math.max(0, pos.outerBottom - pos.outerTop), color: "#FF3C31" },
    { key: "hatch-right", left: pos.innerRight, top: pos.outerTop, w: Math.max(0, pos.outerRight - pos.innerRight), h: Math.max(0, pos.outerBottom - pos.outerTop), color: "#3B82F6" },
    { key: "hatch-top", left: pos.innerLeft, top: pos.outerTop, w: Math.max(0, pos.innerRight - pos.innerLeft), h: Math.max(0, pos.innerTop - pos.outerTop), color: "#F59E0B" },
    { key: "hatch-bottom", left: pos.innerLeft, top: pos.innerBottom, w: Math.max(0, pos.innerRight - pos.innerLeft), h: Math.max(0, pos.outerBottom - pos.innerBottom), color: "#10B981" },
  ];

  return (
    <>
      {zones.map(z => (
        <View
          key={z.key}
          style={{
            position: "absolute" as const,
            left: z.left,
            top: z.top,
            width: z.w,
            height: z.h,
            overflow: "hidden" as const,
            zIndex: 6,
          }}
          pointerEvents="none"
        >
          <HatchPattern width={z.w} height={z.h} color={z.color} />
        </View>
      ))}
    </>
  );
}

function HelpOverlay({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const steps = [
    {
      icon: "finger-print-outline" as const,
      title: "Drag handles",
      desc: "Touch near a coloured handle and drag perpendicular to the line to move it. Dragging parallel to the line will pan the image instead. You'll feel a small vibration when a handle is grabbed.",
    },
    {
      icon: "expand-outline" as const,
      title: "Pinch to zoom",
      desc: "Use two fingers to pinch-zoom for fine adjustments. Swipe with one finger to pan around when zoomed in.",
    },
    {
      icon: "sync-outline" as const,
      title: "Rotate button",
      desc: "Opens the rotation slider below the controls. Use it to manually straighten your card if the photo is slightly tilted. Tap \u2212 or + for fine 0.5\u00B0 adjustments.",
    },
    {
      icon: "magnet-outline" as const,
      title: "Straighten button",
      desc: "Automatically detects the card's tilt and corrects it. Only adjusts the rotation \u2014 does not move the lines. Works best on cards placed on a contrasting background.",
    },
    {
      icon: "refresh" as const,
      title: "Reset button",
      desc: "Restores all line positions and rotation back to the original AI-detected values.",
    },
    {
      icon: "color-palette-outline" as const,
      title: "Line colours",
      desc: "Red/blue lines mark the card's outer edges. Green/yellow lines mark the artwork border inside the card. The gap between them is the centering measurement.",
    },
  ];

  return (
    <View style={helpStyles.overlay}>
      <View style={[helpStyles.container, { paddingTop: insets.top + webTopInset + 20, paddingBottom: insets.bottom + webBottomInset + 20 }]}>
        <View style={helpStyles.header}>
          <Text style={helpStyles.title}>How to use the Centering Tool</Text>
          <Pressable onPress={onClose} style={({ pressed }) => [helpStyles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>

        <ScrollView style={helpStyles.scrollArea} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
          {steps.map((step, i) => (
            <View key={i} style={helpStyles.stepRow}>
              <View style={helpStyles.stepIconWrap}>
                <Ionicons name={step.icon} size={20} color={Colors.primary} />
              </View>
              <View style={helpStyles.stepContent}>
                <Text style={helpStyles.stepTitle}>{step.title}</Text>
                <Text style={helpStyles.stepDesc}>{step.desc}</Text>
              </View>
            </View>
          ))}

          <View style={helpStyles.tipBox}>
            <Ionicons name="bulb-outline" size={16} color="#F59E0B" />
            <Text style={helpStyles.tipText}>
              For the most accurate centering measurement, zoom in close and align lines precisely with the card edges. The L/R and T/B ratios update in real-time as you adjust.
            </Text>
          </View>
        </ScrollView>

        <Pressable onPress={onClose} style={({ pressed }) => [helpStyles.gotItBtn, { opacity: pressed ? 0.85 : 1 }]}>
          <Text style={helpStyles.gotItText}>Got it</Text>
        </Pressable>
      </View>
    </View>
  );
}

const helpStyles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.85)", zIndex: 100, justifyContent: "center" },
  container: { flex: 1, paddingHorizontal: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  title: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff", flex: 1 },
  closeBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  scrollArea: { flex: 1 },
  stepRow: { flexDirection: "row", gap: 14, marginBottom: 18 },
  stepIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,60,49,0.12)", alignItems: "center", justifyContent: "center", marginTop: 2 },
  stepContent: { flex: 1 },
  stepTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff", marginBottom: 4 },
  stepDesc: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 19 },
  tipBox: { flexDirection: "row", gap: 10, backgroundColor: "rgba(245,158,11,0.1)", borderRadius: 12, padding: 14, marginTop: 8, borderWidth: 1, borderColor: "rgba(245,158,11,0.2)" },
  tipText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 18 },
  gotItBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 12 },
  gotItText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" },
});

export default function CenteringTool({ frontImage, backImage, centering, originalCentering, frontCardBounds, backCardBounds, onSave, onClose }: CenteringToolProps) {
  const insets = useSafeAreaInsets();
  const [showFront, setShowFront] = useState(true);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [frontNatural, setFrontNatural] = useState({ w: 0, h: 0 });
  const [backNatural, setBackNatural] = useState({ w: 0, h: 0 });
  const frontNaturalRef = useRef({ w: 0, h: 0 });
  const backNaturalRef = useRef({ w: 0, h: 0 });
  const [frontPos, setFrontPos] = useState<BorderPositions | null>(null);
  const [backPos, setBackPos] = useState<BorderPositions | null>(null);
  const frontPosInitRef = useRef(false);
  const backPosInitRef = useRef(false);
  const frontUsedFallbackRef = useRef(false);
  const backUsedFallbackRef = useRef(false);
  const frontLoadLoggedRef = useRef(false);
  const backLoadLoggedRef = useRef(false);
  const [frontRotation, setFrontRotation] = useState(centering.frontRotation ?? 0);
  const [backRotation, setBackRotation] = useState(centering.backRotation ?? 0);
  const [showRotation, setShowRotation] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [showHelp, setShowHelp] = useState(false);
  const [activeHandle, setActiveHandle] = useState<LineKey | null>(null);
  const [autoStraightening, setAutoStraightening] = useState(false);
  const wasStraightenedRef = useRef(false);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const autoDetectTriggeredRef = useRef(false);

  const rotation = showFront ? frontRotation : backRotation;
  const setRotation = showFront ? setFrontRotation : setBackRotation;

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  useEffect(() => {
    const loadDimensions = (uri: string, setter: (d: { w: number; h: number }) => void) => {
      if (!uri) return;
      try {
        RNImage.getSize(uri, (w, h) => { if (w > 0 && h > 0) setter({ w, h }); }, () => {});
      } catch (e) {}
    };
    loadDimensions(frontImage, (v) => { setFrontNatural(v); frontNaturalRef.current = v; });
    loadDimensions(backImage, (v) => { setBackNatural(v); backNaturalRef.current = v; });
  }, [frontImage, backImage]);

  const doInitFront = useCallback((cw: number, ch: number, nw: number, nh: number, isFallback?: boolean) => {
    if (frontPosInitRef.current && !frontUsedFallbackRef.current) return;
    if (frontPosInitRef.current && frontUsedFallbackRef.current && isFallback) return;
    frontPosInitRef.current = true;
    frontUsedFallbackRef.current = !!isFallback;
    const bounds = calcContainBounds(cw, ch, nw, nh);
    if (centering.frontLinePositions) {
      setFrontPos(restoreFromSavedPositions(centering.frontLinePositions, bounds));
    } else {
      setFrontPos(initPositions(centering.frontLeftRight, centering.frontTopBottom, bounds, frontCardBounds));
    }
  }, [centering, frontCardBounds]);

  const doInitBack = useCallback((cw: number, ch: number, nw: number, nh: number, isFallback?: boolean) => {
    if (backPosInitRef.current && !backUsedFallbackRef.current) return;
    if (backPosInitRef.current && backUsedFallbackRef.current && isFallback) return;
    backPosInitRef.current = true;
    backUsedFallbackRef.current = !!isFallback;
    const bounds = calcContainBounds(cw, ch, nw, nh);
    if (centering.backLinePositions) {
      setBackPos(restoreFromSavedPositions(centering.backLinePositions, bounds));
    } else {
      setBackPos(initPositions(centering.backLeftRight, centering.backTopBottom, bounds, backCardBounds));
    }
  }, [centering, backCardBounds]);

  useEffect(() => {
    if (containerSize.width > 0 && frontNatural.w > 0) {
      doInitFront(containerSize.width, containerSize.height, frontNatural.w, frontNatural.h);
    }
  }, [containerSize, frontNatural]);

  useEffect(() => {
    if (containerSize.width > 0 && backNatural.w > 0) {
      doInitBack(containerSize.width, containerSize.height, backNatural.w, backNatural.h);
    }
  }, [containerSize, backNatural]);

  useEffect(() => {
    if (containerSize.width > 0) {
      const timer = setTimeout(() => {
        if (!frontPosInitRef.current) {
          const fallbackW = containerSize.height * CARD_ASPECT_RATIO;
          doInitFront(containerSize.width, containerSize.height, fallbackW, containerSize.height, true);
        }
        if (!backPosInitRef.current) {
          const fallbackW = containerSize.height * CARD_ASPECT_RATIO;
          doInitBack(containerSize.width, containerSize.height, fallbackW, containerSize.height, true);
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [containerSize]);

  // Auto re-detect card bounds when opened with default (undetected) bounds
  useEffect(() => {
    if (autoDetectTriggeredRef.current) return;
    if (!frontPos || !backPos) return;
    if (containerSize.width === 0) return;

    const isDefaultLike = (b?: CardBounds) =>
      !b ||
      (Math.abs(b.leftPercent - DEFAULT_CARD_BOUNDS.leftPercent) < 2 &&
        Math.abs(b.rightPercent - DEFAULT_CARD_BOUNDS.rightPercent) < 2);

    const frontNeedsDetect = isDefaultLike(frontCardBounds);
    const backNeedsDetect = isDefaultLike(backCardBounds);

    if (!frontNeedsDetect && !backNeedsDetect) return;

    autoDetectTriggeredRef.current = true;

    const getBase64 = async (uri: string): Promise<string | null> => {
      try {
        const r = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 400 } }],
          { compress: 0.5, base64: true }
        );
        return `data:image/jpeg;base64,${r.base64}`;
      } catch {
        return null;
      }
    };

    const run = async () => {
      setAutoDetecting(true);
      try {
        const frontB64 = frontNeedsDetect ? await getBase64(frontImage) : null;

        let newFrontBounds: CardBounds | null = null;
        if (frontB64) {
          try {
            const resp = await apiRequest("POST", "/api/detect-bounds", { image: frontB64 });
            const b = await resp.json();
            if (b && b.leftPercent != null) newFrontBounds = b;
          } catch {}
        }

        let newBackBounds: CardBounds | null = null;
        if (backNeedsDetect) {
          await new Promise(r => setTimeout(r, 600));
          const backB64 = await getBase64(backImage);
          if (backB64) {
            try {
              const resp = await apiRequest("POST", "/api/detect-bounds", { image: backB64 });
              const b = await resp.json();
              if (b && b.leftPercent != null) newBackBounds = b;
            } catch {}
          }
        }

        if (newFrontBounds && frontNaturalRef.current.w > 0) {
          const { w, h } = frontNaturalRef.current;
          const imgB = calcContainBounds(containerSize.width, containerSize.height, w, h);
          setFrontPos(initPositions(centering.frontLeftRight, centering.frontTopBottom, imgB, newFrontBounds));
        }
        if (newBackBounds && backNaturalRef.current.w > 0) {
          const { w, h } = backNaturalRef.current;
          const imgB = calcContainBounds(containerSize.width, containerSize.height, w, h);
          setBackPos(initPositions(centering.backLeftRight, centering.backTopBottom, imgB, newBackBounds));
        }
      } finally {
        setAutoDetecting(false);
      }
    };

    void run();
  }, [frontPos, backPos]);

  const viewportRef = useRef<View>(null);

  const measureViewport = useCallback(() => {
    if (viewportRef.current) {
      viewportRef.current.measureInWindow((x, y) => {
        if (x != null && y != null) {
          viewportLayoutRef.current = { x, y };
        }
      });
    }
  }, []);

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setContainerSize({ width, height });
      setTimeout(() => measureViewport(), 50);
    }
  }, [measureViewport]);

  const handleFrontLoad = useCallback((e: any) => {
    if (frontLoadLoggedRef.current) return;
    frontLoadLoggedRef.current = true;
    const w = e?.source?.width || e?.nativeEvent?.source?.width || 0;
    const h = e?.source?.height || e?.nativeEvent?.source?.height || 0;
    if (w > 0 && h > 0) {
      setFrontNatural(prev => prev.w > 0 ? prev : { w, h });
    }
  }, []);

  const handleBackLoad = useCallback((e: any) => {
    if (backLoadLoggedRef.current) return;
    backLoadLoggedRef.current = true;
    const w = e?.source?.width || e?.nativeEvent?.source?.width || 0;
    const h = e?.source?.height || e?.nativeEvent?.source?.height || 0;
    if (w > 0 && h > 0) {
      setBackNatural(prev => prev.w > 0 ? prev : { w, h });
    }
  }, []);

  const pos = showFront ? frontPos : backPos;

  const ratio = useMemo(() => {
    if (!pos) return { lr: 50, tb: 50 };
    return computeRatio(pos);
  }, [pos]);

  const posToLinePositions = (p: BorderPositions, imgBounds: ImageBounds): SavedLinePositions => {
    const toPctX = (v: number) => imgBounds.w > 0 ? ((v - imgBounds.x) / imgBounds.w) * 100 : 0;
    const toPctY = (v: number) => imgBounds.h > 0 ? ((v - imgBounds.y) / imgBounds.h) * 100 : 0;
    return {
      outerLeftPct: toPctX(p.outerLeft),
      innerLeftPct: toPctX(p.innerLeft),
      innerRightPct: toPctX(p.innerRight),
      outerRightPct: toPctX(p.outerRight),
      outerTopPct: toPctY(p.outerTop),
      innerTopPct: toPctY(p.innerTop),
      innerBottomPct: toPctY(p.innerBottom),
      outerBottomPct: toPctY(p.outerBottom),
    };
  };

  const handleSave = () => {
    if (!frontPos || !backPos) return;
    const fr = computeRatio(frontPos);
    const br = computeRatio(backPos);

    const fallbackW = containerSize.height * CARD_ASPECT_RATIO;
    const fBounds = calcContainBounds(containerSize.width, containerSize.height, frontNatural.w || fallbackW, frontNatural.h || containerSize.height);
    const bBounds = calcContainBounds(containerSize.width, containerSize.height, backNatural.w || fallbackW, backNatural.h || containerSize.height);

    onSave({
      frontLeftRight: fr.lr,
      frontTopBottom: fr.tb,
      backLeftRight: br.lr,
      backTopBottom: br.tb,
      frontLinePositions: posToLinePositions(frontPos, fBounds),
      backLinePositions: posToLinePositions(backPos, bBounds),
      frontRotation,
      backRotation,
    });
  };

  const handleReset = () => {
    if (containerSize.width === 0) return;
    const fallbackW = containerSize.height * CARD_ASPECT_RATIO;
    const fw = frontNatural.w || fallbackW;
    const fh = frontNatural.h || containerSize.height;
    const bw = backNatural.w || fallbackW;
    const bh = backNatural.h || containerSize.height;
    const fb = calcContainBounds(containerSize.width, containerSize.height, fw, fh);
    const bb = calcContainBounds(containerSize.width, containerSize.height, bw, bh);
    frontPosInitRef.current = false;
    backPosInitRef.current = false;
    frontUsedFallbackRef.current = false;
    backUsedFallbackRef.current = false;
    const oc = originalCentering;
    setFrontPos(initPositions(oc.frontLeftRight, oc.frontTopBottom, fb, frontCardBounds));
    setBackPos(initPositions(oc.backLeftRight, oc.backTopBottom, bb, backCardBounds));
    frontPosInitRef.current = true;
    backPosInitRef.current = true;
    setFrontRotation(0);
    setBackRotation(0);
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    const fr = computeRatio(initPositions(oc.frontLeftRight, oc.frontTopBottom, fb, frontCardBounds));
    const br = computeRatio(initPositions(oc.backLeftRight, oc.backTopBottom, bb, backCardBounds));
    onSave({ frontLeftRight: fr.lr, frontTopBottom: fr.tb, backLeftRight: br.lr, backTopBottom: br.tb });
  };

  const getBase64FromUri = async (uri: string): Promise<string> => {
    if (uri.startsWith("data:")) return uri;
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const repositionLinesWithBounds = useCallback((newBounds: CardBounds) => {
    if (containerSize.width <= 0) return;
    const nat = showFront ? frontNatural : backNatural;
    const nw = nat.w || containerSize.height * CARD_ASPECT_RATIO;
    const nh = nat.h || containerSize.height;
    const imgBounds = calcContainBounds(containerSize.width, containerSize.height, nw, nh);

    const currentPos = showFront ? frontPos : backPos;

    const newOuterLeft = imgBounds.x + imgBounds.w * (newBounds.leftPercent / 100);
    const newOuterRight = imgBounds.x + imgBounds.w * (newBounds.rightPercent / 100);
    const newOuterTop = imgBounds.y + imgBounds.h * (newBounds.topPercent / 100);
    const newOuterBottom = imgBounds.y + imgBounds.h * (newBounds.bottomPercent / 100);

    let innerLeftOffset: number;
    let innerRightOffset: number;
    let innerTopOffset: number;
    let innerBottomOffset: number;

    if (currentPos) {
      const oldCardW = currentPos.outerRight - currentPos.outerLeft;
      const oldCardH = currentPos.outerBottom - currentPos.outerTop;
      const newCardW = newOuterRight - newOuterLeft;
      const newCardH = newOuterBottom - newOuterTop;
      const scaleX = oldCardW > 0 ? newCardW / oldCardW : 1;
      const scaleY = oldCardH > 0 ? newCardH / oldCardH : 1;
      innerLeftOffset = (currentPos.innerLeft - currentPos.outerLeft) * scaleX;
      innerRightOffset = (currentPos.outerRight - currentPos.innerRight) * scaleX;
      innerTopOffset = (currentPos.innerTop - currentPos.outerTop) * scaleY;
      innerBottomOffset = (currentPos.outerBottom - currentPos.innerBottom) * scaleY;
    } else {
      const cardW = newOuterRight - newOuterLeft;
      const cardH = newOuterBottom - newOuterTop;
      innerLeftOffset = cardW * 0.05;
      innerRightOffset = cardW * 0.05;
      innerTopOffset = cardH * 0.035;
      innerBottomOffset = cardH * 0.035;
    }

    const newPos: BorderPositions = {
      outerLeft: Math.max(newOuterLeft, MIN_LINE_MARGIN),
      innerLeft: newOuterLeft + innerLeftOffset,
      innerRight: newOuterRight - innerRightOffset,
      outerRight: Math.min(newOuterRight, imgBounds.x + imgBounds.w - MIN_LINE_MARGIN),
      outerTop: Math.max(newOuterTop, MIN_LINE_MARGIN),
      innerTop: newOuterTop + innerTopOffset,
      innerBottom: newOuterBottom - innerBottomOffset,
      outerBottom: Math.min(newOuterBottom, imgBounds.y + imgBounds.h - MIN_LINE_MARGIN),
    };

    if (showFront) {
      setFrontPos(newPos);
    } else {
      setBackPos(newPos);
    }
  }, [containerSize, showFront, frontNatural, backNatural, frontPos, backPos]);

  const handleAutoStraighten = async () => {
    const imageUri = showFront ? frontImage : backImage;
    if (!imageUri || autoStraightening) return;

    setAutoStraightening(true);
    try {
      const base64 = await getBase64FromUri(imageUri);
      const currentBounds = showFront ? frontCardBounds : backCardBounds;
      const response = await apiRequest("POST", "/api/detect-angle", { image: base64, bounds: currentBounds });
      const data = await response.json();
      const angle = data.angle || 0;

      const correctedAngle = -angle;
      const newRotation = Math.max(-15, Math.min(15, Math.round(correctedAngle * 10) / 10));
      setRotation(newRotation);
      setShowRotation(true);
      if (Math.abs(newRotation) > 0.1) {
        wasStraightenedRef.current = true;
      }
    } catch (err) {
      console.error("Auto-straighten failed:", err);
      setShowRotation(true);
    } finally {
      setAutoStraightening(false);
    }
  };

  const pinchStartDistRef = useRef(0);
  const pinchStartScaleRef = useRef(1);
  const panStartOffRef = useRef({ x: 0, y: 0 });
  const zoomScaleRef = useRef(1);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const containerSizeRef = useRef(containerSize);
  const posRef = useRef(pos);
  const showFrontRef = useRef(showFront);
  const setFrontPosRef = useRef(setFrontPos);
  const setBackPosRef = useRef(setBackPos);
  const onSaveRef = useRef(onSave);
  const frontPosRef = useRef(frontPos);
  const backPosRef = useRef(backPos);
  const setActiveHandleRef = useRef(setActiveHandle);
  const frontRotationRef = useRef(frontRotation);
  const backRotationRef = useRef(backRotation);
  zoomScaleRef.current = zoomScale;
  panOffsetRef.current = panOffset;
  containerSizeRef.current = containerSize;
  posRef.current = pos;
  showFrontRef.current = showFront;
  setFrontPosRef.current = setFrontPos;
  setBackPosRef.current = setBackPos;
  onSaveRef.current = onSave;
  frontPosRef.current = frontPos;
  backPosRef.current = backPos;
  setActiveHandleRef.current = setActiveHandle;
  frontRotationRef.current = frontRotation;
  backRotationRef.current = backRotation;

  const viewportLayoutRef = useRef({ x: 0, y: 0 });

  const gestureMode = useRef<"none" | "pinch" | "pan" | "drag" | "tentative">("none");
  const dragLineKey = useRef<LineKey | null>(null);
  const dragTouchOffset = useRef(0);
  const viewportOriginRef = useRef({ x: 0, y: 0 });
  const pageOriginRef = useRef({ x: 0, y: 0 });
  const tentativeCandidatesRef = useRef<LineCandidate[]>([]);
  const tentativeTouchRef = useRef<{ containerX: number; containerY: number }>({ containerX: 0, containerY: 0 });
  const didDragRef = useRef(false);
  const hapticFiredRef = useRef(false);

  const fireHaptic = () => {
    if (!hapticFiredRef.current) {
      hapticFiredRef.current = true;
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    }
  };

  const viewportPan = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: (evt) => {
        return evt.nativeEvent.touches.length >= 2;
      },
      onMoveShouldSetPanResponderCapture: (evt) => {
        return evt.nativeEvent.touches.length >= 2;
      },
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        didDragRef.current = false;
        hapticFiredRef.current = false;

        if (viewportRef.current) {
          viewportRef.current.measureInWindow((mx, my) => {
            if (mx != null && my != null) {
              viewportLayoutRef.current = { x: mx, y: my };
            }
          });
        }

        if (touches.length >= 2) {
          gestureMode.current = "pinch";
          pinchStartDistRef.current = getTouchDistance(touches);
          pinchStartScaleRef.current = zoomScaleRef.current;
          panStartOffRef.current = { ...panOffsetRef.current };
          setActiveHandleRef.current(null);
          return;
        }

        const scale = zoomScaleRef.current;
        const cs = containerSizeRef.current;
        const px = panOffsetRef.current.x;
        const py = panOffsetRef.current.y;
        const pageX = evt.nativeEvent.pageX;
        const pageY = evt.nativeEvent.pageY;
        const vl = viewportLayoutRef.current;
        const lx = pageX - vl.x;
        const ly = pageY - vl.y;

        viewportOriginRef.current = { x: lx, y: ly };
        pageOriginRef.current = { x: pageX, y: pageY };
        panStartOffRef.current = { ...panOffsetRef.current };

        const { x: containerX, y: containerY } = viewportToContainer(lx, ly, scale, px, py, cs.width, cs.height);

        const currentPos = posRef.current;
        if (currentPos) {
          const candidates = findNearLines(containerX, containerY, currentPos, cs.width, cs.height, scale);
          if (candidates.length > 0) {
            gestureMode.current = "tentative";
            tentativeCandidatesRef.current = candidates;
            tentativeTouchRef.current = { containerX, containerY };
            setActiveHandleRef.current(candidates[0].key);
            return;
          }
        }

        if (scale > 1.05) {
          gestureMode.current = "pan";
        } else {
          gestureMode.current = "none";
        }
        setActiveHandleRef.current(null);
      },
      onPanResponderMove: (evt, g) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2) {
          if (gestureMode.current !== "pinch") {
            gestureMode.current = "pinch";
            pinchStartDistRef.current = getTouchDistance(touches);
            pinchStartScaleRef.current = zoomScaleRef.current;
            panStartOffRef.current = { ...panOffsetRef.current };
            tentativeCandidatesRef.current = [];
            setActiveHandleRef.current(null);
          }
          const dist = getTouchDistance(touches);
          if (pinchStartDistRef.current > 0) {
            const newScale = Math.max(1, Math.min(4, pinchStartScaleRef.current * (dist / pinchStartDistRef.current)));
            setZoomScale(newScale);
            zoomScaleRef.current = newScale;
          }
          return;
        }

        if (gestureMode.current === "tentative" && tentativeCandidatesRef.current.length > 0) {
          const totalMove = Math.sqrt(g.dx * g.dx + g.dy * g.dy);
          const scaledThreshold = TENTATIVE_MOVE_THRESHOLD_BASE / Math.max(1, zoomScaleRef.current * 0.5);
          if (totalMove >= scaledThreshold) {
            const movesMoreHorizontal = Math.abs(g.dx) >= Math.abs(g.dy);

            const hCandidates = tentativeCandidatesRef.current.filter(c => c.orientation === "h");
            const vCandidates = tentativeCandidatesRef.current.filter(c => c.orientation === "v");

            let chosen: LineCandidate | null = null;
            if (movesMoreHorizontal) {
              chosen = vCandidates[0] || null;
            } else {
              chosen = hCandidates[0] || null;
            }

            if (!chosen) {
              chosen = tentativeCandidatesRef.current[0];
            }

            const chosenOrient = chosen.orientation;
            const perpMove = chosenOrient === "v" ? Math.abs(g.dx) : Math.abs(g.dy);
            const paraMove = chosenOrient === "v" ? Math.abs(g.dy) : Math.abs(g.dx);

            const perpThreshold = zoomScaleRef.current > 1.5 ? 0.3 : 0.5;
            if (perpMove >= paraMove * perpThreshold) {
              const currentPos = posRef.current;
              if (currentPos) {
                const lineVal = currentPos[chosen.key];
                const touchCoord = chosenOrient === "v"
                  ? tentativeTouchRef.current.containerX
                  : tentativeTouchRef.current.containerY;
                dragTouchOffset.current = lineVal - touchCoord;
              }
              gestureMode.current = "drag";
              dragLineKey.current = chosen.key;
              setActiveHandleRef.current(chosen.key);
              fireHaptic();
            } else {
              gestureMode.current = "pan";
              tentativeCandidatesRef.current = [];
              setActiveHandleRef.current(null);
            }
          }
          return;
        }

        if (gestureMode.current === "pan") {
          const s = zoomScaleRef.current;
          const cs = containerSizeRef.current;
          const maxPanX = (cs.width * (s - 1)) / 2;
          const maxPanY = (cs.height * (s - 1)) / 2;
          const newX = panStartOffRef.current.x + g.dx;
          const newY = panStartOffRef.current.y + g.dy;
          const clamped = {
            x: Math.max(-maxPanX, Math.min(maxPanX, newX)),
            y: Math.max(-maxPanY, Math.min(maxPanY, newY)),
          };
          setPanOffset(clamped);
          panOffsetRef.current = clamped;
          return;
        }

        if (gestureMode.current === "drag" && dragLineKey.current) {
          didDragRef.current = true;
          const key = dragLineKey.current;
          const s = zoomScaleRef.current;
          const cs = containerSizeRef.current;
          const deltaContainerX = g.dx / s;
          const deltaContainerY = g.dy / s;
          const initCx = tentativeTouchRef.current.containerX;
          const initCy = tentativeTouchRef.current.containerY;
          const cx = initCx + deltaContainerX;
          const cy = initCy + deltaContainerY;
          const currentPos = posRef.current;
          if (!currentPos) return;
          const { min, max } = getLineMinMax(key, currentPos, cs.width, cs.height);
          const targetVal = isVLine(key) ? cx + dragTouchOffset.current : cy + dragTouchOffset.current;
          const newVal = Math.max(min, Math.min(max, targetVal));
          const setter = showFrontRef.current ? setFrontPosRef.current : setBackPosRef.current;
          setter(prev => prev ? { ...prev, [key]: newVal } : prev);
          return;
        }

        if (gestureMode.current === "none" && zoomScaleRef.current > 1.05) {
          gestureMode.current = "pan";
        }
      },
      onPanResponderRelease: () => {
        if (gestureMode.current === "pinch" && zoomScaleRef.current < 1.08) {
          setZoomScale(1);
          setPanOffset({ x: 0, y: 0 });
          zoomScaleRef.current = 1;
          panOffsetRef.current = { x: 0, y: 0 };
        }
        if (didDragRef.current) {
          setTimeout(() => {
            const fp = frontPosRef.current;
            const bp = backPosRef.current;
            if (fp && bp) {
              const fr = computeRatio(fp);
              const br = computeRatio(bp);
              const cs = containerSizeRef.current;
              const fallbackW = cs.height * CARD_ASPECT_RATIO;
              const fNat = frontNaturalRef.current;
              const bNat = backNaturalRef.current;
              const fBounds = calcContainBounds(cs.width, cs.height, fNat.w || fallbackW, fNat.h || cs.height);
              const bBounds = calcContainBounds(cs.width, cs.height, bNat.w || fallbackW, bNat.h || cs.height);
              const toPctX = (v: number, b: ImageBounds) => b.w > 0 ? ((v - b.x) / b.w) * 100 : 0;
              const toPctY = (v: number, b: ImageBounds) => b.h > 0 ? ((v - b.y) / b.h) * 100 : 0;
              const mkLP = (p: BorderPositions, b: ImageBounds): SavedLinePositions => ({
                outerLeftPct: toPctX(p.outerLeft, b), innerLeftPct: toPctX(p.innerLeft, b),
                innerRightPct: toPctX(p.innerRight, b), outerRightPct: toPctX(p.outerRight, b),
                outerTopPct: toPctY(p.outerTop, b), innerTopPct: toPctY(p.innerTop, b),
                innerBottomPct: toPctY(p.innerBottom, b), outerBottomPct: toPctY(p.outerBottom, b),
              });
              onSaveRef.current({
                frontLeftRight: fr.lr,
                frontTopBottom: fr.tb,
                backLeftRight: br.lr,
                backTopBottom: br.tb,
                frontLinePositions: mkLP(fp, fBounds),
                backLinePositions: mkLP(bp, bBounds),
                frontRotation: frontRotationRef.current,
                backRotation: backRotationRef.current,
              });
            }
          }, 50);
        }
        gestureMode.current = "none";
        dragLineKey.current = null;
        tentativeCandidatesRef.current = [];
        didDragRef.current = false;
        hapticFiredRef.current = false;
        setActiveHandleRef.current(null);
      },
      onPanResponderTerminationRequest: () => false,
    }),
  []);

  const normLR = Math.max(ratio.lr, 100 - ratio.lr);
  const normTB = Math.max(ratio.tb, 100 - ratio.tb);
  const lrColor = getCenteringColor(normLR);
  const tbColor = getCenteringColor(normTB);
  const cw = containerSize.width;
  const ch = containerSize.height;

  const rotClamp = (v: number) => Math.max(-15, Math.min(15, Math.round(v * 10) / 10));

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset, paddingBottom: insets.bottom + webBottomInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => setShowHelp(true)} style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name="help-circle-outline" size={22} color="#fff" />
        </Pressable>
        <View style={styles.ratioInline}>
          <Text style={[styles.ratioText, { color: lrColor }]}>L/R {formatRatio(normLR)}</Text>
          <View style={styles.ratioDot} />
          <Text style={[styles.ratioText, { color: tbColor }]}>T/B {formatRatio(normTB)}</Text>
        </View>
        <Pressable onPress={() => { handleSave(); onClose(wasStraightenedRef.current); }} style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <Ionicons name="checkmark" size={16} color="#fff" />
          <Text style={styles.saveBtnText}>Done</Text>
        </Pressable>
      </View>

      <View style={styles.imageArea}>
        <View ref={viewportRef} style={styles.imageViewport} onLayout={onContainerLayout} {...viewportPan.panHandlers}>
          <View
            style={[
              styles.imageContainer,
              {
                transform: [
                  { translateX: panOffset.x },
                  { translateY: panOffset.y },
                  { scale: zoomScale },
                ],
              },
            ]}
          >
            <Image
              source={{ uri: frontImage }}
              style={[
                styles.cardImage,
                { opacity: showFront ? 1 : 0, zIndex: showFront ? 1 : 0 },
                frontRotation !== 0 ? { transform: [{ rotate: `${frontRotation}deg` }] } : undefined,
              ]}
              contentFit="contain"
              onLoad={handleFrontLoad}
            />
            <Image
              source={{ uri: backImage }}
              style={[
                styles.cardImageBack,
                { opacity: showFront ? 0 : 1, zIndex: showFront ? 0 : 1 },
                backRotation !== 0 ? { transform: [{ rotate: `${backRotation}deg` }] } : undefined,
              ]}
              contentFit="contain"
              onLoad={handleBackLoad}
            />

            {pos && cw > 0 && (
              <View style={styles.linesOverlay} pointerEvents="none">
                {LINE_CONFIGS.map(config => renderLine(config, pos[config.key], containerSize, activeHandle === config.key, { scale: zoomScale, panX: panOffset.x, panY: panOffset.y }))}

                {renderHatchOverlay(pos, containerSize)}
              </View>
            )}
          </View>

          {zoomScale > 1 && (
            <View style={styles.zoomIndicator} pointerEvents="none">
              <Text style={styles.zoomIndicatorText}>{zoomScale.toFixed(1)}x</Text>
            </View>
          )}

        </View>
      </View>

      {autoDetecting && (
        <View style={styles.autoDetectBanner}>
          <ActivityIndicator size="small" color={Colors.primary} style={{ transform: [{ scale: 0.75 }] }} />
          <Text style={styles.autoDetectBannerText}>Re-detecting centering lines…</Text>
        </View>
      )}

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
          <Pressable onPress={() => setShowRotation(!showRotation)} style={({ pressed }) => [styles.labelBtn, showRotation && styles.labelBtnActive, { opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="sync-outline" size={15} color={showRotation ? "#fff" : Colors.textMuted} />
            <Text style={[styles.labelBtnText, showRotation && styles.labelBtnTextActive]}>Rotate</Text>
          </Pressable>
          <Pressable
            onPress={handleAutoStraighten}
            disabled={autoStraightening}
            style={({ pressed }) => [styles.labelBtn, { opacity: autoStraightening ? 0.4 : pressed ? 0.6 : 1 }]}
          >
            {autoStraightening ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="magnet-outline" size={15} color={Colors.textMuted} />
            )}
            <Text style={styles.labelBtnText}>Straighten</Text>
          </Pressable>
          <Pressable onPress={handleReset} style={({ pressed }) => [styles.labelBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="refresh" size={15} color={Colors.textMuted} />
            <Text style={styles.labelBtnText}>Reset</Text>
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

        <Text style={styles.hint}>
          Drag handles to adjust lines {"\u00B7"} Pinch to zoom {"\u00B7"} Swipe to pan
        </Text>
      </View>

      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, height: 40 },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  ratioInline: { flexDirection: "row", alignItems: "center", gap: 10 },
  ratioText: { fontFamily: "Inter_700Bold", fontSize: 14 },
  ratioDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)" },
  saveBtn: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  saveBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
  imageArea: { flex: 1, paddingHorizontal: 4, paddingVertical: 2 },
  imageViewport: { flex: 1, borderRadius: 8, overflow: "hidden", backgroundColor: Colors.surfaceLight },
  imageContainer: { width: "100%", height: "100%" },
  cardImage: { position: "absolute", width: "100%", height: "100%" },
  cardImageBack: { position: "absolute", width: "100%", height: "100%" },
  linesOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },
  zoomIndicator: { position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, zIndex: 20 },
  zoomIndicatorText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#fff" },
  controls: { paddingHorizontal: 10, paddingTop: 4, paddingBottom: 4 },
  controlRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sideToggle: { flex: 1, flexDirection: "row", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 8, padding: 2 },
  sideBtn: { flex: 1, paddingVertical: 6, alignItems: "center", borderRadius: 6 },
  sideBtnActive: { backgroundColor: Colors.primary },
  sideBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.textMuted },
  sideBtnTextActive: { color: "#fff" },
  labelBtn: { alignItems: "center" as const, justifyContent: "center" as const, gap: 2, height: 40, paddingHorizontal: 8, minWidth: 44, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)" },
  labelBtnActive: { backgroundColor: Colors.primary },
  labelBtnText: { fontFamily: "Inter_500Medium", fontSize: 9, color: Colors.textMuted },
  labelBtnTextActive: { color: "#fff" },
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
  autoDetectBanner: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 6, paddingVertical: 4, backgroundColor: "rgba(255,60,49,0.08)" },
  autoDetectBannerText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted },
});
