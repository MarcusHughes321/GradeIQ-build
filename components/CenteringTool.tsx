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
  const cb = cardBounds || { leftPercent: 1, topPercent: 1, rightPercent: 99, bottomPercent: 99 };

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

const LINE_HIT = 34;

interface DragLineProps {
  orientation: "h" | "v";
  position: number;
  containerSize: { width: number; height: number };
  color: string;
  label: string;
  dashed?: boolean;
  onDrag: (pos: number) => void;
  minPos: number;
  maxPos: number;
  scale: number;
}

function DragLine({ orientation, position, containerSize, color, label, dashed, onDrag, minPos, maxPos, scale }: DragLineProps) {
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
      onStartShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 1,
      onMoveShouldSetPanResponder: (evt, g) => evt.nativeEvent.touches.length === 1 && (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2),
      onPanResponderGrant: () => { startRef.current = posRef.current; },
      onPanResponderMove: (_: GestureResponderEvent, g: PanResponderGestureState) => {
        const d = orientation === "v" ? g.dx / scaleRef.current : g.dy / scaleRef.current;
        cbRef.current(Math.max(minRef.current, Math.min(maxRef.current, startRef.current + d)));
      },
      onPanResponderTerminationRequest: () => true,
    })
  ).current;

  const dotStyle = { width: 3, height: 3, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.85)" } as const;
  const lineW = dashed ? 1 : 2.5;

  if (orientation === "v") {
    return (
      <View
        style={{ position: "absolute" as const, top: 0, left: position - LINE_HIT / 2, width: LINE_HIT, height: containerSize.height, zIndex: dashed ? 8 : 12, alignItems: "center" as const, justifyContent: "center" as const }}
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
      style={{ position: "absolute" as const, left: 0, top: position - LINE_HIT / 2, width: containerSize.width, height: LINE_HIT, zIndex: dashed ? 8 : 12, alignItems: "center" as const, justifyContent: "center" as const }}
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

function getTouchDistance(touches: any[]): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
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
  const [frontInited, setFrontInited] = useState(false);
  const [backInited, setBackInited] = useState(false);

  const rotation = showFront ? frontRotation : backRotation;
  const setRotation = showFront ? setFrontRotation : setBackRotation;

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const natural = showFront ? frontNatural : backNatural;

  const imgBounds = useMemo(() => {
    return calcContainBounds(containerSize.width, containerSize.height, natural.w, natural.h);
  }, [containerSize, natural]);

  useEffect(() => {
    if (containerSize.width > 0 && frontNatural.w > 0 && !frontInited) {
      const bounds = calcContainBounds(containerSize.width, containerSize.height, frontNatural.w, frontNatural.h);
      setFrontPos(initPositions(centering.frontLeftRight, centering.frontTopBottom, bounds, frontCardBounds));
      setFrontInited(true);
    }
  }, [containerSize, frontNatural, frontInited, centering, frontCardBounds]);

  useEffect(() => {
    if (containerSize.width > 0 && backNatural.w > 0 && !backInited) {
      const bounds = calcContainBounds(containerSize.width, containerSize.height, backNatural.w, backNatural.h);
      setBackPos(initPositions(centering.backLeftRight, centering.backTopBottom, bounds, backCardBounds));
      setBackInited(true);
    }
  }, [containerSize, backNatural, backInited, centering, backCardBounds]);

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setContainerSize({ width, height });
    }
  }, []);

  const handleFrontLoad = useCallback((e: any) => {
    if (e?.source?.width && e?.source?.height) {
      setFrontNatural({ w: e.source.width, h: e.source.height });
    }
  }, []);

  const handleBackLoad = useCallback((e: any) => {
    if (e?.source?.width && e?.source?.height) {
      setBackNatural({ w: e.source.width, h: e.source.height });
    }
  }, []);

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
  const isPinchingRef = useRef(false);
  const zoomScaleRef = useRef(1);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const containerSizeRef = useRef(containerSize);
  zoomScaleRef.current = zoomScale;
  panOffsetRef.current = panOffset;
  containerSizeRef.current = containerSize;

  const viewportPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        return evt.nativeEvent.touches.length >= 2;
      },
      onMoveShouldSetPanResponder: (evt, g) => {
        if (evt.nativeEvent.touches.length >= 2) return true;
        if (zoomScaleRef.current > 1.05 && (Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5)) return true;
        return false;
      },
      onStartShouldSetPanResponderCapture: (evt) => {
        return evt.nativeEvent.touches.length >= 2;
      },
      onMoveShouldSetPanResponderCapture: (evt) => {
        return evt.nativeEvent.touches.length >= 2;
      },
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          isPinchingRef.current = true;
          pinchStartDistRef.current = getTouchDistance(touches);
          pinchStartScaleRef.current = zoomScaleRef.current;
          panStartOffRef.current = { ...panOffsetRef.current };
        } else {
          isPinchingRef.current = false;
          panStartOffRef.current = { ...panOffsetRef.current };
        }
      },
      onPanResponderMove: (evt, g) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          isPinchingRef.current = true;
          const dist = getTouchDistance(touches);
          if (pinchStartDistRef.current > 0) {
            const newScale = Math.max(1, Math.min(4, pinchStartScaleRef.current * (dist / pinchStartDistRef.current)));
            setZoomScale(newScale);
            zoomScaleRef.current = newScale;
          }
        } else if (zoomScaleRef.current > 1.05 && !isPinchingRef.current) {
          const cs = containerSizeRef.current;
          const s = zoomScaleRef.current;
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
        }
      },
      onPanResponderRelease: () => {
        isPinchingRef.current = false;
        if (zoomScaleRef.current < 1.08) {
          setZoomScale(1);
          setPanOffset({ x: 0, y: 0 });
          zoomScaleRef.current = 1;
          panOffsetRef.current = { x: 0, y: 0 };
        }
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const lrColor = getCenteringColor(ratio.lr);
  const tbColor = getCenteringColor(ratio.tb);
  const cw = containerSize.width;
  const ch = containerSize.height;

  const OUTER_COLOR = "rgba(255,255,255,0.7)";
  const INNER_L = "#FF3C31";
  const INNER_R = "#3B82F6";
  const INNER_T = "#F59E0B";
  const INNER_B = "#10B981";

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
        <View style={styles.imageViewport} {...viewportPan.panHandlers}>
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
            onLayout={onContainerLayout}
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
              <View style={styles.linesOverlay} pointerEvents="box-none">
                <DragLine orientation="v" position={pos.outerLeft} containerSize={containerSize} color={OUTER_COLOR} label="" dashed onDrag={v => drag("outerLeft", v)} minPos={0} maxPos={pos.innerLeft - 4} scale={zoomScale} />
                <DragLine orientation="v" position={pos.innerLeft} containerSize={containerSize} color={INNER_L} label="L" onDrag={v => drag("innerLeft", v)} minPos={pos.outerLeft + 4} maxPos={cw * 0.45} scale={zoomScale} />

                <DragLine orientation="v" position={pos.outerRight} containerSize={containerSize} color={OUTER_COLOR} label="" dashed onDrag={v => drag("outerRight", v)} minPos={pos.innerRight + 4} maxPos={cw} scale={zoomScale} />
                <DragLine orientation="v" position={pos.innerRight} containerSize={containerSize} color={INNER_R} label="R" onDrag={v => drag("innerRight", v)} minPos={cw * 0.55} maxPos={pos.outerRight - 4} scale={zoomScale} />

                <DragLine orientation="h" position={pos.outerTop} containerSize={containerSize} color={OUTER_COLOR} label="" dashed onDrag={v => drag("outerTop", v)} minPos={0} maxPos={pos.innerTop - 4} scale={zoomScale} />
                <DragLine orientation="h" position={pos.innerTop} containerSize={containerSize} color={INNER_T} label="T" onDrag={v => drag("innerTop", v)} minPos={pos.outerTop + 4} maxPos={ch * 0.45} scale={zoomScale} />

                <DragLine orientation="h" position={pos.outerBottom} containerSize={containerSize} color={OUTER_COLOR} label="" dashed onDrag={v => drag("outerBottom", v)} minPos={pos.innerBottom + 4} maxPos={ch} scale={zoomScale} />
                <DragLine orientation="h" position={pos.innerBottom} containerSize={containerSize} color={INNER_B} label="B" onDrag={v => drag("innerBottom", v)} minPos={ch * 0.55} maxPos={pos.outerBottom - 4} scale={zoomScale} />

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
