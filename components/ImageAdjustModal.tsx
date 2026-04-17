import React, { useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Modal, Dimensions, Platform } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import ViewShot, { captureRef } from "react-native-view-shot";
import Colors from "@/constants/colors";

interface ImageAdjustModalProps {
  visible: boolean;
  imageUri: string;
  onConfirm: (uri: string) => void;
  onCancel: () => void;
}

const MIN_SCALE = 0.3;
const MAX_SCALE = 1.0;
const SCALE_STEP = 0.05;
const CARD_ASPECT = 63 / 88;
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PREVIEW_WIDTH = SCREEN_WIDTH - 64;
const PREVIEW_HEIGHT = PREVIEW_WIDTH / CARD_ASPECT;

export default function ImageAdjustModal({ visible, imageUri, onConfirm, onCancel }: ImageAdjustModalProps) {
  const insets = useSafeAreaInsets();
  const [scale, setScale] = useState(1);
  const viewShotRef = useRef<any>(null);

  const handleZoomOut = useCallback(() => {
    setScale((s) => {
      const next = Math.max(MIN_SCALE, s - SCALE_STEP);
      if (Platform.OS !== "web") Haptics.selectionAsync();
      return next;
    });
  }, []);

  const handleZoomIn = useCallback(() => {
    setScale((s) => {
      const next = Math.min(MAX_SCALE, s + SCALE_STEP);
      if (Platform.OS !== "web") Haptics.selectionAsync();
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    if (Platform.OS !== "web") Haptics.selectionAsync();
  }, []);

  const handleConfirm = useCallback(async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (scale >= 0.95) {
      onConfirm(imageUri);
      setScale(1);
      return;
    }

    try {
      const uri = await captureRef(viewShotRef, {
        format: "jpg",
        quality: 0.9,
      });
      onConfirm(uri);
      setScale(1);
    } catch {
      onConfirm(imageUri);
      setScale(1);
    }
  }, [scale, imageUri, onConfirm]);

  const handleCancel = useCallback(() => {
    setScale(1);
    onCancel();
  }, [onCancel]);

  const scalePercent = Math.round(scale * 100);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.header}>
          <Pressable onPress={handleCancel} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Adjust Photo</Text>
          <View style={{ width: 60 }} />
        </View>

        <Text style={styles.subtitle}>
          Resize the photo so the card fits within the frame
        </Text>

        <View style={styles.previewArea}>
          <View
            ref={viewShotRef}
            collapsable={false}
            style={styles.cardFrame}
          >
            <View style={styles.imageContainer}>
              <View style={[styles.scaledImage, { transform: [{ scale }] }]}>
                <Image source={{ uri: imageUri }} style={styles.fullImage} contentFit="cover" />
              </View>
            </View>
          </View>

          <View style={styles.frameBorder} pointerEvents="none">
            <View style={[styles.cornerMark, styles.cornerTL]} />
            <View style={[styles.cornerMark, styles.cornerTR]} />
            <View style={[styles.cornerMark, styles.cornerBL]} />
            <View style={[styles.cornerMark, styles.cornerBR]} />
          </View>
        </View>

        <View style={styles.controlsArea}>
          <View style={styles.zoomRow}>
            <Pressable
              onPress={handleZoomOut}
              disabled={scale <= MIN_SCALE}
              style={({ pressed }) => [styles.zoomBtn, { opacity: scale <= MIN_SCALE ? 0.3 : pressed ? 0.6 : 1 }]}
            >
              <Ionicons name="remove" size={22} color="#fff" />
            </Pressable>

            <View style={styles.scaleInfo}>
              <Text style={styles.scaleText}>{scalePercent}%</Text>
              <View style={styles.scaleBar}>
                <View style={[styles.scaleBarFill, { width: `${((scale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE)) * 100}%` }]} />
              </View>
            </View>

            <Pressable
              onPress={handleZoomIn}
              disabled={scale >= MAX_SCALE}
              style={({ pressed }) => [styles.zoomBtn, { opacity: scale >= MAX_SCALE ? 0.3 : pressed ? 0.6 : 1 }]}
            >
              <Ionicons name="add" size={22} color="#fff" />
            </Pressable>
          </View>

          {scale < 0.95 && (
            <Pressable
              onPress={handleReset}
              style={({ pressed }) => [styles.resetLink, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Ionicons name="refresh" size={14} color={Colors.textSecondary} />
              <Text style={styles.resetText}>Reset to original</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.bottomBar}>
          <Pressable
            onPress={handleConfirm}
            style={({ pressed }) => [styles.confirmBtn, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={styles.confirmText}>Use This Photo</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 44,
  },
  cancelText: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: Colors.primary,
    width: 60,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: "#fff",
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
    paddingHorizontal: 32,
  },
  previewArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardFrame: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.surface,
  },
  imageContainer: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  scaledImage: {
    width: "100%",
    height: "100%",
  },
  fullImage: {
    width: "100%",
    height: "100%",
  },
  frameBorder: {
    position: "absolute",
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  cornerMark: {
    position: "absolute",
    width: 20,
    height: 20,
    borderColor: "#fff",
  },
  cornerTL: {
    top: -1,
    left: -1,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: -1,
    right: -1,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: -1,
    right: -1,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 12,
  },
  controlsArea: {
    paddingVertical: 20,
    alignItems: "center",
    gap: 12,
  },
  zoomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 32,
  },
  zoomBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  scaleInfo: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  scaleText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  scaleBar: {
    width: "100%",
    height: 4,
    backgroundColor: Colors.surface,
    borderRadius: 2,
    overflow: "hidden",
  },
  scaleBarFill: {
    height: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  resetLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  resetText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  confirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
});
