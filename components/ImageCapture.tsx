import React, { useRef, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Animated, PanResponder, GestureResponderEvent } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface ImageCaptureProps {
  label: string;
  imageUri: string | null;
  onCapture: () => void;
  onRemove: () => void;
  loading?: boolean;
}

const MIN_SCALE = 0.4;
const MAX_SCALE = 1.0;

function getDistance(touches: { pageX: number; pageY: number }[]) {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function ZoomableImage({ uri }: { uri: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const baseScale = useRef(1);
  const pinchStartDist = useRef(0);
  const currentScale = useRef(1);

  useEffect(() => {
    const id = scale.addListener(({ value }) => { currentScale.current = value; });
    return () => { scale.removeListener(id); };
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length >= 2,
      onMoveShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length >= 2,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          baseScale.current = currentScale.current;
          pinchStartDist.current = getDistance(touches);
        }
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          const dist = getDistance(touches);
          const ratio = dist / pinchStartDist.current;
          const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, baseScale.current * ratio));
          scale.setValue(newScale);
        }
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const handleReset = useCallback(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
    baseScale.current = 1;
  }, []);

  return (
    <View style={styles.zoomContainer} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          styles.image,
          { transform: [{ scale }] },
        ]}
      >
        <Image source={{ uri }} style={styles.image} contentFit="cover" />
      </Animated.View>
      <Pressable
        style={({ pressed }) => [styles.resetBtn, { opacity: pressed ? 0.7 : 1 }]}
        onPress={handleReset}
        hitSlop={12}
      >
        <Ionicons name="refresh" size={14} color="#fff" />
      </Pressable>
      <View style={styles.zoomHint} pointerEvents="none">
        <Ionicons name="resize-outline" size={10} color="rgba(255,255,255,0.7)" />
        <Text style={styles.zoomHintText}>Pinch to resize</Text>
      </View>
    </View>
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
  resetBtn: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
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
