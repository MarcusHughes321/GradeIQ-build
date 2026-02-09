import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
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
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import type { CenteringMeasurement, CardBounds } from "@/lib/types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface CenteringToolProps {
  frontImage: string;
  backImage: string;
  centering: CenteringMeasurement;
  frontCardBounds?: CardBounds;
  backCardBounds?: CardBounds;
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

interface ImageBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_CARD_BOUNDS: CardBounds = {
  leftPercent: 4,
  topPercent: 3,
  rightPercent: 96,
  bottomPercent: 97,
};

const MIN_LINE_MARGIN = 12;

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

  const totalBorderH = cardW * 0.10;
  const totalBorderV = cardH * 0.07;

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

const LINE_HIT_PX = 22;
const DISAMBIG_THRESHOLD = 6;

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

function findNearestLine(
  x: number, y: number, pos: BorderPositions, hitDist: number
): { key: LineKey; dist: number } | null {
  let best: { key: LineKey; dist: number } | null = null;

  const vLines: LineKey[] = ["outerLeft", "innerLeft", "outerRight", "innerRight"];
  const hLines: LineKey[] = ["outerTop", "innerTop", "outerBottom", "innerBottom"];

  for (const k of vLines) {
    const d = Math.abs(x - pos[k]);
    if (d < hitDist && (!best || d < best.dist)) {
      best = { key: k, dist: d };
    }
  }

  for (const k of hLines) {
    const d = Math.abs(y - pos[k]);
    if (d < hitDist && (!best || d < best.dist)) {
      best = { key: k, dist: d };
    }
  }

  return best;
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

function renderLine(config: LineConfig, pos: number, containerSize: { width: number; height: number }) {
  const lineW = config.isOuter ? 1.5 : 2;
  const opacity = config.isOuter ? 0.7 : 1;

  if (config.orientation === "v") {
    return (
      <View
        key={config.key}
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
    );
  }

  return (
    <View
      key={config.key}
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

export default function CenteringTool({ frontImage, backImage, centering, frontCardBounds, backCardBounds, onSave, onClose }: CenteringToolProps) {
  const insets = useSafeAreaInsets();
  const [showFront, setShowFront] = useState(true);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [frontNatural, setFrontNatural] = useState({ w: 0, h: 0 });
  const [backNatural, setBackNatural] = useState({ w: 0, h: 0 });
  const [frontPos, setFrontPos] = useState<BorderPositions | null>(null);
  const [backPos, setBackPos] = useState<BorderPositions | null>(null);
  const frontPosInitRef = useRef(false);
  const backPosInitRef = useRef(false);
  const frontLoadLoggedRef = useRef(false);
  const backLoadLoggedRef = useRef(false);
  const [frontRotation, setFrontRotation] = useState(0);
  const [backRotation, setBackRotation] = useState(0);
  const [showRotation, setShowRotation] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

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
    loadDimensions(frontImage, setFrontNatural);
    loadDimensions(backImage, setBackNatural);
  }, [frontImage, backImage]);

  const doInitFront = useCallback((cw: number, ch: number, nw: number, nh: number) => {
    if (frontPosInitRef.current) return;
    frontPosInitRef.current = true;
    const bounds = calcContainBounds(cw, ch, nw, nh);
    setFrontPos(initPositions(centering.frontLeftRight, centering.frontTopBottom, bounds, frontCardBounds));
  }, [centering, frontCardBounds]);

  const doInitBack = useCallback((cw: number, ch: number, nw: number, nh: number) => {
    if (backPosInitRef.current) return;
    backPosInitRef.current = true;
    const bounds = calcContainBounds(cw, ch, nw, nh);
    setBackPos(initPositions(centering.backLeftRight, centering.backTopBottom, bounds, backCardBounds));
  }, [centering, backCardBounds]);

  useEffect(() => {
    if (containerSize.width > 0 && !frontPosInitRef.current && frontNatural.w > 0) {
      doInitFront(containerSize.width, containerSize.height, frontNatural.w, frontNatural.h);
    }
  }, [containerSize, frontNatural]);

  useEffect(() => {
    if (containerSize.width > 0 && !backPosInitRef.current && backNatural.w > 0) {
      doInitBack(containerSize.width, containerSize.height, backNatural.w, backNatural.h);
    }
  }, [containerSize, backNatural]);

  useEffect(() => {
    if (containerSize.width > 0) {
      const timer = setTimeout(() => {
        if (!frontPosInitRef.current) {
          doInitFront(containerSize.width, containerSize.height, 0, 0);
        }
        if (!backPosInitRef.current) {
          doInitBack(containerSize.width, containerSize.height, 0, 0);
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [containerSize]);

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setContainerSize({ width, height });
    }
  }, []);

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

  const handleSave = () => {
    if (!frontPos || !backPos) return;
    const fr = computeRatio(frontPos);
    const br = computeRatio(backPos);
    onSave({ frontLeftRight: fr.lr, frontTopBottom: fr.tb, backLeftRight: br.lr, backTopBottom: br.tb });
  };

  const handleReset = () => {
    if (containerSize.width === 0) return;
    const fw = frontNatural.w || 0;
    const fh = frontNatural.h || 0;
    const bw = backNatural.w || 0;
    const bh = backNatural.h || 0;
    const fb = calcContainBounds(containerSize.width, containerSize.height, fw, fh);
    const bb = calcContainBounds(containerSize.width, containerSize.height, bw, bh);
    frontPosInitRef.current = false;
    backPosInitRef.current = false;
    setFrontPos(initPositions(centering.frontLeftRight, centering.frontTopBottom, fb, frontCardBounds));
    setBackPos(initPositions(centering.backLeftRight, centering.backTopBottom, bb, backCardBounds));
    frontPosInitRef.current = true;
    backPosInitRef.current = true;
    setFrontRotation(0);
    setBackRotation(0);
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
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
  zoomScaleRef.current = zoomScale;
  panOffsetRef.current = panOffset;
  containerSizeRef.current = containerSize;
  posRef.current = pos;
  showFrontRef.current = showFront;
  setFrontPosRef.current = setFrontPos;
  setBackPosRef.current = setBackPos;

  const gestureMode = useRef<"none" | "pinch" | "pan" | "drag" | "tentative">("none");
  const dragLineKey = useRef<LineKey | null>(null);
  const dragTouchOffset = useRef(0);
  const viewportOriginRef = useRef({ x: 0, y: 0 });
  const tentativeLineRef = useRef<{ key: LineKey; offset: number } | null>(null);

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
        if (touches.length >= 2) {
          gestureMode.current = "pinch";
          pinchStartDistRef.current = getTouchDistance(touches);
          pinchStartScaleRef.current = zoomScaleRef.current;
          panStartOffRef.current = { ...panOffsetRef.current };
          return;
        }

        const scale = zoomScaleRef.current;
        const cs = containerSizeRef.current;
        const px = panOffsetRef.current.x;
        const py = panOffsetRef.current.y;
        const lx = evt.nativeEvent.locationX;
        const ly = evt.nativeEvent.locationY;

        viewportOriginRef.current = { x: lx, y: ly };
        panStartOffRef.current = { ...panOffsetRef.current };

        const { x: containerX, y: containerY } = viewportToContainer(lx, ly, scale, px, py, cs.width, cs.height);

        const currentPos = posRef.current;
        if (currentPos) {
          const hitDist = LINE_HIT_PX / scale;
          const nearest = findNearestLine(containerX, containerY, currentPos, hitDist);
          if (nearest) {
            const lineVal = currentPos[nearest.key];
            const offset = isVLine(nearest.key)
              ? lineVal - containerX
              : lineVal - containerY;
            tentativeLineRef.current = { key: nearest.key, offset };

            if (scale <= 1.05) {
              gestureMode.current = "drag";
              dragLineKey.current = nearest.key;
              dragTouchOffset.current = offset;
            } else {
              gestureMode.current = "tentative";
            }
            return;
          }
        }

        if (scale > 1.05) {
          gestureMode.current = "pan";
        } else {
          gestureMode.current = "none";
        }
      },
      onPanResponderMove: (evt, g) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2) {
          if (gestureMode.current !== "pinch") {
            gestureMode.current = "pinch";
            pinchStartDistRef.current = getTouchDistance(touches);
            pinchStartScaleRef.current = zoomScaleRef.current;
            panStartOffRef.current = { ...panOffsetRef.current };
            tentativeLineRef.current = null;
          }
          const dist = getTouchDistance(touches);
          if (pinchStartDistRef.current > 0) {
            const newScale = Math.max(1, Math.min(4, pinchStartScaleRef.current * (dist / pinchStartDistRef.current)));
            setZoomScale(newScale);
            zoomScaleRef.current = newScale;
          }
          return;
        }

        if (gestureMode.current === "tentative" && tentativeLineRef.current) {
          const lineKey = tentativeLineRef.current.key;
          const isV = isVLine(lineKey);
          const perpMovement = isV ? Math.abs(g.dx) : Math.abs(g.dy);
          const paraMovement = isV ? Math.abs(g.dy) : Math.abs(g.dx);

          if (perpMovement > DISAMBIG_THRESHOLD || paraMovement > DISAMBIG_THRESHOLD) {
            if (perpMovement >= paraMovement) {
              gestureMode.current = "drag";
              dragLineKey.current = lineKey;
              dragTouchOffset.current = tentativeLineRef.current.offset;
              tentativeLineRef.current = null;
            } else {
              gestureMode.current = "pan";
              tentativeLineRef.current = null;
            }
          }
          if (gestureMode.current === "tentative") return;
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
          const key = dragLineKey.current;
          const s = zoomScaleRef.current;
          const cs = containerSizeRef.current;
          const px = panOffsetRef.current.x;
          const py = panOffsetRef.current.y;
          const currentLx = viewportOriginRef.current.x + g.dx;
          const currentLy = viewportOriginRef.current.y + g.dy;
          const { x: cx, y: cy } = viewportToContainer(currentLx, currentLy, s, px, py, cs.width, cs.height);
          const currentPos = posRef.current;
          if (!currentPos) return;
          const { min, max } = getLineMinMax(key, currentPos, cs.width, cs.height);
          const targetVal = isVLine(key) ? cx + dragTouchOffset.current : cy + dragTouchOffset.current;
          const newVal = Math.max(min, Math.min(max, targetVal));
          const setter = showFrontRef.current ? setFrontPosRef.current : setBackPosRef.current;
          setter(prev => prev ? { ...prev, [key]: newVal } : prev);
          return;
        }

        if (gestureMode.current === "none" && zoomScaleRef.current > 1.05 && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4)) {
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
        gestureMode.current = "none";
        dragLineKey.current = null;
        tentativeLineRef.current = null;
      },
      onPanResponderTerminationRequest: () => false,
    }),
  []);

  const lrColor = getCenteringColor(ratio.lr);
  const tbColor = getCenteringColor(ratio.tb);
  const cw = containerSize.width;
  const ch = containerSize.height;

  const rotClamp = (v: number) => Math.max(-15, Math.min(15, Math.round(v * 10) / 10));

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
        <View style={styles.imageViewport} onLayout={onContainerLayout} {...viewportPan.panHandlers}>
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
                {LINE_CONFIGS.map(config => renderLine(config, pos[config.key], containerSize))}

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

        <Text style={styles.hint}>Pinch to zoom {"\u00B7"} Drag lines to adjust</Text>
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
