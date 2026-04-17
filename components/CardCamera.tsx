import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  Dimensions,
  Animated as RNAnimated,
  Linking,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Accelerometer from "expo-sensors/build/Accelerometer";
import * as ImageManipulator from "expo-image-manipulator";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

const GUIDE_FRAME_W = 280;
const GUIDE_FRAME_H = 392;
const CROP_PADDING = 20;
const FOCUS_SQUARE_SIZE = 70;

// Anti-shake: magnitude delta per 100ms reading that counts as "moving"
const SHAKE_THRESHOLD = 0.035;
// How long phone must be still before shutter is re-enabled (ms)
const STABLE_WINDOW_MS = 280;

interface CardCameraProps {
  side: "front" | "back";
  isAngled?: boolean;
  isSlabMode?: boolean;
  stepLabel?: string;
  fastMode?: boolean;
  onCapture: (uri: string) => void;
  onClose: () => void;
  deepGradeFlow?: {
    currentStep: number;
    totalSteps: number;
    stepTitle: string;
    stepSubtitle: string;
    stepIcon: keyof typeof Ionicons.glyphMap;
    isCornerStep: boolean;
  };
}

const LEVEL_THRESHOLD = 5;
const ANGLED_TARGET = 25;
const ANGLED_THRESHOLD = 5;
const BUBBLE_RANGE = 22;

export default function CardCamera({ side, isAngled = false, isSlabMode = false, stepLabel, fastMode = false, onCapture, onClose, deepGradeFlow }: CardCameraProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const [focusing, setFocusing] = useState(false);
  const cameraRef = useRef<any>(null);
  const flashOpacity = useRef(new RNAnimated.Value(0)).current;
  const feedbackTextOpacity = useRef(new RNAnimated.Value(0)).current;
  const feedbackScale = useRef(new RNAnimated.Value(0.5)).current;
  const [showCapturedFlash, setShowCapturedFlash] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");

  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const focusOpacity = useRef(new RNAnimated.Value(0)).current;
  const focusScale = useRef(new RNAnimated.Value(1.4)).current;
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ZOOM_LEVELS = [1, 1.5, 2, 3];
  const [zoomIndex, setZoomIndex] = useState(0);
  const currentZoom = ZOOM_LEVELS[zoomIndex];

  // Torch
  const [torchOn, setTorchOn] = useState(false);

  // Anti-shake state
  const [isShaking, setIsShaking] = useState(false);
  const lastAccelRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const shakeStableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tilt-warning animation
  const tiltWarnOpacity = useRef(new RNAnimated.Value(0)).current;
  const tiltWarnScale = useRef(new RNAnimated.Value(0.85)).current;
  const [showTiltWarning, setShowTiltWarning] = useState(false);

  const cycleZoom = () => {
    const next = (zoomIndex + 1) % ZOOM_LEVELS.length;
    setZoomIndex(next);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const CAPTURE_MESSAGES = [
    "Nice work!",
    "Got it!",
    "Perfect!",
    "Looking good!",
    "Great shot!",
    "Nailed it!",
    "Spot on!",
    "Sharp!",
  ];

  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);
  const [isLevel, setIsLevel] = useState(false);
  const [accelStatus, setAccelStatus] = useState("init");
  const subscriptionRef = useRef<any>(null);
  const isAngledRef = useRef(isAngled);

  useEffect(() => {
    isAngledRef.current = isAngled;
  }, [isAngled]);

  useEffect(() => {
    if (Platform.OS === "web") {
      setAccelStatus("web-skip");
      return;
    }

    let mounted = true;

    const start = async () => {
      try {
        setAccelStatus("checking...");
        const avail = await Accelerometer.isAvailableAsync();
        if (!mounted) return;

        if (!avail) {
          setAccelStatus("not-available");
          return;
        }

        setAccelStatus("subscribing...");
        Accelerometer.setUpdateInterval(100);

        subscriptionRef.current = Accelerometer.addListener(
          (data: { x: number; y: number; z: number }) => {
            if (!mounted) return;

            // --- Level / tilt ---
            const tx = Math.round(
              Math.atan2(data.x, Math.sqrt(data.y * data.y + data.z * data.z)) * (180 / Math.PI)
            );
            const ty = Math.round(
              Math.atan2(data.y, Math.sqrt(data.x * data.x + data.z * data.z)) * (180 / Math.PI)
            );
            setTiltX(tx);
            setTiltY(ty);
            if (isAngledRef.current) {
              const yInRange = Math.abs(ty - ANGLED_TARGET) <= ANGLED_THRESHOLD;
              const xInRange = Math.abs(tx) <= LEVEL_THRESHOLD;
              setIsLevel(xInRange && yInRange);
            } else {
              setIsLevel(Math.abs(tx) <= LEVEL_THRESHOLD && Math.abs(ty) <= LEVEL_THRESHOLD);
            }
            setAccelStatus("active");

            // --- Anti-shake detection ---
            const mag = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
            const last = lastAccelRef.current;
            if (last !== null) {
              const lastMag = Math.sqrt(last.x * last.x + last.y * last.y + last.z * last.z);
              const delta = Math.abs(mag - lastMag);
              if (delta > SHAKE_THRESHOLD) {
                setIsShaking(true);
                if (shakeStableTimerRef.current) clearTimeout(shakeStableTimerRef.current);
                shakeStableTimerRef.current = setTimeout(() => {
                  if (mounted) setIsShaking(false);
                }, STABLE_WINDOW_MS);
              }
            }
            lastAccelRef.current = { x: data.x, y: data.y, z: data.z };
          }
        );
      } catch (err: any) {
        if (mounted) setAccelStatus("error: " + (err?.message || String(err)));
      }
    };

    start();

    return () => {
      mounted = false;
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      if (shakeStableTimerRef.current) clearTimeout(shakeStableTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isAngled) {
      setIsLevel(false);
    }
  }, [isAngled]);

  // Auto-focus at card guide centre when camera opens
  useEffect(() => {
    if (Platform.OS === "web") return;
    const { width: screenW, height: screenH } = Dimensions.get("window");
    const centreX = screenW / 2;
    const centreY = screenH / 2;

    const timer = setTimeout(() => {
      triggerFocus(centreX, centreY, false);
    }, 350);

    return () => clearTimeout(timer);
  }, []);

  const triggerFocus = useCallback((x: number, y: number, withHaptic = true) => {
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    setFocusPoint({ x, y });

    if (withHaptic && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    focusScale.setValue(1.4);
    focusOpacity.setValue(1);
    RNAnimated.parallel([
      RNAnimated.spring(focusScale, { toValue: 1, friction: 6, tension: 160, useNativeDriver: true }),
      RNAnimated.timing(focusOpacity, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();

    focusTimerRef.current = setTimeout(() => {
      RNAnimated.timing(focusOpacity, { toValue: 0, duration: 600, useNativeDriver: true }).start(() => {
        setFocusPoint(null);
      });
    }, 1200);
  }, [focusOpacity, focusScale]);

  const handleTapToFocus = (evt: any) => {
    const { locationX, locationY } = evt.nativeEvent;
    triggerFocus(locationX, locationY, true);
  };

  const showTiltWarningBanner = () => {
    if (showTiltWarning) return;
    setShowTiltWarning(true);
    tiltWarnOpacity.setValue(0);
    tiltWarnScale.setValue(0.85);
    RNAnimated.parallel([
      RNAnimated.spring(tiltWarnScale, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
      RNAnimated.timing(tiltWarnOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        RNAnimated.timing(tiltWarnOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
          setShowTiltWarning(false);
        });
      }, 1400);
    });
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || capturing || focusing) return;

    if (!fastMode) {
      // Soft tilt lock — warn instead of fire
      if (!isLevel && accelStatus === "active" && !isAngled) {
        showTiltWarningBanner();
        return;
      }

      // Show "Focusing..." state briefly to let the camera's autofocus system
      // settle before firing the shutter.
      setFocusing(true);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      await new Promise(r => setTimeout(r, 600));
      setFocusing(false);
    }

    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1.0,
        base64: false,
        skipMetadata: false,
      });
      if (photo?.uri) {
        const cropped = await cropToGuideFrame(photo.uri, photo.width, photo.height);

        if ((deepGradeFlow || fastMode) && Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        if (deepGradeFlow || fastMode) {
          const msg = CAPTURE_MESSAGES[Math.floor(Math.random() * CAPTURE_MESSAGES.length)];
          setFeedbackMessage(msg);
          setShowCapturedFlash(true);
          feedbackTextOpacity.setValue(0);
          feedbackScale.setValue(0.7);
          RNAnimated.parallel([
            RNAnimated.timing(flashOpacity, { toValue: 0.35, duration: 200, useNativeDriver: true }),
            RNAnimated.spring(feedbackScale, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
            RNAnimated.timing(feedbackTextOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
          ]).start(() => {
            setTimeout(() => {
              RNAnimated.parallel([
                RNAnimated.timing(flashOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
                RNAnimated.timing(feedbackTextOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
              ]).start(() => {
                setShowCapturedFlash(false);
                setFeedbackMessage("");
              });
            }, 500);
          });
        }

        onCapture(cropped);
      }
    } catch (e) {
      console.error("Camera capture error:", e);
    } finally {
      setCapturing(false);
    }
  };

  const cropToGuideFrame = async (uri: string, photoW: number, photoH: number): Promise<string> => {
    try {
      const { width: screenW, height: screenH } = Dimensions.get("window");

      // Android cameras return raw sensor dimensions (often landscape) with EXIF rotation.
      // Bake the EXIF rotation into the image first so crop coords are calculated correctly.
      let workUri = uri;
      let workW = photoW;
      let workH = photoH;
      if (Platform.OS === "android") {
        const normalized = await ImageManipulator.manipulateAsync(uri, [], {
          compress: 1,
          format: ImageManipulator.SaveFormat.JPEG,
        });
        workUri = normalized.uri;
        workW = normalized.width;
        workH = normalized.height;
      }

      const activeIsCorner = deepGradeFlow?.isCornerStep ?? false;
      const activeGuideW = activeIsCorner ? 180 : GUIDE_FRAME_W;
      const activeGuideH = activeIsCorner ? 180 : isSlabMode ? 430 : GUIDE_FRAME_H;

      const paddedW = activeGuideW + CROP_PADDING * 2;
      const paddedH = activeGuideH + CROP_PADDING * 2;
      const frameX = (screenW - paddedW) / 2;
      const frameY = (screenH - paddedH) / 2;

      const screenAspect = screenW / screenH;
      const photoAspect = workW / workH;

      let scale: number, offsetX: number, offsetY: number;
      if (photoAspect > screenAspect) {
        scale = workH / screenH;
        offsetX = (workW - screenW * scale) / 2;
        offsetY = 0;
      } else {
        scale = workW / screenW;
        offsetX = 0;
        offsetY = (workH - screenH * scale) / 2;
      }

      const cropX = Math.max(0, Math.round(offsetX + frameX * scale));
      const cropY = Math.max(0, Math.round(offsetY + frameY * scale));
      const cropW = Math.min(Math.round(paddedW * scale), workW - cropX);
      const cropH = Math.min(Math.round(paddedH * scale), workH - cropY);

      const result = await ImageManipulator.manipulateAsync(
        workUri,
        [{ crop: { originX: cropX, originY: cropY, width: cropW, height: cropH } }],
        { compress: 0.97, format: ImageManipulator.SaveFormat.JPEG }
      );
      return result.uri;
    } catch (e) {
      console.error("Guide crop failed, using original:", e);
      return uri;
    }
  };

  if (!permission) {
    return (
      <View style={styles.permissionContainer}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <View style={styles.permissionCard}>
          <Ionicons name="camera-outline" size={48} color={Colors.primary} />
          <Text style={styles.permissionTitle}>Camera Access Needed</Text>
          <Text style={styles.permissionDesc}>
            We need camera access to photograph your card for grading.
          </Text>
          {!permission.canAskAgain && permission.status === "denied" ? (
            <>
              <Text style={styles.permissionDesc}>
                Camera access was previously denied. Please enable it in your device settings to use this feature.
              </Text>
              <Pressable
                onPress={() => Linking.openSettings()}
                style={({ pressed }) => [
                  styles.permissionBtn,
                  { opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={styles.permissionBtnText}>Open Settings</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={requestPermission}
              style={({ pressed }) => [
                styles.permissionBtn,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={styles.permissionBtnText}>Continue</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  const angledAccentColor = "#F59E0B";
  const frameColor = isLevel ? "#10B981" : isAngled ? angledAccentColor : Colors.primary;
  const frameBorderColor = isLevel ? "rgba(16,185,129,0.35)" : isAngled ? "rgba(245,158,11,0.35)" : "rgba(255,255,255,0.25)";
  const levelColor = isLevel ? "#10B981" : isAngled ? angledAccentColor : Colors.primary;

  const bubbleX = Math.max(-BUBBLE_RANGE, Math.min(BUBBLE_RANGE, tiltX * 2));
  const rawBubbleY = isAngled ? -(tiltY - ANGLED_TARGET) * 2 : -tiltY * 2;
  const bubbleY = Math.max(-BUBBLE_RANGE, Math.min(BUBBLE_RANGE, rawBubbleY));

  const isCorner = deepGradeFlow?.isCornerStep ?? false;
  const guideW = isCorner ? 180 : GUIDE_FRAME_W;
  const guideH = isCorner ? 180 : isSlabMode ? 430 : GUIDE_FRAME_H;

  // Shutter is blocked when phone is actively shaking or when not level (for non-angled shots)
  const isMotionBlocked = !fastMode && Platform.OS !== "web" && accelStatus === "active" && isShaking;
  const isShutterBlocked = capturing || focusing || isMotionBlocked;

  // Determine shutter ring / inner colour
  const shutterBorderColor = focusing
    ? "#FACC15"
    : isMotionBlocked
      ? "#EF4444"
      : isLevel
        ? "#10B981"
        : isAngled
          ? angledAccentColor
          : "#fff";
  const shutterInnerColor = focusing
    ? "#FACC15"
    : isMotionBlocked
      ? "#EF4444"
      : isLevel
        ? "#10B981"
        : isAngled
          ? angledAccentColor
          : undefined;

  const hintText = isMotionBlocked
    ? "Hold still…"
    : fastMode
      ? (side === "front" ? "Hold the front flat and fill the frame" : "Flip and photograph the back")
      : deepGradeFlow
        ? deepGradeFlow.stepSubtitle
        : isAngled
          ? isLevel
            ? "Perfect angle! Take the photo"
            : "Tilt bottom of phone down ~25\u00B0 to catch the light"
          : isSlabMode
            ? isLevel
              ? "Slab is level. Take the photo!"
              : "Hold phone flat over the slab"
            : isLevel
              ? "Phone is level. Take the photo!"
              : "Hold phone flat and parallel to card";

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        zoom={(currentZoom - 1) / 3}
        enableTorch={torchOn}
      />

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleTapToFocus}
      />

      {focusPoint && (
        <RNAnimated.View
          pointerEvents="none"
          style={[
            styles.focusSquare,
            {
              left: focusPoint.x - FOCUS_SQUARE_SIZE / 2,
              top: focusPoint.y - FOCUS_SQUARE_SIZE / 2,
              opacity: focusOpacity,
              transform: [{ scale: focusScale }],
            },
          ]}
        />
      )}

      {showCapturedFlash && (
        <RNAnimated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: "#10B981", opacity: flashOpacity, zIndex: 200, alignItems: "center", justifyContent: "center" }]}
          pointerEvents="none"
        >
          <RNAnimated.View style={{ opacity: feedbackTextOpacity, transform: [{ scale: feedbackScale }], alignItems: "center", gap: 8 }}>
            <View style={styles.feedbackCheckCircle}>
              <Ionicons name="checkmark" size={32} color="#fff" />
            </View>
            <Text style={styles.feedbackText}>{feedbackMessage}</Text>
          </RNAnimated.View>
        </RNAnimated.View>
      )}

      {/* Tilt warning banner */}
      {showTiltWarning && (
        <RNAnimated.View
          pointerEvents="none"
          style={[
            styles.tiltWarningBanner,
            {
              top: insets.top + 100,
              opacity: tiltWarnOpacity,
              transform: [{ scale: tiltWarnScale }],
            },
          ]}
        >
          <Ionicons name="warning-outline" size={16} color="#FACC15" />
          <Text style={styles.tiltWarningText}>Level the phone first</Text>
        </RNAnimated.View>
      )}

      <View style={[styles.overlay, { paddingTop: insets.top + 12 }]} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeBtn,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {deepGradeFlow ? (
            <View style={styles.deepFlowHeader}>
              <View style={styles.deepFlowStepBadge}>
                <Text style={styles.deepFlowStepNum}>{deepGradeFlow.currentStep}</Text>
                <Text style={styles.deepFlowStepTotal}> / {deepGradeFlow.totalSteps}</Text>
              </View>
              <Text style={styles.sideLabel} numberOfLines={1}>{deepGradeFlow.stepTitle}</Text>
            </View>
          ) : (
            <Text style={styles.sideLabel} numberOfLines={2}>
              {stepLabel
                ? stepLabel
                : isAngled
                  ? side === "front" ? "Front \u2014 Angled" : "Back \u2014 Angled"
                  : isSlabMode
                    ? side === "front" ? "Front of Slab" : "Back of Slab"
                    : side === "front" ? "Front of Card" : "Back of Card"}
            </Text>
          )}
          {/* Torch toggle */}
          {Platform.OS !== "web" && (
            <Pressable
              onPress={() => {
                setTorchOn(v => !v);
                if (Platform.OS !== "web") {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
              }}
              style={({ pressed }) => [
                styles.torchBtn,
                torchOn && styles.torchBtnActive,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons
                name={torchOn ? "flashlight" : "flashlight-outline"}
                size={20}
                color={torchOn ? "#000" : "#fff"}
              />
            </Pressable>
          )}
          {Platform.OS === "web" && <View style={{ width: 44 }} />}
        </View>

        {deepGradeFlow && (
          <View style={styles.deepProgressContainer}>
            <View style={styles.deepProgressBarOuter}>
              <View style={[styles.deepProgressBarInner, { width: `${((deepGradeFlow.currentStep - 1) / deepGradeFlow.totalSteps) * 100}%` }]} />
            </View>
          </View>
        )}

        <View style={styles.centerContent} pointerEvents="none">
          <View style={[styles.cardFrame, { borderColor: frameBorderColor, width: guideW, height: guideH }]}>
            <View style={[styles.corner, styles.cornerTL, { borderTopColor: frameColor, borderLeftColor: frameColor }]} />
            <View style={[styles.corner, styles.cornerTR, { borderTopColor: frameColor, borderRightColor: frameColor }]} />
            <View style={[styles.corner, styles.cornerBL, { borderBottomColor: frameColor, borderLeftColor: frameColor }]} />
            <View style={[styles.corner, styles.cornerBR, { borderBottomColor: frameColor, borderRightColor: frameColor }]} />
            {isSlabMode && (
              <View style={[styles.slabLabelSeparator, { top: guideH * 0.22, borderColor: "rgba(139,92,246,0.45)" }]} />
            )}
          </View>
        </View>

        {Platform.OS !== "web" && !isCorner && (
          <View style={[styles.levelBadge, { top: insets.top + 60 }]}>
            <View style={[styles.levelCircle, { borderColor: levelColor }]}>
              <View style={styles.crossH} />
              <View style={styles.crossV} />
              <View
                style={[
                  styles.bubble,
                  {
                    backgroundColor: levelColor,
                    transform: [{ translateX: bubbleX }, { translateY: bubbleY }],
                  },
                ]}
              />
              <View style={[styles.centerRing, { borderColor: levelColor }]} />
            </View>
            <View style={styles.levelLabelRow}>
              <Ionicons
                name={isLevel ? "checkmark-circle" : "navigate-outline"}
                size={12}
                color={levelColor}
              />
              <Text style={[styles.levelLabelText, { color: levelColor }]}>
                {accelStatus === "active"
                  ? isLevel
                    ? isAngled ? "Good angle" : "Level"
                    : isAngled ? `Tilt: ${Math.abs(tiltY)}\u00B0 / ${ANGLED_TARGET}\u00B0` : `${tiltX}\u00B0 / ${tiltY}\u00B0`
                  : accelStatus}
              </Text>
            </View>
          </View>
        )}

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.hintRow}>
            {isMotionBlocked ? (
              <View style={styles.shakeRow}>
                <ActivityIndicator size="small" color="#EF4444" style={{ marginRight: 6 }} />
                <Text style={[styles.hintText, { color: "#EF4444" }]}>{hintText}</Text>
              </View>
            ) : (
              <Text style={styles.hintText} numberOfLines={3}>
                {hintText}
              </Text>
            )}
          </View>
          <View style={styles.captureRow}>
            <Pressable
              onPress={cycleZoom}
              style={({ pressed }) => [
                styles.zoomBtn,
                currentZoom > 1 && styles.zoomBtnActive,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.zoomBtnText, currentZoom > 1 && styles.zoomBtnTextActive]}>
                {currentZoom % 1 === 0 ? `${currentZoom}x` : `${currentZoom}x`}
              </Text>
            </Pressable>
            <View style={styles.captureBtnWrapper}>
              {focusing && (
                <View style={styles.focusingBadge}>
                  <ActivityIndicator color="#fff" size="small" style={{ marginRight: 4 }} />
                  <Text style={styles.focusingText}>Focusing</Text>
                </View>
              )}
              {isMotionBlocked && !focusing && (
                <View style={[styles.focusingBadge, { borderColor: "#EF4444" }]}>
                  <Ionicons name="hand-left-outline" size={14} color="#EF4444" style={{ marginRight: 4 }} />
                  <Text style={[styles.focusingText, { color: "#EF4444" }]}>Hold still</Text>
                </View>
              )}
              <Pressable
                onPress={handleCapture}
                disabled={isShutterBlocked}
                style={({ pressed }) => [
                  styles.captureBtn,
                  {
                    opacity: isShutterBlocked ? 0.6 : pressed ? 0.8 : 1,
                    borderColor: shutterBorderColor,
                  },
                ]}
              >
                <View style={[
                  styles.captureBtnInner,
                  shutterInnerColor ? { backgroundColor: shutterInnerColor } : undefined,
                ]}>
                  {(capturing || focusing) ? (
                    <ActivityIndicator color={Colors.background} size="small" />
                  ) : (
                    <View style={[
                      styles.captureDot,
                      isLevel && { backgroundColor: "#10B981" },
                      !isLevel && isAngled && { backgroundColor: angledAccentColor },
                      isMotionBlocked && { backgroundColor: "#EF4444" },
                    ]} />
                  )}
                </View>
              </Pressable>
            </View>
            <View style={{ width: 60 }} />
          </View>
        </View>
      </View>
    </View>
  );
}

const CORNER_SIZE = 28;
const CORNER_WIDTH = 3;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 100,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 22,
  },
  torchBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
  },
  torchBtnActive: {
    backgroundColor: "#FFD60A",
    borderColor: "#FFD60A",
  },
  sideLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  deepFlowHeader: {
    alignItems: "center",
    gap: 4,
  },
  deepFlowStepBadge: {
    flexDirection: "row",
    alignItems: "baseline",
    backgroundColor: "rgba(245,158,11,0.85)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  deepFlowStepNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#fff",
  },
  deepFlowStepTotal: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
  },
  deepProgressContainer: {
    paddingHorizontal: 40,
    marginTop: 8,
  },
  deepProgressBarOuter: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 2,
    overflow: "hidden",
  },
  deepProgressBarInner: {
    height: "100%",
    backgroundColor: "#F59E0B",
    borderRadius: 2,
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardFrame: {
    width: GUIDE_FRAME_W,
    height: GUIDE_FRAME_H,
    borderWidth: 1,
    borderRadius: 10,
  },
  slabLabelSeparator: {
    position: "absolute",
    left: 8,
    right: 8,
    height: 0,
    borderTopWidth: 1,
    borderStyle: "dashed",
  },
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    top: -1,
    left: -1,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderTopLeftRadius: 10,
  },
  cornerTR: {
    top: -1,
    right: -1,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderTopRightRadius: 10,
  },
  cornerBL: {
    bottom: -1,
    left: -1,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderBottomLeftRadius: 10,
  },
  cornerBR: {
    bottom: -1,
    right: -1,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderBottomRightRadius: 10,
  },
  levelBadge: {
    position: "absolute",
    right: 16,
    alignItems: "center",
    gap: 4,
  },
  levelCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    overflow: "hidden",
  },
  crossH: {
    position: "absolute",
    width: "100%",
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  crossV: {
    position: "absolute",
    width: StyleSheet.hairlineWidth,
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  bubble: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  centerRing: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    opacity: 0.4,
  },
  levelLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  levelLabelText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
  },
  bottomBar: {
    paddingHorizontal: 20,
    gap: 16,
  },
  hintRow: {
    alignItems: "center",
  },
  shakeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  hintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    paddingHorizontal: 16,
  },
  captureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  captureBtnInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  captureDot: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#fff",
  },
  permissionContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 24,
  },
  permissionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    gap: 12,
    width: "100%",
    maxWidth: 320,
  },
  permissionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: Colors.text,
    marginTop: 8,
  },
  permissionDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  permissionBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  permissionBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
  feedbackCheckCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  feedbackText: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: "#fff",
    textAlign: "center",
  },
  focusSquare: {
    position: "absolute",
    width: FOCUS_SQUARE_SIZE,
    height: FOCUS_SQUARE_SIZE,
    borderWidth: 1.5,
    borderColor: "#FFD60A",
    borderRadius: 2,
    zIndex: 150,
  },
  zoomBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  zoomBtnActive: {
    backgroundColor: "rgba(255,210,10,0.85)",
  },
  zoomBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
  zoomBtnTextActive: {
    color: "#000",
  },
  captureBtnWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  focusingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#FACC15",
  },
  focusingText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#FACC15",
    letterSpacing: 0.5,
  },
  tiltWarningBanner: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.8)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: "#FACC15",
    zIndex: 300,
  },
  tiltWarningText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#FACC15",
  },
});
