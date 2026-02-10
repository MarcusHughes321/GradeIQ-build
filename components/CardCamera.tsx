import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Accelerometer from "expo-sensors/build/Accelerometer";
import Colors from "@/constants/colors";

interface CardCameraProps {
  side: "front" | "back";
  onCapture: (uri: string) => void;
  onClose: () => void;
}

const LEVEL_THRESHOLD = 5;
const BUBBLE_RANGE = 22;

export default function CardCamera({ side, onCapture, onClose }: CardCameraProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<any>(null);

  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);
  const [isLevel, setIsLevel] = useState(false);
  const [accelStatus, setAccelStatus] = useState("init");
  const subscriptionRef = useRef<any>(null);

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
            const tx = Math.round(
              Math.atan2(data.x, Math.sqrt(data.y * data.y + data.z * data.z)) * (180 / Math.PI)
            );
            const ty = Math.round(
              Math.atan2(data.y, Math.sqrt(data.x * data.x + data.z * data.z)) * (180 / Math.PI)
            );
            setTiltX(tx);
            setTiltY(ty);
            setIsLevel(Math.abs(tx) <= LEVEL_THRESHOLD && Math.abs(ty) <= LEVEL_THRESHOLD);
            setAccelStatus("active");
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
    };
  }, []);

  const handleCapture = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });
      if (photo?.uri) {
        onCapture(photo.uri);
      }
    } catch (e) {
      console.error("Camera capture error:", e);
    } finally {
      setCapturing(false);
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
            <Text style={styles.permissionDesc}>
              Please enable camera access in your device settings.
            </Text>
          ) : (
            <Pressable
              onPress={requestPermission}
              style={({ pressed }) => [
                styles.permissionBtn,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={styles.permissionBtnText}>Allow Camera</Text>
            </Pressable>
          )}
          <Pressable onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const frameColor = isLevel ? "#10B981" : Colors.primary;
  const frameBorderColor = isLevel ? "rgba(16,185,129,0.35)" : "rgba(255,255,255,0.25)";
  const levelColor = isLevel ? "#10B981" : Colors.primary;
  const bubbleX = Math.max(-BUBBLE_RANGE, Math.min(BUBBLE_RANGE, tiltX * 2));
  const bubbleY = Math.max(-BUBBLE_RANGE, Math.min(BUBBLE_RANGE, -tiltY * 2));

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
      />

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
          <Text style={styles.sideLabel}>
            {side === "front" ? "Front of Card" : "Back of Card"}
          </Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.centerContent} pointerEvents="none">
          <View style={[styles.cardFrame, { borderColor: frameBorderColor }]}>
            <View style={[styles.corner, styles.cornerTL, { borderTopColor: frameColor, borderLeftColor: frameColor }]} />
            <View style={[styles.corner, styles.cornerTR, { borderTopColor: frameColor, borderRightColor: frameColor }]} />
            <View style={[styles.corner, styles.cornerBL, { borderBottomColor: frameColor, borderLeftColor: frameColor }]} />
            <View style={[styles.corner, styles.cornerBR, { borderBottomColor: frameColor, borderRightColor: frameColor }]} />
          </View>
        </View>

        {Platform.OS !== "web" && (
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
                    ? "Level"
                    : `${tiltX}\u00B0 / ${tiltY}\u00B0`
                  : accelStatus}
              </Text>
            </View>
          </View>
        )}

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.hintRow}>
            <Text style={styles.hintText}>
              {isLevel
                ? "Phone is level. Take the photo!"
                : "Hold phone flat and parallel to card"}
            </Text>
          </View>
          <View style={styles.captureRow}>
            <View style={{ width: 60 }} />
            <Pressable
              onPress={handleCapture}
              disabled={capturing}
              style={({ pressed }) => [
                styles.captureBtn,
                {
                  opacity: capturing ? 0.5 : pressed ? 0.8 : 1,
                  borderColor: isLevel ? "#10B981" : "#fff",
                },
              ]}
            >
              <View style={[styles.captureBtnInner, isLevel && { backgroundColor: "#10B981" }]}>
                {capturing ? (
                  <ActivityIndicator color={Colors.background} size="small" />
                ) : (
                  <View style={[styles.captureDot, isLevel && { backgroundColor: "#10B981" }]} />
                )}
              </View>
            </Pressable>
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
  sideLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardFrame: {
    width: 280,
    height: 392,
    borderWidth: 1,
    borderRadius: 10,
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
  hintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
  cancelBtn: {
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  cancelBtnText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
  },
});
