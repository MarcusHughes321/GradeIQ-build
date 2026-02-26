import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
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

export default function ImageCapture({ label, imageUri, onCapture, onRemove, loading }: ImageCaptureProps) {
  if (imageUri) {
    return (
      <View style={styles.container}>
        {!!label && <Text style={styles.label}>{label}</Text>}
        <View style={styles.imageWrapper}>
          <Image source={{ uri: imageUri }} style={styles.image} contentFit="cover" />
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
