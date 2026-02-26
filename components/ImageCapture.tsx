import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS } from "react-native-reanimated";
import Colors from "@/constants/colors";

interface ImageCaptureProps {
  label: string;
  imageUri: string | null;
  onCapture: () => void;
  onRemove: () => void;
  loading?: boolean;
}

const MIN_SCALE = 0.35;
const MAX_SCALE = 1.0;
const SCALE_STEP = 0.1;

function ZoomableImage({ uri }: { uri: string }) {
  const scale = useSharedValue(1);
  const baseScale = useSharedValue(1);
  const [displayScale, setDisplayScale] = useState(1);

  const syncScale = useCallback((val: number) => {
    setDisplayScale(val);
  }, []);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      "worklet";
      baseScale.value = scale.value;
      runOnJS(console.log)("[ZoomableImage] pinch onStart, base=" + baseScale.value);
    })
    .onUpdate((e) => {
      "worklet";
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, baseScale.value * e.scale));
      scale.value = newScale;
    })
    .onEnd(() => {
      "worklet";
      runOnJS(console.log)("[ZoomableImage] pinch onEnd, scale=" + scale.value);
      runOnJS(syncScale)(scale.value);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleZoomOut = useCallback(() => {
    const newScale = Math.max(MIN_SCALE, (displayScale || 1) - SCALE_STEP);
    scale.value = withSpring(newScale, { damping: 15, stiffness: 150 });
    baseScale.value = newScale;
    setDisplayScale(newScale);
  }, [displayScale]);

  const handleZoomIn = useCallback(() => {
    const newScale = Math.min(MAX_SCALE, (displayScale || 1) + SCALE_STEP);
    scale.value = withSpring(newScale, { damping: 15, stiffness: 150 });
    baseScale.value = newScale;
    setDisplayScale(newScale);
  }, [displayScale]);

  const handleReset = useCallback(() => {
    scale.value = withSpring(1, { damping: 15 });
    baseScale.value = 1;
    setDisplayScale(1);
  }, []);

  const isZoomed = displayScale < 0.95;
  const scalePercent = Math.round(displayScale * 100);

  return (
    <GestureDetector gesture={pinch}>
      <Animated.View style={styles.zoomContainer}>
        <Animated.View style={[styles.zoomImageBox, animatedStyle]}>
          <Image source={{ uri }} style={styles.image} contentFit="cover" />
        </Animated.View>

        <View style={styles.zoomControls}>
          <Pressable
            onPress={handleZoomOut}
            style={({ pressed }) => [styles.zoomBtn, { opacity: pressed ? 0.6 : 1 }]}
            hitSlop={8}
          >
            <Ionicons name="remove" size={16} color="#fff" />
          </Pressable>

          <Text style={styles.zoomPercent}>{scalePercent}%</Text>

          <Pressable
            onPress={handleZoomIn}
            disabled={displayScale >= MAX_SCALE}
            style={({ pressed }) => [styles.zoomBtn, { opacity: displayScale >= MAX_SCALE ? 0.3 : pressed ? 0.6 : 1 }]}
            hitSlop={8}
          >
            <Ionicons name="add" size={16} color="#fff" />
          </Pressable>

          {isZoomed && (
            <Pressable
              onPress={handleReset}
              style={({ pressed }) => [styles.zoomBtn, { opacity: pressed ? 0.6 : 1, marginLeft: 4 }]}
              hitSlop={8}
            >
              <Ionicons name="refresh" size={13} color="#fff" />
            </Pressable>
          )}
        </View>

        <View style={styles.zoomHint} pointerEvents="none">
          <Ionicons name="resize-outline" size={10} color="rgba(255,255,255,0.7)" />
          <Text style={styles.zoomHintText}>Pinch or use buttons to resize</Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

export default function ImageCapture({ label, imageUri, onCapture, onRemove, loading }: ImageCaptureProps) {
  if (imageUri) {
    return (
      <View style={styles.container}>
        {!!label && <Text style={styles.label}>{label}</Text>}
        <View style={styles.imageWrapper}>
          <ZoomableImage uri={imageUri} />
          {loading && (
            <View style={styles.croppingOverlay}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.croppingText}>Cropping...</Text>
            </View>
          )}
          <Pressable
            style={({ pressed }) => [styles.removeBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={onRemove}
          >
            <Ionicons name="close" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <Pressable
        style={({ pressed }) => [styles.captureArea, { opacity: pressed ? 0.8 : 1 }]}
        onPress={onCapture}
      >
        <View style={styles.iconCircle}>
          <Ionicons name="camera" size={28} color={Colors.primary} />
        </View>
        <Text style={styles.captureText}>Tap to add photo</Text>
        <Text style={styles.captureHint}>Take a photo or choose from library</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 8,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  captureArea: {
    aspectRatio: 0.72,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.surfaceBorder,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  captureText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  captureHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  imageWrapper: {
    aspectRatio: 0.72,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Colors.surface,
  },
  zoomContainer: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  zoomImageBox: {
    width: "100%",
    height: "100%",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  removeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  zoomControls: {
    position: "absolute",
    bottom: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 5,
  },
  zoomBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  zoomPercent: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: "#fff",
    minWidth: 32,
    textAlign: "center",
  },
  zoomHint: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  zoomHintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "rgba(255,255,255,0.5)",
  },
  croppingOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  croppingText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#fff",
  },
});
