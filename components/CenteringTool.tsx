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
  GestureResponderEvent,
  PanResponderGestureState,
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

function initPositions(lr: number, tb: number, imageBounds: ImageBounds, cardBounds?: CardBounds): BorderPositions {
  const cb = cardBounds || { leftPercent: 2, topPercent: 2, rightPercent: 98, bottomPercent: 98 };

  const outerLeft = imageBounds.x + imageBounds.w * (cb.leftPercent / 100);
  const outerRight = imageBounds.x + imageBounds.w * (cb.rightPercent / 100);
  const outerTop = imageBounds.y + imageBounds.h * (cb.topPercent / 100);
  const outerBottom = imageBounds.y + imageBounds.h * (cb.bottomPercent / 100);

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

const LINE_HIT = 30;

type LineKey = "outerLeft" | "innerLeft" | "outerRight" | "innerRight" | "outerTop" | "innerTop" | "outerBottom" | "innerBottom";

interface LineConfig {
  key: LineKey;
  orientation: "h" | "v";
  color: string;
  label: string;
  dashed: boolean;
}

const LINE_CONFIGS: LineConfig[] = [
  { key: "outerLeft", orientation: "v", color: "rgba(255,255,255,0.7)", label: "", dashed: true },
  { key: "innerLeft", orientation: "v", color: "#FF3C31", label: "L", dashed: false },
  { key: "outerRight", orientation: "v", color: "rgba(255,255,255,0.7)", label: "", dashed: true },
  { key: "innerRight", orientation: "v", color: "#3B82F6", label: "R", dashed: false },
  { key: "outerTop", orientation: "h", color: "rgba(255,255,255,0.7)", label: "", dashed: true },
  { key: "innerTop", orientation: "h", color: "#F59E0B", label: "T", dashed: false },
  { key: "outerBottom", orientation: "h", color: "rgba(255,255,255,0.7)", label: "", dashed: true },
  { key: "innerBottom", orientation: "h", color: "#10B981", label: "B", dashed: false },
];

function getTouchDistance(touches: any[]): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function findNearestLine(x: number, y: number, pos: BorderPositions, hitDist: number = LINE_HIT): { key: LineKey; dist: number } | null {
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

function renderLine(config: LineConfig, pos: number, containerSize: { width: number; height: number }) {
  const lineW = config.dashed ? 1 : 2.5;
  const dotStyle = { width: 3, height: 3, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.85)" } as const;

  if (config.orientation === "v") {
    return (
      <View
        key={config.key}
        style={{
          position: "absolute" as const,
          top: 0,
          left: pos - 1.5,
          width: 3,
          height: containerSize.height,
          zIndex: config.dashed ? 8 : 12,
          alignItems: "center" as const,
          justifyContent: "center" as const,
        }}
        pointerEvents="none"
      >
        <View style={{ position: "absolute" as const, width: lineW, height: "100%" as const, backgroundColor: config.color, opacity: config.dashed ? 0.5 : 1 }} />
        {!config.dashed && (
          <View style={{ width: 16, height: 32, borderRadius: 8, backgroundColor: config.color, alignItems: "center" as const, justifyContent: "center" as const }}>
            <View style={{ gap: 2.5 }}>
              <View style={dotStyle} />
              <View style={dotStyle} />
              <View style={dotStyle} />
            </View>
          </View>
        )}
        {config.label ? <Text style={{ position: "absolute" as const, top: 3, left: 6, fontFamily: "Inter_700Bold", fontSize: 9, color: config.color, textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>{config.label}</Text> : null}
      </View>
    );
  }

  return (
    <View
      key={config.key}
      style={{
        position: "absolute" as const,
        left: 0,
        top: pos - 1.5,
        width: containerSize.width,
        height: 3,
        zIndex: config.dashed ? 8 : 12,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      }}
      pointerEvents="none"
    >
      <View style={{ position: "absolute" as const, height: lineW, width: "100%" as const, backgroundColor: config.color, opacity: config.dashed ? 0.5 : 1 }} />
      {!config.dashed && (
        <View style={{ width: 32, height: 16, borderRadius: 8, backgroundColor: config.color, alignItems: "center" as const, justifyContent: "center" as const }}>
          <View style={{ flexDirection: "row" as const, gap: 2.5 }}>
            <View style={dotStyle} />
            <View style={dotStyle} />
            <View style={dotStyle} />
          </View>
        </View>
      )}
      {config.label ? <Text style={{ position: "absolute" as const, left: 5, top: 6, fontFamily: "Inter_700Bold", fontSize: 9, color: config.color, textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>{config.label}</Text> : null}
    </View>
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
  const [frontRotation, setFrontRotation] = useState(0);
  const [backRotation, setBackRotation] = useState(0);
  const [showRotation, setShowRotation] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  const rotation = showFront ? frontRotation : backRotation;
  const setRotation = showFront ? setFrontRotation : setBackRotation;

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const natural = showFront ? frontNatural : backNatural;

  useEffect(() => {
    if (frontImage) {
      RNImage.getSize(
        frontImage,
        (w, h) => { if (w > 0 && h > 0) setFrontNatural({ w, h }); },
        () => {}
      );
    }
  }, [frontImage]);

  useEffect(() => {
    if (backImage) {
      RNImage.getSize(
        backImage,
        (w, h) => { if (w > 0 && h > 0) setBackNatural({ w, h }); },
        () => {}
      );
    }
  }, [backImage]);

  useEffect(() => {
    if (containerSize.width > 0 && frontNatural.w > 0 && !frontPos) {
      const bounds = calcContainBounds(containerSize.width, containerSize.height, frontNatural.w, frontNatural.h);
      setFrontPos(initPositions(centering.frontLeftRight, centering.frontTopBottom, bounds, frontCardBounds));
    }
  }, [containerSize, frontNatural]);

  useEffect(() => {
    if (containerSize.width > 0 && backNatural.w > 0 && !backPos) {
      const bounds = calcContainBounds(containerSize.width, containerSize.height, backNatural.w, backNatural.h);
      setBackPos(initPositions(centering.backLeftRight, centering.backTopBottom, bounds, backCardBounds));
    }
  }, [containerSize, backNatural]);

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setContainerSize({ width, height });
    }
  }, []);

  const handleFrontLoad = useCallback((e: any) => {
    const w = e?.source?.width || e?.nativeEvent?.source?.width || 0;
    const h = e?.source?.height || e?.nativeEvent?.source?.height || 0;
    if (w > 0 && h > 0) {
      setFrontNatural(prev => prev.w > 0 ? prev : { w, h });
    }
  }, []);

  const handleBackLoad = useCallback((e: any) => {
    const w = e?.source?.width || e?.nativeEvent?.source?.width || 0;
    const h = e?.source?.height || e?.nativeEvent?.source?.height || 0;
    if (w > 0 && h > 0) {
      setBackNatural(prev => prev.w > 0 ? prev : { w, h });
    }
  }, []);

  const pos = showFront ? frontPos : backPos;
  const setPos = showFront ? setFrontPos : setBackPos;

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
    if (frontNatural.w > 0) {
      const fb = calcContainBounds(containerSize.width, containerSize.height, frontNatural.w, frontNatural.h);
      setFrontPos(initPositions(centering.frontLeftRight, centering.frontTopBottom, fb, frontCardBounds));
    }
    if (backNatural.w > 0) {
      const bb = calcContainBounds(containerSize.width, containerSize.height, backNatural.w, backNatural.h);
      setBackPos(initPositions(centering.backLeftRight, centering.backTopBottom, bb, backCardBounds));
    }
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

  const gestureMode = useRef<"none" | "pinch" | "pan" | "drag">("none");
  const dragLineKey = useRef<LineKey | null>(null);
  const dragLineStart = useRef(0);
  const viewportOriginRef = useRef({ x: 0, y: 0 });

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
        const lx = evt.nativeEvent.locationX;
        const ly = evt.nativeEvent.locationY;

        const viewX = (lx - cs.width / 2) / scale - panOffsetRef.current.x + cs.width / 2;
        const viewY = (ly - cs.height / 2) / scale - panOffsetRef.current.y + cs.height / 2;

        viewportOriginRef.current = { x: lx, y: ly };

        const currentPos = posRef.current;
        const hitSlop = LINE_HIT / scale;
        if (currentPos) {
          const nearest = findNearestLine(viewX, viewY, currentPos, hitSlop);
          if (nearest) {
            gestureMode.current = "drag";
            dragLineKey.current = nearest.key;
            dragLineStart.current = currentPos[nearest.key];
            return;
          }
        }

        if (scale > 1.05) {
          gestureMode.current = "pan";
          panStartOffRef.current = { ...panOffsetRef.current };
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
          }
          const dist = getTouchDistance(touches);
          if (pinchStartDistRef.current > 0) {
            const newScale = Math.max(1, Math.min(4, pinchStartScaleRef.current * (dist / pinchStartDistRef.current)));
            setZoomScale(newScale);
            zoomScaleRef.current = newScale;
          }
          return;
        }

        if (gestureMode.current === "pan") {
          const s = zoomScaleRef.current;
          const cs = containerSizeRef.current;
          const maxPanX = (cs.width * (s - 1)) / (2 * s);
          const maxPanY = (cs.height * (s - 1)) / (2 * s);
          const newX = panStartOffRef.current.x + g.dx / s;
          const newY = panStartOffRef.current.y + g.dy / s;
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
          const d = isVLine(key) ? g.dx / s : g.dy / s;
          const currentPos = posRef.current;
          if (!currentPos) return;
          const { min, max } = getLineMinMax(key, currentPos, containerSizeRef.current.width, containerSizeRef.current.height);
          const newVal = Math.max(min, Math.min(max, dragLineStart.current + d));
          const setter = showFrontRef.current ? setFrontPosRef.current : setBackPosRef.current;
          setter(prev => prev ? { ...prev, [key]: newVal } : prev);
          return;
        }

        if (gestureMode.current === "none" && zoomScaleRef.current > 1.05 && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4)) {
          gestureMode.current = "pan";
          panStartOffRef.current = { ...panOffsetRef.current };
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
                  { scale: zoomScale },
                  { translateX: panOffset.x },
                  { translateY: panOffset.y },
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

                <View pointerEvents="none" style={[styles.borderShade, { left: pos.outerLeft, top: pos.outerTop, width: Math.max(0, pos.innerLeft - pos.outerLeft), height: Math.max(0, pos.outerBottom - pos.outerTop) }]} />
                <View pointerEvents="none" style={[styles.borderShade, { left: pos.innerRight, top: pos.outerTop, width: Math.max(0, pos.outerRight - pos.innerRight), height: Math.max(0, pos.outerBottom - pos.outerTop) }]} />
                <View pointerEvents="none" style={[styles.borderShade, { left: pos.innerLeft, top: pos.outerTop, width: Math.max(0, pos.innerRight - pos.innerLeft), height: Math.max(0, pos.innerTop - pos.outerTop) }]} />
                <View pointerEvents="none" style={[styles.borderShade, { left: pos.innerLeft, top: pos.innerBottom, width: Math.max(0, pos.innerRight - pos.innerLeft), height: Math.max(0, pos.outerBottom - pos.innerBottom) }]} />
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
  borderShade: { position: "absolute", backgroundColor: "rgba(255, 60, 49, 0.1)" },
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
