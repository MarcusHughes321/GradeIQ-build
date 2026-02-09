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
const BORDER_FRACTION = 0.08;

interface CenteringToolProps {
  frontImage: string;
  backImage: string;
  centering: CenteringMeasurement;
  onSave: (centering: CenteringMeasurement) => void;
  onClose: () => void;
}

function ratioToPositions(lr: number, tb: number, imgW: number, imgH: number) {
  const totalBorderH = imgW * BORDER_FRACTION * 2;
  const totalBorderV = imgH * BORDER_FRACTION * 2;
  const leftBorder = (lr / 100) * totalBorderH;
  const rightBorder = ((100 - lr) / 100) * totalBorderH;
  const topBorder = (tb / 100) * totalBorderV;
  const bottomBorder = ((100 - tb) / 100) * totalBorderV;
  return {
    left: leftBorder,
    right: imgW - rightBorder,
    top: topBorder,
    bottom: imgH - bottomBorder,
  };
}

function positionsToRatio(
  left: number,
  right: number,
  top: number,
  bottom: number,
  imgW: number,
  imgH: number
) {
  const leftBorder = left;
  const rightBorder = imgW - right;
  const topBorder = top;
  const bottomBorder = imgH - bottom;
  const totalH = leftBorder + rightBorder;
  const totalV = topBorder + bottomBorder;
  const lr = totalH > 0 ? Math.round((leftBorder / totalH) * 100) : 50;
  const tb = totalV > 0 ? Math.round((topBorder / totalV) * 100) : 50;
  return {
    lr: Math.max(50, Math.min(95, Math.max(lr, 100 - lr))),
    tb: Math.max(50, Math.min(95, Math.max(tb, 100 - tb))),
    lrRaw: lr,
    tbRaw: tb,
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

const LINE_HIT_AREA = 30;

interface DraggableLineProps {
  orientation: "horizontal" | "vertical";
  position: number;
  imageSize: { width: number; height: number };
  color: string;
  label: string;
  onDrag: (newPosition: number) => void;
  minPos: number;
  maxPos: number;
}

function DraggableLine({
  orientation,
  position,
  imageSize,
  color,
  label,
  onDrag,
  minPos,
  maxPos,
}: DraggableLineProps) {
  const startPosRef = useRef(position);
  const posRef = useRef(position);
  const onDragRef = useRef(onDrag);
  const minPosRef = useRef(minPos);
  const maxPosRef = useRef(maxPos);

  posRef.current = position;
  onDragRef.current = onDrag;
  minPosRef.current = minPos;
  maxPosRef.current = maxPos;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: (_, gs) => Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2,
      onPanResponderGrant: () => {
        startPosRef.current = posRef.current;
      },
      onPanResponderMove: (_: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const delta = orientation === "vertical" ? gestureState.dx : gestureState.dy;
        const newPos = Math.max(minPosRef.current, Math.min(maxPosRef.current, startPosRef.current + delta));
        onDragRef.current(newPos);
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  if (orientation === "vertical") {
    return (
      <View
        style={[
          lineStyles.verticalContainer,
          {
            left: position - LINE_HIT_AREA / 2,
            height: imageSize.height,
            width: LINE_HIT_AREA,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={[lineStyles.verticalLine, { backgroundColor: color }]} />
        <View style={[lineStyles.handle, { backgroundColor: color }]}>
          <View style={lineStyles.handleDots}>
            <View style={lineStyles.handleDot} />
            <View style={lineStyles.handleDot} />
            <View style={lineStyles.handleDot} />
          </View>
        </View>
        <Text style={[lineStyles.lineLabel, { color, top: 4, left: LINE_HIT_AREA / 2 + 4 }]}>
          {label}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        lineStyles.horizontalContainer,
        {
          top: position - LINE_HIT_AREA / 2,
          width: imageSize.width,
          height: LINE_HIT_AREA,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={[lineStyles.horizontalLine, { backgroundColor: color }]} />
      <View style={[lineStyles.handleH, { backgroundColor: color }]}>
        <View style={lineStyles.handleDotsH}>
          <View style={lineStyles.handleDot} />
          <View style={lineStyles.handleDot} />
          <View style={lineStyles.handleDot} />
        </View>
      </View>
      <Text style={[lineStyles.lineLabelH, { color, left: 6, top: LINE_HIT_AREA / 2 + 4 }]}>
        {label}
      </Text>
    </View>
  );
}

export default function CenteringTool({
  frontImage,
  backImage,
  centering,
  onSave,
  onClose,
}: CenteringToolProps) {
  const insets = useSafeAreaInsets();
  const [showFront, setShowFront] = useState(true);
  const [imageLayout, setImageLayout] = useState({ width: 0, height: 0 });
  const [localCentering, setLocalCentering] = useState<CenteringMeasurement>(centering);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const imgPadding = 20;
  const imgWidth = SCREEN_WIDTH - imgPadding * 2;
  const imgHeight = imgWidth / 0.714;

  const onImageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setImageLayout({ width, height });
  }, []);

  const currentLR = showFront ? localCentering.frontLeftRight : localCentering.backLeftRight;
  const currentTB = showFront ? localCentering.frontTopBottom : localCentering.backTopBottom;

  const positions = useMemo(() => {
    if (imageLayout.width === 0) return null;
    return ratioToPositions(currentLR, currentTB, imageLayout.width, imageLayout.height);
  }, [currentLR, currentTB, imageLayout]);

  const handleLineDrag = useCallback(
    (line: "left" | "right" | "top" | "bottom", newPos: number) => {
      if (!positions || imageLayout.width === 0) return;

      const updatedPositions = { ...positions, [line]: newPos };
      const result = positionsToRatio(
        updatedPositions.left,
        updatedPositions.right,
        updatedPositions.top,
        updatedPositions.bottom,
        imageLayout.width,
        imageLayout.height
      );

      setLocalCentering((prev) => {
        if (showFront) {
          return { ...prev, frontLeftRight: result.lr, frontTopBottom: result.tb };
        }
        return { ...prev, backLeftRight: result.lr, backTopBottom: result.tb };
      });
    },
    [positions, imageLayout, showFront]
  );

  const handleSave = () => {
    onSave(localCentering);
  };

  const handleReset = () => {
    setLocalCentering(centering);
  };

  const lrColor = getCenteringColor(currentLR);
  const tbColor = getCenteringColor(currentTB);

  const minBorderH = imageLayout.width * 0.01;
  const maxBorderH = imageLayout.width * 0.25;
  const minBorderV = imageLayout.height * 0.01;
  const maxBorderV = imageLayout.height * 0.25;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Centering Tool</Text>
        <Pressable
          onPress={handleSave}
          style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="checkmark" size={18} color="#fff" />
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </View>

      <View style={styles.ratioBar}>
        <View style={styles.ratioItem}>
          <Text style={styles.ratioLabel}>L/R</Text>
          <Text style={[styles.ratioValue, { color: lrColor }]}>{formatRatio(currentLR)}</Text>
        </View>
        <View style={styles.ratioSep} />
        <View style={styles.ratioItem}>
          <Text style={styles.ratioLabel}>T/B</Text>
          <Text style={[styles.ratioValue, { color: tbColor }]}>{formatRatio(currentTB)}</Text>
        </View>
      </View>

      <View style={styles.imageArea}>
        <View
          style={[styles.imageContainer, { width: imgWidth, height: imgHeight }]}
          onLayout={onImageLayout}
        >
          <View style={styles.imageClip}>
            <Image
              source={{ uri: showFront ? frontImage : backImage }}
              style={styles.cardImage}
              contentFit="cover"
            />
          </View>

          {positions && imageLayout.width > 0 && (
            <View style={styles.linesOverlay}>
              <DraggableLine
                orientation="vertical"
                position={positions.left}
                imageSize={imageLayout}
                color="#FF3C31"
                label="L"
                onDrag={(p) => handleLineDrag("left", p)}
                minPos={minBorderH}
                maxPos={maxBorderH}
              />
              <DraggableLine
                orientation="vertical"
                position={positions.right}
                imageSize={imageLayout}
                color="#3B82F6"
                label="R"
                onDrag={(p) => handleLineDrag("right", p)}
                minPos={imageLayout.width - maxBorderH}
                maxPos={imageLayout.width - minBorderH}
              />
              <DraggableLine
                orientation="horizontal"
                position={positions.top}
                imageSize={imageLayout}
                color="#F59E0B"
                label="T"
                onDrag={(p) => handleLineDrag("top", p)}
                minPos={minBorderV}
                maxPos={maxBorderV}
              />
              <DraggableLine
                orientation="horizontal"
                position={positions.bottom}
                imageSize={imageLayout}
                color="#10B981"
                label="B"
                onDrag={(p) => handleLineDrag("bottom", p)}
                minPos={imageLayout.height - maxBorderV}
                maxPos={imageLayout.height - minBorderV}
              />

              <View
                style={[
                  styles.borderShade,
                  { left: 0, top: 0, width: positions.left, height: imageLayout.height },
                ]}
                pointerEvents="none"
              />
              <View
                style={[
                  styles.borderShade,
                  { left: positions.right, top: 0, width: imageLayout.width - positions.right, height: imageLayout.height },
                ]}
                pointerEvents="none"
              />
              <View
                style={[
                  styles.borderShade,
                  { left: positions.left, top: 0, width: positions.right - positions.left, height: positions.top },
                ]}
                pointerEvents="none"
              />
              <View
                style={[
                  styles.borderShade,
                  {
                    left: positions.left,
                    top: positions.bottom,
                    width: positions.right - positions.left,
                    height: imageLayout.height - positions.bottom,
                  },
                ]}
                pointerEvents="none"
              />
            </View>
          )}
        </View>
      </View>

      <View style={styles.sideToggle}>
        <Pressable
          style={[styles.sideBtn, showFront && styles.sideBtnActive]}
          onPress={() => setShowFront(true)}
        >
          <Text style={[styles.sideBtnText, showFront && styles.sideBtnTextActive]}>Front</Text>
        </Pressable>
        <Pressable
          style={[styles.sideBtn, !showFront && styles.sideBtnActive]}
          onPress={() => setShowFront(false)}
        >
          <Text style={[styles.sideBtnText, !showFront && styles.sideBtnTextActive]}>Back</Text>
        </Pressable>
      </View>

      <View style={styles.gradePreview}>
        <GradeRow company="PSA" front10={55} back10={75} centering={localCentering} />
        <GradeRow company="BGS" front10={50} back10={50} centering={localCentering} />
        <GradeRow company="Ace" front10={60} back10={60} centering={localCentering} />
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + webBottomInset + 8 }]}>
        <Pressable
          onPress={handleReset}
          style={({ pressed }) => [styles.resetBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="refresh" size={16} color={Colors.textSecondary} />
          <Text style={styles.resetText}>Reset to AI</Text>
        </Pressable>
        <Text style={styles.hintText}>Drag the colored lines to adjust borders</Text>
      </View>
    </View>
  );
}

interface GradeRowProps {
  company: string;
  front10: number;
  back10: number;
  centering: CenteringMeasurement;
}

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
        <Text style={styles.gradeReqText}>
          {front10}/{100 - front10} / {back10}/{100 - back10}
        </Text>
      </View>
      <View style={[styles.gradeBadge, { backgroundColor: color + "20" }]}>
        <View style={[styles.gradeDot, { backgroundColor: color }]} />
        <Text style={[styles.gradeLabel, { color }]}>{label}</Text>
      </View>
    </View>
  );
}

const lineStyles = StyleSheet.create({
  verticalContainer: {
    position: "absolute",
    top: 0,
    zIndex: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  verticalLine: {
    position: "absolute",
    width: 2,
    height: "100%",
    left: LINE_HIT_AREA / 2 - 1,
  },
  handle: {
    width: 20,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    left: 0,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
  handleDots: {
    gap: 3,
  },
  handleDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.8)",
  },
  horizontalContainer: {
    position: "absolute",
    left: 0,
    zIndex: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  horizontalLine: {
    position: "absolute",
    height: 2,
    width: "100%",
    top: LINE_HIT_AREA / 2 - 1,
  },
  handleH: {
    width: 40,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    top: 0,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
  handleDotsH: {
    flexDirection: "row",
    gap: 3,
  },
  lineLabel: {
    position: "absolute",
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  lineLabelH: {
    position: "absolute",
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerBtn: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
  ratioBar: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    paddingVertical: 8,
    marginHorizontal: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
  },
  ratioItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ratioLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
  },
  ratioValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  ratioSep: {
    width: 1,
    height: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  imageArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  imageContainer: {
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
  },
  imageClip: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  linesOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  borderShade: {
    position: "absolute",
    backgroundColor: "rgba(255, 60, 49, 0.12)",
  },
  sideToggle: {
    flexDirection: "row",
    marginHorizontal: 60,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: 3,
    marginVertical: 6,
  },
  sideBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  sideBtnActive: {
    backgroundColor: Colors.primary,
  },
  sideBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textMuted,
  },
  sideBtnTextActive: {
    color: "#fff",
  },
  gradePreview: {
    marginHorizontal: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  gradeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  gradeCompany: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
    width: 34,
  },
  gradeReq: {
    flex: 1,
  },
  gradeReqText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  gradeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  gradeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  gradeLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  resetText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  hintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
});
