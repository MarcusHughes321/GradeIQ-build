import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Animated,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import ImageCapture from "@/components/ImageCapture";
import CardCamera from "@/components/CardCamera";
import { apiRequest } from "@/lib/query-client";
import { saveGrading } from "@/lib/storage";
import type { GradingResult } from "@/lib/types";

const ANALYSIS_STAGES = [
  { label: "Preparing images", icon: "image-outline" as const, duration: 2000 },
  { label: "Analyzing front side", icon: "scan-outline" as const, duration: 5000 },
  { label: "Analyzing back side", icon: "swap-horizontal-outline" as const, duration: 5000 },
  { label: "Checking centering", icon: "resize-outline" as const, duration: 4000 },
  { label: "Inspecting corners & edges", icon: "crop-outline" as const, duration: 4000 },
  { label: "Evaluating surface condition", icon: "layers-outline" as const, duration: 4000 },
  { label: "Calculating grades", icon: "calculator-outline" as const, duration: 3000 },
  { label: "Finalizing results", icon: "checkmark-circle-outline" as const, duration: 2000 },
];

export default function GradeScreen() {
  const insets = useSafeAreaInsets();
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState<"front" | "back" | null>(null);
  const [analysisStage, setAnalysisStage] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  useFocusEffect(
    useCallback(() => {
      setFrontImage(null);
      setBackImage(null);
      setLoading(false);
      setCameraOpen(null);
      setAnalysisStage(0);
      progressAnim.setValue(0);
    }, [])
  );

  useEffect(() => {
    if (!loading) {
      setAnalysisStage(0);
      progressAnim.setValue(0);
      if (stageTimerRef.current) {
        clearTimeout(stageTimerRef.current);
        stageTimerRef.current = null;
      }
      return;
    }

    let pulseAnimation: Animated.CompositeAnimation | null = null;

    const advanceStage = (stage: number) => {
      if (stage >= ANALYSIS_STAGES.length) return;
      setAnalysisStage(stage);

      const isLastStage = stage === ANALYSIS_STAGES.length - 1;

      if (isLastStage) {
        const pulse = () => {
          pulseAnimation = Animated.sequence([
            Animated.timing(progressAnim, {
              toValue: 0.98,
              duration: 1500,
              useNativeDriver: false,
            }),
            Animated.timing(progressAnim, {
              toValue: 0.88,
              duration: 1500,
              useNativeDriver: false,
            }),
          ]);
          pulseAnimation.start(({ finished }) => {
            if (finished) pulse();
          });
        };
        Animated.timing(progressAnim, {
          toValue: 0.9,
          duration: 800,
          useNativeDriver: false,
        }).start(() => pulse());
      } else {
        Animated.timing(progressAnim, {
          toValue: (stage + 1) / ANALYSIS_STAGES.length,
          duration: ANALYSIS_STAGES[stage].duration * 0.8,
          useNativeDriver: false,
        }).start();

        stageTimerRef.current = setTimeout(() => {
          advanceStage(stage + 1);
        }, ANALYSIS_STAGES[stage].duration);
      }
    };

    advanceStage(0);

    return () => {
      if (stageTimerRef.current) {
        clearTimeout(stageTimerRef.current);
      }
      if (pulseAnimation) {
        pulseAnimation.stop();
      }
    };
  }, [loading]);

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
    if (Platform.OS !== "web") {
      setCameraOpen(side);
    } else {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Camera access is needed to take photos of your card.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        base64: true,
        allowsEditing: true,
        aspect: [63, 88],
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        if (side === "front") setFrontImage(uri);
        else setBackImage(uri);
      }
    }
  };

  const handleCameraCapture = (uri: string) => {
    if (cameraOpen === "front") setFrontImage(uri);
    else if (cameraOpen === "back") setBackImage(uri);
    setCameraOpen(null);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
      quality: 0.8,
      base64: true,
      allowsEditing: true,
      aspect: [63, 88],
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const uri = asset.uri;
      if (side === "front") {
        setFrontImage(uri);
      } else {
        setBackImage(uri);
      }
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const getBase64FromUri = async (uri: string): Promise<string> => {
    if (Platform.OS === "web") {
      const response = await fetch(uri);
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
    } else {
      const response = await fetch(uri);
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
    }
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

      const frontBase64 = await getBase64FromUri(frontImage);
      const backBase64 = await getBase64FromUri(backImage);

      const response = await apiRequest("POST", "/api/grade-card", {
        frontImage: frontBase64,
        backImage: backBase64,
      });

      const result: GradingResult = await response.json();

      const saved = await saveGrading(frontImage, backImage, result);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      router.replace({
        pathname: "/results",
        params: { gradingId: saved.id },
      });
    } catch (error: any) {
      console.error("Grading error:", error);
      Alert.alert("Grading Failed", "There was an error analyzing your card. Please try again.");
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setLoading(false);
    }
  };

  const canGrade = !!frontImage && !!backImage && !loading;
  const currentStage = ANALYSIS_STAGES[analysisStage];

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => { if (!loading) router.back(); }}
          style={({ pressed }) => [styles.backBtn, { opacity: loading ? 0.3 : pressed ? 0.6 : 1 }]}
          disabled={loading}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Grade Card</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.analysisContainer}>
          <View style={styles.analysisCard}>
            <View style={styles.analysisIconWrap}>
              <View style={styles.analysisIconBg}>
                <Ionicons name={currentStage.icon as any} size={32} color={Colors.primary} />
              </View>
              <ActivityIndicator color={Colors.primary} size="small" style={styles.analysisSpinner} />
            </View>

            <Text style={styles.analysisTitle}>{currentStage.label}...</Text>
            <Text style={styles.analysisSubtitle}>
              Step {analysisStage + 1} of {ANALYSIS_STAGES.length}
            </Text>

            <View style={styles.progressBarOuter}>
              <Animated.View
                style={[
                  styles.progressBarInner,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                    }),
                  },
                ]}
              />
            </View>

            <View style={styles.stageList}>
              {ANALYSIS_STAGES.map((stage, i) => (
                <View key={i} style={styles.stageRow}>
                  <Ionicons
                    name={i < analysisStage ? "checkmark-circle" : i === analysisStage ? "ellipse" : "ellipse-outline"}
                    size={14}
                    color={i < analysisStage ? Colors.success : i === analysisStage ? Colors.primary : Colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.stageText,
                      i < analysisStage && styles.stageTextDone,
                      i === analysisStage && styles.stageTextActive,
                    ]}
                  >
                    {stage.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={styles.analysisWait}>
            This usually takes 15-30 seconds
          </Text>
        </View>
      ) : (
        <>
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
                onRemove={() => setFrontImage(null)}
              />
              <ImageCapture
                label="Back"
                imageUri={backImage}
                onCapture={() => pickImage("back")}
                onRemove={() => setBackImage(null)}
              />
            </View>

            <View style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>Tips for best results</Text>
              <View style={styles.tipRow}>
                <Ionicons name="sunny" size={16} color={Colors.accent} />
                <Text style={styles.tipText}>Use good, even lighting</Text>
              </View>
              <View style={styles.tipRow}>
                <Ionicons name="compass" size={16} color={Colors.accent} />
                <Text style={styles.tipText}>Use the spirit level when taking photos</Text>
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
        </>
      )}

      {cameraOpen && (
        <CardCamera
          side={cameraOpen}
          onCapture={handleCameraCapture}
          onClose={() => setCameraOpen(null)}
        />
      )}
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
  analysisContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  analysisCard: {
    width: "100%",
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  analysisIconWrap: {
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  analysisIconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255, 60, 49, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  analysisSpinner: {
    marginTop: 10,
  },
  analysisTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: Colors.text,
    marginBottom: 4,
  },
  analysisSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 16,
  },
  progressBarOuter: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 20,
    overflow: "hidden",
  },
  progressBarInner: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  stageList: {
    width: "100%",
    gap: 8,
  },
  stageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stageText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  stageTextDone: {
    color: Colors.success,
  },
  stageTextActive: {
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  analysisWait: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 16,
  },
});
