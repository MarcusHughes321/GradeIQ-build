import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import ImageCapture from "@/components/ImageCapture";
import AnalysisProgress from "@/components/AnalysisProgress";
import { apiRequest } from "@/lib/query-client";
import { saveGrading } from "@/lib/storage";
import type { GradingResult } from "@/lib/types";

export default function GradeScreen() {
  const insets = useSafeAreaInsets();
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [frontBase64, setFrontBase64] = useState<string | null>(null);
  const [backBase64, setBackBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const pickImage = async (side: "front" | "back") => {
    const actionSheet = async () => {
      if (Platform.OS === "web") {
        return launchLibrary(side);
      }

      Alert.alert("Add Photo", "Choose an option", [
        {
          text: "Take Photo",
          onPress: () => launchCamera(side),
        },
        {
          text: "Choose from Library",
          onPress: () => launchLibrary(side),
        },
        { text: "Cancel", style: "cancel" },
      ]);
    };

    await actionSheet();
  };

  const launchCamera = async (side: "front" | "back") => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Camera access is needed to take photos of your card.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.4,
      base64: true,
      allowsEditing: true,
      aspect: [63, 88],
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (side === "front") {
        setFrontImage(asset.uri);
        if (asset.base64) {
          setFrontBase64(`data:image/jpeg;base64,${asset.base64}`);
        } else {
          setFrontBase64(null);
        }
      } else {
        setBackImage(asset.uri);
        if (asset.base64) {
          setBackBase64(`data:image/jpeg;base64,${asset.base64}`);
        } else {
          setBackBase64(null);
        }
      }
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const launchLibrary = async (side: "front" | "back") => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Photo library access is needed to select card photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.4,
      base64: true,
      allowsEditing: true,
      aspect: [63, 88],
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (side === "front") {
        setFrontImage(asset.uri);
        if (asset.base64) {
          setFrontBase64(`data:image/jpeg;base64,${asset.base64}`);
        } else {
          setFrontBase64(null);
        }
      } else {
        setBackImage(asset.uri);
        if (asset.base64) {
          setBackBase64(`data:image/jpeg;base64,${asset.base64}`);
        } else {
          setBackBase64(null);
        }
      }
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const getBase64FromUri = async (uri: string): Promise<string> => {
    if (uri.startsWith("data:")) {
      return uri;
    }

    if (Platform.OS !== "web") {
      try {
        const FileSystem = require("expo-file-system");
        const base64Data = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return `data:image/jpeg;base64,${base64Data}`;
      } catch (fsError) {
        console.warn("expo-file-system read failed, falling back to fetch:", fsError);
      }
    }

    const response = await globalThis.fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleGrade = async () => {
    if (!frontImage || !backImage) {
      Alert.alert("Photos Required", "Please add photos of both the front and back of your card.");
      return;
    }

    setLoading(true);

    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      console.log("Preparing images...");
      const front = frontBase64 || await getBase64FromUri(frontImage);
      const back = backBase64 || await getBase64FromUri(backImage);
      console.log("Images ready. Front:", Math.round(front.length / 1024), "KB, Back:", Math.round(back.length / 1024), "KB");

      console.log("Sending grading request...");
      const { getApiUrl } = require("@/lib/query-client");
      const baseUrl = getApiUrl();
      const url = new URL("/api/grade-card", baseUrl);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const response = await globalThis.fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frontImage: front, backImage: back }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      console.log("Response received, status:", response.status);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(errorBody || `Server error: ${response.status}`);
      }

      const result: GradingResult = await response.json();

      if ((result as any).error) {
        throw new Error((result as any).error);
      }

      const saved = await saveGrading(frontImage, backImage, result);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      router.replace({
        pathname: "/results",
        params: { gradingId: saved.id },
      });
    } catch (error: any) {
      console.error("Grading error:", error?.message || error);
      let msg = "There was an error analyzing your card. Please try again.";
      if (error?.name === "AbortError") {
        msg = "Analysis timed out after 90 seconds. Please try again.";
      } else if (error?.message) {
        try {
          const parsed = JSON.parse(error.message);
          if (parsed.error) msg = parsed.error;
        } catch {
          if (error.message.length < 200) msg = error.message;
        }
      }
      Alert.alert("Grading Failed", msg);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setLoading(false);
    }
  };

  const canGrade = !!frontImage && !!backImage && !loading;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Grade Card</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + webBottomInset + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.instructions}>
          Add clear, well-lit photos of both sides of your Pokemon card for the most accurate grading.
        </Text>

        <View style={styles.imageRow}>
          <ImageCapture
            label="Front"
            imageUri={frontImage}
            onCapture={() => pickImage("front")}
            onRemove={() => { setFrontImage(null); setFrontBase64(null); }}
          />
          <ImageCapture
            label="Back"
            imageUri={backImage}
            onCapture={() => pickImage("back")}
            onRemove={() => { setBackImage(null); setBackBase64(null); }}
          />
        </View>

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Tips for best results</Text>
          <View style={styles.tipRow}>
            <Ionicons name="sunny" size={16} color={Colors.accent} />
            <Text style={styles.tipText}>Use good, even lighting</Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="scan" size={16} color={Colors.accent} />
            <Text style={styles.tipText}>Keep the card flat and in focus</Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="resize" size={16} color={Colors.accent} />
            <Text style={styles.tipText}>Fill the frame with the card</Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="eye-off" size={16} color={Colors.accent} />
            <Text style={styles.tipText}>Avoid glare and reflections</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: (insets.bottom || webBottomInset) + 16 }]}>
        <Pressable
          onPress={handleGrade}
          disabled={!canGrade}
          style={({ pressed }) => [
            styles.analyzeButton,
            { opacity: !canGrade ? 0.4 : pressed ? 0.9 : 1 },
          ]}
        >
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientInner}
          >
            <Ionicons name="sparkles" size={20} color="#fff" />
            <Text style={styles.analyzeText}>Analyze & Grade</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <AnalysisProgress visible={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: Colors.text,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 20,
  },
  instructions: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  imageRow: {
    flexDirection: "row",
    gap: 14,
  },
  tipsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  tipsTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tipText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  analyzeButton: {
    borderRadius: 14,
    overflow: "hidden",
  },
  gradientInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 10,
  },
  analyzeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: "#fff",
  },
});
