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
  Modal,
} from "react-native";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import ImageCapture from "@/components/ImageCapture";
import CardCamera from "@/components/CardCamera";
import { apiRequest } from "@/lib/query-client";
import { useSubscription } from "@/lib/subscription";
import { useGrading } from "@/lib/grading-context";

type GradeMode = "quick" | "deep";
type DeepStep = "front" | "back" | "angledFront" | "angledBack";

const DEEP_GRADE_INTRO_KEY = "gradeiq_deep_intro_seen";

const TAB_BAR_STYLE = {
  backgroundColor: Platform.OS === "web" ? Colors.surface : "transparent",
  borderTopColor: Colors.surfaceBorder,
  borderTopWidth: 1,
  position: "absolute" as const,
  elevation: 0,
  height: Platform.OS === "web" ? 84 : 85,
  paddingTop: 8,
};

const QUICK_STAGES = [
  { label: "Preparing images", icon: "image-outline" as const, duration: 2000 },
  { label: "Analyzing front side", icon: "scan-outline" as const, duration: 5000 },
  { label: "Analyzing back side", icon: "swap-horizontal-outline" as const, duration: 5000 },
  { label: "Checking centering", icon: "resize-outline" as const, duration: 4000 },
  { label: "Inspecting corners & edges", icon: "crop-outline" as const, duration: 4000 },
  { label: "Evaluating surface condition", icon: "layers-outline" as const, duration: 4000 },
  { label: "Calculating grades", icon: "calculator-outline" as const, duration: 3000 },
  { label: "Finalizing results", icon: "checkmark-circle-outline" as const, duration: 2000 },
];

const DEEP_STAGES = [
  { label: "Enhancing images", icon: "color-wand-outline" as const, duration: 2000 },
  { label: "Analyzing front side", icon: "scan-outline" as const, duration: 5000 },
  { label: "Analyzing back side", icon: "swap-horizontal-outline" as const, duration: 5000 },
  { label: "Analyzing angled front", icon: "eye-outline" as const, duration: 4000 },
  { label: "Analyzing angled back", icon: "eye-outline" as const, duration: 4000 },
  { label: "Cropping corners for detail", icon: "cut-outline" as const, duration: 3000 },
  { label: "Deep surface inspection", icon: "search-outline" as const, duration: 5000 },
  { label: "Checking centering", icon: "resize-outline" as const, duration: 4000 },
  { label: "Inspecting corners & edges", icon: "crop-outline" as const, duration: 4000 },
  { label: "Calculating grades", icon: "calculator-outline" as const, duration: 3000 },
  { label: "Finalizing results", icon: "checkmark-circle-outline" as const, duration: 2000 },
];

const DEEP_STEP_GUIDANCE: Record<DeepStep, { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }> = {
  front: {
    title: "Front of Card",
    subtitle: "Hold the card flat, straight-on. Fill the frame and ensure even lighting.",
    icon: "scan-outline",
  },
  back: {
    title: "Back of Card",
    subtitle: "Flip the card over. Keep it flat and centred in the frame.",
    icon: "swap-horizontal-outline",
  },
  angledFront: {
    title: "Front at an Angle",
    subtitle: "Tilt the front of the card slightly to catch the light. This reveals surface scratches and scuffs invisible in straight-on photos.",
    icon: "flashlight-outline",
  },
  angledBack: {
    title: "Back at an Angle",
    subtitle: "Tilt the back of the card slightly to catch the light. This reveals scratches on the back surface and Pokeball area.",
    icon: "flashlight-outline",
  },
};

export default function GradeScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<GradeMode>("quick");
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [angledFrontImage, setAngledFrontImage] = useState<string | null>(null);
  const [angledBackImage, setAngledBackImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cropping, setCropping] = useState<"front" | "back" | "angledFront" | "angledBack" | null>(null);
  const [cameraOpen, setCameraOpen] = useState<"front" | "back" | "angledFront" | "angledBack" | null>(null);
  const [analysisStage, setAnalysisStage] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deepStep, setDeepStep] = useState<DeepStep>("front");
  const [showDeepIntro, setShowDeepIntro] = useState(false);

  const { canGrade, recordUsage, isGateEnabled, canDeepGrade, recordDeepUsage, remainingDeepGrades, isAdminMode } = useSubscription();
  const { submitGrading, submitDeepGrading, activeJob } = useGrading();
  const navigation = useNavigation();

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const ANALYSIS_STAGES = mode === "deep" ? DEEP_STAGES : QUICK_STAGES;

  useEffect(() => {
    if (cameraOpen) {
      navigation.setOptions({ tabBarStyle: { display: "none" as const } });
      navigation.getParent()?.setOptions({ tabBarStyle: { display: "none" as const } });
    } else {
      navigation.setOptions({ tabBarStyle: TAB_BAR_STYLE });
      navigation.getParent()?.setOptions({ tabBarStyle: TAB_BAR_STYLE });
    }
  }, [cameraOpen]);

  const cropToCard = async (uri: string): Promise<string> => {
    try {
      const base64 = await getBase64FromUri(uri);
      const resp = await apiRequest("POST", "/api/crop-to-card", { image: base64 });
      const data = await resp.json();
      if (data.croppedImage) return data.croppedImage;
      return uri;
    } catch {
      return uri;
    }
  };

  const setImageWithCrop = async (side: "front" | "back" | "angledFront" | "angledBack", uri: string) => {
    if (side === "front") setFrontImage(uri);
    else if (side === "back") setBackImage(uri);
    else if (side === "angledFront") setAngledFrontImage(uri);
    else setAngledBackImage(uri);
    if (side === "front" || side === "back") {
      setCropping(side);
      try {
        const cropped = await cropToCard(uri);
        if (side === "front") setFrontImage(cropped);
        else setBackImage(cropped);
      } finally {
        setCropping(null);
      }
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!activeJob || activeJob.status !== "processing") {
        setFrontImage(null);
        setBackImage(null);
        setAngledFrontImage(null);
        setAngledBackImage(null);
        setLoading(false);
        setCropping(null);
        setCameraOpen(null);
        setAnalysisStage(0);
        progressAnim.setValue(0);
        setDeepStep("front");
      }
    }, [activeJob?.status])
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

    const stages = ANALYSIS_STAGES;
    const advanceStage = (stage: number) => {
      if (stage >= stages.length) return;
      setAnalysisStage(stage);

      const isLastStage = stage === stages.length - 1;

      if (isLastStage) {
        Animated.timing(progressAnim, {
          toValue: 0.95,
          duration: 2000,
          useNativeDriver: false,
        }).start();
      } else {
        Animated.timing(progressAnim, {
          toValue: (stage + 1) / stages.length,
          duration: stages[stage].duration * 0.8,
          useNativeDriver: false,
        }).start();

        stageTimerRef.current = setTimeout(() => {
          advanceStage(stage + 1);
        }, stages[stage].duration);
      }
    };

    advanceStage(0);

    return () => {
      if (stageTimerRef.current) {
        clearTimeout(stageTimerRef.current);
      }
    };
  }, [loading]);

  const pickImage = async (side: "front" | "back" | "angledFront" | "angledBack") => {
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

  const launchCamera = async (side: "front" | "back" | "angledFront" | "angledBack") => {
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
        setImageWithCrop(side, result.assets[0].uri);
      }
    }
  };

  const handleCameraCapture = (uri: string) => {
    const side = cameraOpen;
    setCameraOpen(null);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (side) {
      if (side === "front") setFrontImage(uri);
      else if (side === "back") setBackImage(uri);
      else if (side === "angledFront") setAngledFrontImage(uri);
      else setAngledBackImage(uri);
    }
  };

  const launchLibrary = async (side: "front" | "back" | "angledFront" | "angledBack") => {
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
      setImageWithCrop(side, result.assets[0].uri);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const getBase64FromUri = async (uri: string): Promise<string> => {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  useEffect(() => {
    if (activeJob?.status === "completed" && activeJob.savedGrading && loading) {
      setLoading(false);
      router.replace({
        pathname: "/results",
        params: { gradingId: activeJob.savedGrading.id },
      });
    } else if (activeJob?.status === "failed" && loading) {
      setLoading(false);
      Alert.alert("Grading Failed", "There was an error analyzing your card. Please try again.");
    }
  }, [activeJob?.status]);

  const handleSelectDeepMode = async () => {
    if (isGateEnabled && !canDeepGrade && !isAdminMode) {
      router.push("/paywall");
      return;
    }

    const seen = await AsyncStorage.getItem(DEEP_GRADE_INTRO_KEY);
    if (!seen) {
      setShowDeepIntro(true);
    } else {
      setMode("deep");
    }
  };

  const handleDismissDeepIntro = async () => {
    await AsyncStorage.setItem(DEEP_GRADE_INTRO_KEY, "seen");
    setShowDeepIntro(false);
    setMode("deep");
  };

  const handleGrade = async () => {
    if (mode === "quick") {
      if (!frontImage || !backImage) {
        Alert.alert("Photos Required", "Please add photos of both the front and back of your card.");
        return;
      }
    } else {
      if (!frontImage || !backImage || !angledFrontImage || !angledBackImage) {
        Alert.alert("Photos Required", "Please add all four photos: front, back, angled front, and angled back.");
        return;
      }
    }

    if (activeJob?.status === "processing") {
      Alert.alert("Grading in Progress", "Please wait for the current grading to finish before starting another.");
      return;
    }

    if (mode === "quick" && isGateEnabled && !canGrade) {
      router.push("/paywall");
      return;
    }

    if (mode === "deep" && isGateEnabled && !canDeepGrade && !isAdminMode) {
      router.push("/paywall");
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setLoading(true);

    if (mode === "deep" && angledFrontImage && angledBackImage) {
      submitDeepGrading(frontImage!, backImage!, angledFrontImage, angledBackImage, async (n: number) => {
        await recordDeepUsage();
      });
    } else {
      submitGrading(frontImage!, backImage!, recordUsage);
    }
  };

  const canSubmit = mode === "quick"
    ? !!frontImage && !!backImage && !loading
    : !!frontImage && !!backImage && !!angledFrontImage && !!angledBackImage && !loading;

  const currentStage = ANALYSIS_STAGES[analysisStage];

  const renderModeSelector = () => (
    <View style={styles.modeSelector}>
      <Pressable
        style={[styles.modeTab, mode === "quick" && styles.modeTabActive]}
        onPress={() => {
          setMode("quick");
          setAngledFrontImage(null);
          setAngledBackImage(null);
          setDeepStep("front");
        }}
      >
        <Ionicons name="flash-outline" size={16} color={mode === "quick" ? Colors.text : Colors.textMuted} />
        <Text style={[styles.modeTabText, mode === "quick" && styles.modeTabTextActive]}>Quick Grade</Text>
      </Pressable>
      <Pressable
        style={[styles.modeTab, mode === "deep" && styles.modeTabActive]}
        onPress={handleSelectDeepMode}
      >
        <Ionicons name="search-outline" size={16} color={mode === "deep" ? "#F59E0B" : Colors.textMuted} />
        <Text style={[styles.modeTabText, mode === "deep" && styles.modeTabTextDeep]}>Deep Grade</Text>
        {(isGateEnabled && !canDeepGrade && !isAdminMode) && (
          <Ionicons name="lock-closed" size={12} color="#F59E0B" style={{ marginLeft: 2 }} />
        )}
      </Pressable>
    </View>
  );

  const DEEP_STEPS: DeepStep[] = ["front", "angledFront", "back", "angledBack"];
  const DEEP_STEP_LABELS = ["Front", "Angled\nFront", "Back", "Angled\nBack"];

  const getDeepStepImage = (step: DeepStep) => {
    if (step === "front") return frontImage;
    if (step === "back") return backImage;
    if (step === "angledFront") return angledFrontImage;
    return angledBackImage;
  };

  const getNextStep = (step: DeepStep): DeepStep | null => {
    const idx = DEEP_STEPS.indexOf(step);
    return idx < DEEP_STEPS.length - 1 ? DEEP_STEPS[idx + 1] : null;
  };

  const renderDeepGradeSteps = () => (
    <View style={styles.deepStepsContainer}>
      <View style={styles.deepStepIndicator}>
        {DEEP_STEPS.map((step, i) => {
          const isComplete = !!getDeepStepImage(step);
          const isCurrent = deepStep === step;
          return (
            <React.Fragment key={step}>
              {i > 0 && <View style={[styles.deepStepLine, isComplete && styles.deepStepLineComplete]} />}
              <Pressable
                style={[
                  styles.deepStepDot,
                  isComplete && styles.deepStepDotComplete,
                  isCurrent && !isComplete && styles.deepStepDotCurrent,
                ]}
                onPress={() => setDeepStep(step)}
              >
                {isComplete ? (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                ) : (
                  <Text style={[styles.deepStepNumber, isCurrent && styles.deepStepNumberCurrent]}>{i + 1}</Text>
                )}
              </Pressable>
            </React.Fragment>
          );
        })}
      </View>

      <View style={styles.deepStepLabels}>
        {DEEP_STEPS.map((step, i) => (
          <Text key={step} style={[styles.deepStepLabel, deepStep === step && styles.deepStepLabelActive]}>
            {DEEP_STEP_LABELS[i]}
          </Text>
        ))}
      </View>

      <View style={styles.deepGuidance}>
        <Ionicons name={DEEP_STEP_GUIDANCE[deepStep].icon} size={20} color="#F59E0B" />
        <View style={{ flex: 1 }}>
          <Text style={styles.deepGuidanceTitle}>{DEEP_STEP_GUIDANCE[deepStep].title}</Text>
          <Text style={styles.deepGuidanceSubtitle}>{DEEP_STEP_GUIDANCE[deepStep].subtitle}</Text>
        </View>
      </View>

      <View style={styles.deepCaptureArea}>
        {deepStep === "front" && (
          <ImageCapture
            label="Front"
            imageUri={frontImage}
            onCapture={() => pickImage("front")}
            onRemove={() => setFrontImage(null)}
            loading={cropping === "front"}
          />
        )}
        {deepStep === "angledFront" && (
          <ImageCapture
            label="Angled Front"
            imageUri={angledFrontImage}
            onCapture={() => pickImage("angledFront")}
            onRemove={() => setAngledFrontImage(null)}
            loading={cropping === "angledFront"}
          />
        )}
        {deepStep === "back" && (
          <ImageCapture
            label="Back"
            imageUri={backImage}
            onCapture={() => pickImage("back")}
            onRemove={() => setBackImage(null)}
            loading={cropping === "back"}
          />
        )}
        {deepStep === "angledBack" && (
          <ImageCapture
            label="Angled Back"
            imageUri={angledBackImage}
            onCapture={() => pickImage("angledBack")}
            onRemove={() => setAngledBackImage(null)}
            loading={cropping === "angledBack"}
          />
        )}
      </View>

      {getNextStep(deepStep) && (
        <Pressable
          style={({ pressed }) => [styles.deepNextBtn, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => {
            const next = getNextStep(deepStep);
            if (next) setDeepStep(next);
          }}
        >
          <Text style={styles.deepNextBtnText}>
            {!getDeepStepImage(deepStep)
              ? `Skip to ${DEEP_STEP_GUIDANCE[getNextStep(deepStep)!].title}`
              : `Next: ${DEEP_STEP_GUIDANCE[getNextStep(deepStep)!].title}`}
          </Text>
          <Ionicons name="arrow-forward" size={16} color={Colors.text} />
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Grade Card</Text>
        {mode === "deep" && remainingDeepGrades !== null && !isAdminMode && (
          <View style={styles.deepBadge}>
            <Text style={styles.deepBadgeText}>{remainingDeepGrades} deep left</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.analysisContainer}>
          <View style={styles.analysisCard}>
            {mode === "deep" && (
              <View style={styles.deepAnalysisBadge}>
                <Ionicons name="search" size={12} color="#F59E0B" />
                <Text style={styles.deepAnalysisBadgeText}>Deep Grade</Text>
              </View>
            )}
            <View style={styles.analysisIconWrap}>
              <View style={[styles.analysisIconBg, mode === "deep" && { backgroundColor: "rgba(245, 158, 11, 0.12)" }]}>
                <Ionicons name={currentStage.icon as any} size={32} color={mode === "deep" ? "#F59E0B" : Colors.primary} />
              </View>
              <ActivityIndicator color={mode === "deep" ? "#F59E0B" : Colors.primary} size="small" style={styles.analysisSpinner} />
            </View>

            <Text style={styles.analysisTitle}>{currentStage.label}...</Text>
            <Text style={styles.analysisSubtitle}>
              Step {analysisStage + 1} of {ANALYSIS_STAGES.length}
            </Text>

            <View style={styles.progressBarOuter}>
              <Animated.View
                style={[
                  styles.progressBarInner,
                  mode === "deep" && { backgroundColor: "#F59E0B" },
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
                    color={i < analysisStage ? Colors.success : i === analysisStage ? (mode === "deep" ? "#F59E0B" : Colors.primary) : Colors.textMuted}
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
            {mode === "deep" ? "Deep analysis takes 30-60 seconds" : "This usually takes 15-30 seconds"}
          </Text>

          <Pressable
            style={({ pressed }) => [styles.continueButton, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => {
              setLoading(false);
              setFrontImage(null);
              setBackImage(null);
              setAngledFrontImage(null);
              setAngledBackImage(null);
              router.navigate("/(tabs)");
            }}
          >
            <Ionicons name="arrow-back" size={16} color={Colors.text} />
            <Text style={styles.continueButtonText}>Continue browsing</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + webBottomInset + 100 }]}
            showsVerticalScrollIndicator={false}
          >
            {renderModeSelector()}

            {mode === "quick" ? (
              <>
                <Text style={styles.instructions}>
                  Add clear, well-lit photos of both sides of your card. Place the card on a plain, solid-coloured surface for the best centering accuracy. Avoid holding the card or using busy backgrounds.
                </Text>

                <View style={styles.imageRow}>
                  <ImageCapture
                    label="Front"
                    imageUri={frontImage}
                    onCapture={() => pickImage("front")}
                    onRemove={() => setFrontImage(null)}
                    loading={cropping === "front"}
                  />
                  <ImageCapture
                    label="Back"
                    imageUri={backImage}
                    onCapture={() => pickImage("back")}
                    onRemove={() => setBackImage(null)}
                    loading={cropping === "back"}
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
              </>
            ) : (
              renderDeepGradeSteps()
            )}
          </ScrollView>

          <View style={[styles.bottomBar, { paddingBottom: (insets.bottom || webBottomInset) + 90 }]}>
            <Pressable
              onPress={handleGrade}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.analyzeButton,
                { opacity: !canSubmit ? 0.4 : pressed ? 0.9 : 1 },
              ]}
            >
              <LinearGradient
                colors={mode === "deep" ? ["#F59E0B", "#D97706"] : [Colors.gradientStart, Colors.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientInner}
              >
                <Ionicons name={mode === "deep" ? "search" : "sparkles"} size={20} color="#fff" />
                <Text style={styles.analyzeText}>{mode === "deep" ? "Deep Analyze" : "Analyze & Grade"}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </>
      )}

      {cameraOpen && (
        <CardCamera
          side={cameraOpen === "angledFront" ? "front" : cameraOpen === "angledBack" ? "back" : cameraOpen}
          onCapture={handleCameraCapture}
          onClose={() => setCameraOpen(null)}
        />
      )}

      <Modal
        visible={showDeepIntro}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeepIntro(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <LinearGradient colors={["#F59E0B", "#D97706"]} style={styles.modalIconBg}>
                <Ionicons name="search" size={28} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.modalTitle}>Deep Grade</Text>
            <Text style={styles.modalSubtitle}>
              Get the most accurate grade possible by capturing your card from multiple angles.
            </Text>

            <View style={styles.modalSteps}>
              <View style={styles.modalStepRow}>
                <View style={styles.modalStepNum}><Text style={styles.modalStepNumText}>1</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalStepTitle}>Front photo</Text>
                  <Text style={styles.modalStepDesc}>Straight-on, well-lit shot of the front</Text>
                </View>
              </View>
              <View style={styles.modalStepRow}>
                <View style={styles.modalStepNum}><Text style={styles.modalStepNumText}>2</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalStepTitle}>Front at an angle</Text>
                  <Text style={styles.modalStepDesc}>Tilt the front to reveal surface scratches</Text>
                </View>
              </View>
              <View style={styles.modalStepRow}>
                <View style={styles.modalStepNum}><Text style={styles.modalStepNumText}>3</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalStepTitle}>Back photo</Text>
                  <Text style={styles.modalStepDesc}>Flip the card for a straight-on back shot</Text>
                </View>
              </View>
              <View style={styles.modalStepRow}>
                <View style={styles.modalStepNum}><Text style={styles.modalStepNumText}>4</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalStepTitle}>Back at an angle</Text>
                  <Text style={styles.modalStepDesc}>Tilt the back to reveal scratches on the back surface</Text>
                </View>
              </View>
            </View>

            <Text style={styles.modalNote}>
              The AI will also auto-crop and zoom into each corner for detailed inspection.
            </Text>

            <Pressable
              style={({ pressed }) => [styles.modalBtn, { opacity: pressed ? 0.8 : 1 }]}
              onPress={handleDismissDeepIntro}
            >
              <LinearGradient colors={["#F59E0B", "#D97706"]} style={styles.modalBtnGradient}>
                <Text style={styles.modalBtnText}>Got it</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  headerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: Colors.text,
  },
  deepBadge: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  deepBadgeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#F59E0B",
  },
  modeSelector: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  modeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  modeTabActive: {
    backgroundColor: Colors.surfaceLight,
  },
  modeTabText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textMuted,
  },
  modeTabTextActive: {
    color: Colors.text,
  },
  modeTabTextDeep: {
    color: "#F59E0B",
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
  deepAnalysisBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  deepAnalysisBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#F59E0B",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
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
  continueButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  continueButtonText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  deepStepsContainer: {
    gap: 16,
  },
  deepStepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  deepStepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.surfaceBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  deepStepDotComplete: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  deepStepDotCurrent: {
    borderColor: "#F59E0B",
  },
  deepStepLine: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.surfaceBorder,
    marginHorizontal: 4,
  },
  deepStepLineComplete: {
    backgroundColor: Colors.success,
  },
  deepStepNumber: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textMuted,
  },
  deepStepNumberCurrent: {
    color: "#F59E0B",
  },
  deepStepLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 30,
  },
  deepStepLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    flex: 1,
    textAlign: "center" as const,
  },
  deepStepLabelActive: {
    fontFamily: "Inter_600SemiBold",
    color: "#F59E0B",
  },
  deepGuidance: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
  },
  deepGuidanceTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 2,
  },
  deepGuidanceSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  deepCaptureArea: {
    alignItems: "center",
  },
  deepNextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignSelf: "center" as const,
  },
  deepNextBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  modalIconWrap: {
    marginBottom: 16,
  },
  modalIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center" as const,
    lineHeight: 20,
    marginBottom: 20,
  },
  modalSteps: {
    width: "100%",
    gap: 12,
    marginBottom: 16,
  },
  modalStepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  modalStepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalStepNumText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#F59E0B",
  },
  modalStepTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  modalStepDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  modalNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center" as const,
    lineHeight: 16,
    marginBottom: 20,
  },
  modalBtn: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
  },
  modalBtnGradient: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
});
