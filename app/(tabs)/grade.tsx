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
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import ImageCapture from "@/components/ImageCapture";
import ImageAdjustModal from "@/components/ImageAdjustModal";
import CardCamera from "@/components/CardCamera";
import { apiRequest } from "@/lib/query-client";
import { useSubscription } from "@/lib/subscription";
import { useGrading } from "@/lib/grading-context";
import type { CertData } from "@/lib/grading-context";

type GradeMode = "hub" | "quick" | "deep" | "crossover";
type DeepStep = "front" | "back" | "angledFront" | "angledBack" | "cornerFrontTL" | "cornerFrontTR" | "cornerFrontBL" | "cornerFrontBR" | "cornerBackTL" | "cornerBackTR" | "cornerBackBL" | "cornerBackBR" | "slabFront" | "slabBack";

const CERT_COMPANIES = ["ACE", "TAG"] as const;
type CertCompany = typeof CERT_COMPANIES[number];
type CertLookupResult = {
  cardName: string;
  setName: string;
  grade: string;
  company: string;
  certNumber: string;
  frontImageBase64: string;
  backImageBase64?: string;
  labelImageBase64?: string;
};
const DEEP_GRADE_INTRO_KEY = "gradeiq_deep_intro_seen";

const CROSSOVER_STAGES = [
  { label: "Preparing slab image", icon: "image-outline" as const, duration: 3000 },
  { label: "Identifying card", icon: "scan-outline" as const, duration: 7000 },
  { label: "Assessing centering", icon: "resize-outline" as const, duration: 5000 },
  { label: "Inspecting corners & edges", icon: "crop-outline" as const, duration: 5000 },
  { label: "Evaluating surface", icon: "layers-outline" as const, duration: 5000 },
  { label: "Crossover analysis", icon: "git-compare-outline" as const, duration: 5000 },
  { label: "Calculating crossover grades", icon: "calculator-outline" as const, duration: 5000 },
  { label: "Finalizing results", icon: "checkmark-circle-outline" as const, duration: 3000 },
];

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
  { label: "Analyzing front side", icon: "scan-outline" as const, duration: 4000 },
  { label: "Analyzing back side", icon: "swap-horizontal-outline" as const, duration: 4000 },
  { label: "Analyzing angled shots", icon: "eye-outline" as const, duration: 4000 },
  { label: "Inspecting front corners", icon: "crop-outline" as const, duration: 5000 },
  { label: "Inspecting back corners", icon: "crop-outline" as const, duration: 5000 },
  { label: "Deep surface inspection", icon: "search-outline" as const, duration: 5000 },
  { label: "Checking centering", icon: "resize-outline" as const, duration: 4000 },
  { label: "Cross-referencing flaws", icon: "git-compare-outline" as const, duration: 4000 },
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
    subtitle: "Keep the card flat on the table. Tilt the bottom of your phone down \u2014 the spirit level will guide you to the right angle to catch surface scratches.",
    icon: "flashlight-outline",
  },
  angledBack: {
    title: "Back at an Angle",
    subtitle: "Keep the card flat on the table. Tilt the bottom of your phone down \u2014 the spirit level will guide you to reveal scratches on the back surface.",
    icon: "flashlight-outline",
  },
  cornerFrontTL: {
    title: "Front Top-Left Corner",
    subtitle: "Get close to the top-left corner of the FRONT. Fill the frame with just the corner area.",
    icon: "crop-outline",
  },
  cornerFrontTR: {
    title: "Front Top-Right Corner",
    subtitle: "Get close to the top-right corner of the FRONT. Fill the frame with just the corner area.",
    icon: "crop-outline",
  },
  cornerFrontBL: {
    title: "Front Bottom-Left Corner",
    subtitle: "Get close to the bottom-left corner of the FRONT. Fill the frame with just the corner area.",
    icon: "crop-outline",
  },
  cornerFrontBR: {
    title: "Front Bottom-Right Corner",
    subtitle: "Get close to the bottom-right corner of the FRONT. Fill the frame with just the corner area.",
    icon: "crop-outline",
  },
  cornerBackTL: {
    title: "Back Top-Left Corner",
    subtitle: "Get close to the top-left corner of the BACK. Fill the frame with just the corner area.",
    icon: "crop-outline",
  },
  cornerBackTR: {
    title: "Back Top-Right Corner",
    subtitle: "Get close to the top-right corner of the BACK. Fill the frame with just the corner area.",
    icon: "crop-outline",
  },
  cornerBackBL: {
    title: "Back Bottom-Left Corner",
    subtitle: "Get close to the bottom-left corner of the BACK. Fill the frame with just the corner area.",
    icon: "crop-outline",
  },
  cornerBackBR: {
    title: "Back Bottom-Right Corner",
    subtitle: "Get close to the bottom-right corner of the BACK. Fill the frame with just the corner area.",
    icon: "crop-outline",
  },
  slabFront: {
    title: "Front of Slab",
    subtitle: "Align the whole slab to the guide frame. Ensure the card is visible through the case.",
    icon: "scan-outline",
  },
  slabBack: {
    title: "Back of Slab",
    subtitle: "Flip the slab over. Keep it flat and centred in the frame.",
    icon: "swap-horizontal-outline",
  },
};

export default function GradeScreen() {
  const insets = useSafeAreaInsets();
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<GradeMode>(() => {
    if (modeParam === "deep" || modeParam === "quick") return modeParam;
    return "hub";
  });
  useEffect(() => {
    if (modeParam === "deep" || modeParam === "quick") setMode(modeParam);
  }, [modeParam]);

  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [angledFrontImage, setAngledFrontImage] = useState<string | null>(null);
  const [angledBackImage, setAngledBackImage] = useState<string | null>(null);
  const [cornerImages, setCornerImages] = useState<Record<string, string | null>>({
    cornerFrontTL: null, cornerFrontTR: null, cornerFrontBL: null, cornerFrontBR: null,
    cornerBackTL: null, cornerBackTR: null, cornerBackBL: null, cornerBackBR: null,
  });
  const [loading, setLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState<DeepStep | null>(null);
  const [deepCameraActive, setDeepCameraActive] = useState(false);
  const [analysisStage, setAnalysisStage] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deepStep, setDeepStep] = useState<DeepStep>("front");
  const [showDeepIntro, setShowDeepIntro] = useState(false);
  const [adjustImage, setAdjustImage] = useState<{ uri: string; side: DeepStep } | null>(null);

  const [slabImage, setSlabImage] = useState<string | null>(null);
  const [slabBackImage, setSlabBackImage] = useState<string | null>(null);

  const [certNumber, setCertNumber] = useState("");
  const [selectedCertCompany, setSelectedCertCompany] = useState<CertCompany>("ACE");
  const [certLookupResult, setCertLookupResult] = useState<CertLookupResult | null>(null);
  const [certLookupLoading, setCertLookupLoading] = useState(false);
  const [certLookupError, setCertLookupError] = useState<string | null>(null);
  const [showManualUpload, setShowManualUpload] = useState(false);

  const { canGrade, recordUsage, isGateEnabled, canDeepGrade, recordDeepUsage, remainingDeepGrades, isAdminMode, isSubscribed, canCrossover, canBulk, remainingCrossoverGrades, crossoverMonthlyLimit, recordCrossoverUsage } = useSubscription();
  const { submitGrading, submitDeepGrading, submitCrossoverGrading, activeJob } = useGrading();
  const navigation = useNavigation();

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const ANALYSIS_STAGES = mode === "deep" ? DEEP_STAGES : mode === "crossover" ? CROSSOVER_STAGES : QUICK_STAGES;

  useEffect(() => {
    if (cameraOpen) {
      navigation.setOptions({ tabBarStyle: { display: "none" as const } });
      navigation.getParent()?.setOptions({ tabBarStyle: { display: "none" as const } });
    } else {
      navigation.setOptions({ tabBarStyle: TAB_BAR_STYLE });
      navigation.getParent()?.setOptions({ tabBarStyle: TAB_BAR_STYLE });
    }
  }, [cameraOpen]);

  const isCornerStep = (step: string): boolean => step.startsWith("corner");

  const setImageForStep = (step: DeepStep, uri: string) => {
    if (step === "front") setFrontImage(uri);
    else if (step === "back") setBackImage(uri);
    else if (step === "angledFront") setAngledFrontImage(uri);
    else if (step === "angledBack") setAngledBackImage(uri);
    else if (step === "slabFront") setSlabImage(uri);
    else if (step === "slabBack") setSlabBackImage(uri);
    else if (isCornerStep(step)) setCornerImages(prev => ({ ...prev, [step]: uri }));
  };

  useFocusEffect(
    useCallback(() => {
      if (activeJob?.status === "processing") {
        setLoading(true);
        if (activeJob.isCrossover) setMode("crossover");
        else if (activeJob.isDeepGrade) setMode("deep");
        else setMode("quick");
      } else {
        setFrontImage(null);
        setBackImage(null);
        setAngledFrontImage(null);
        setAngledBackImage(null);
        setCornerImages({
          cornerFrontTL: null, cornerFrontTR: null, cornerFrontBL: null, cornerFrontBR: null,
          cornerBackTL: null, cornerBackTR: null, cornerBackBL: null, cornerBackBR: null,
        });
        setSlabImage(null);
        setSlabBackImage(null);
        setCertNumber("");
        setCertLookupResult(null);
        setCertLookupError(null);
        setCertLookupLoading(false);
        setShowManualUpload(false);
        setLoading(false);
        setCameraOpen(null);
        setDeepCameraActive(false);
        setAnalysisStage(0);
        progressAnim.setValue(0);
        setDeepStep("front");
        if (!modeParam) setMode("hub");
      }
    }, [activeJob?.status, activeJob?.isCrossover, activeJob?.isDeepGrade, modeParam])
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

  const pickImage = async (side: DeepStep) => {
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

  const launchCamera = async (side: DeepStep) => {
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
        setImageForStep(side, result.assets[0].uri);
      }
    }
  };

  const handleCameraCapture = (uri: string) => {
    const side = cameraOpen;
    if (!side) return;

    setImageForStep(side, uri);

    if (side === "front" || side === "back") {
      straightenInBackground(side, uri);
    }

    if (deepCameraActive && mode === "deep") {
      const nextStep = getNextDeepStep(side);
      if (nextStep) {
        setDeepStep(nextStep);
        setCameraOpen(nextStep);
      } else {
        setCameraOpen(null);
        setDeepCameraActive(false);
      }
    } else {
      setCameraOpen(null);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const straightenInBackground = async (side: DeepStep, uri: string) => {
    try {
      const base64 = await getBase64FromUri(uri);
      const resp = await apiRequest("POST", "/api/crop-to-card", { image: base64 });
      const data = await resp.json();
      if (data.croppedImage) {
        setImageForStep(side, data.croppedImage);
      }
    } catch (e) {
      console.log("Background straighten failed, keeping original:", e);
    }
  };

  const getNextDeepStep = (step: DeepStep): DeepStep | null => {
    const DEEP_STEP_ORDER: DeepStep[] = [
      "front", "angledFront",
      "cornerFrontTL", "cornerFrontTR", "cornerFrontBL", "cornerFrontBR",
      "back", "angledBack",
      "cornerBackTL", "cornerBackTR", "cornerBackBL", "cornerBackBR",
    ];
    const idx = DEEP_STEP_ORDER.indexOf(step);
    return idx < DEEP_STEP_ORDER.length - 1 ? DEEP_STEP_ORDER[idx + 1] : null;
  };

  const launchDeepCamera = () => {
    setDeepCameraActive(true);
    setCameraOpen(deepStep);
  };

  const launchLibrary = async (side: DeepStep) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Photo library access is needed to select card photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]) {
      setAdjustImage({ uri: result.assets[0].uri, side });
    }
  };

  const handleAdjustConfirm = useCallback((uri: string) => {
    if (!adjustImage) return;
    setAdjustImage(null);
    setImageForStep(adjustImage.side, uri);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [adjustImage]);

  const handleAdjustCancel = useCallback(() => {
    setAdjustImage(null);
  }, []);

  const getBase64FromUri = async (uri: string): Promise<string> => {
    if (uri.startsWith("data:")) return uri;
    if (Platform.OS !== "web") {
      try {
        const dim = __DEV__ ? 1024 : 2048;
        const transforms: ImageManipulator.Action[] = Platform.OS === "android"
          ? [{ rotate: 0 }, { resize: { width: dim } }]
          : [{ resize: { width: dim } }];
        const result = await ImageManipulator.manipulateAsync(
          uri,
          transforms,
          { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        if (result.base64) return `data:image/jpeg;base64,${result.base64}`;
      } catch (e) {
        console.log("[grade getBase64] ImageManipulator failed, falling back to fetch:", e);
      }
    }
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
    if (activeJob?.status === "completed" && activeJob.savedGrading) {
      setLoading(false);
      router.replace({
        pathname: "/results",
        params: { gradingId: activeJob.savedGrading.id },
      });
    } else if (activeJob?.status === "failed") {
      setLoading(false);
      Alert.alert("Grading Failed", activeJob.error || "There was an error analyzing your card. Please try again.");
    }
  }, [activeJob?.status, activeJob?.savedGrading?.id]);

  const handleSelectDeepMode = async () => {
    if (isGateEnabled && !canDeepGrade && !isAdminMode) {
      router.push("/deep-grade-info");
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

  const handleCertLookup = async () => {
    if (!certNumber.trim()) {
      Alert.alert("Enter Cert Number", "Please enter a cert number to look up.");
      return;
    }
    setCertLookupLoading(true);
    setCertLookupError(null);
    setCertLookupResult(null);
    try {
      const resp = await apiRequest("POST", "/api/cert-lookup", { certNumber: certNumber.trim(), company: selectedCertCompany });
      const data = await resp.json() as CertLookupResult;
      setCertLookupResult(data);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e: any) {
      let msg: string = e.message || "Cert lookup failed — please add photos manually";
      const jsonMatch = msg.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.error) msg = parsed.error;
        } catch { /* keep original */ }
      }
      setCertLookupError(msg);
    } finally {
      setCertLookupLoading(false);
    }
  };

  const handleGrade = async () => {
    if (mode === "crossover") {
      if (!slabImage) {
        Alert.alert("Photo Required", "Please add a photo of the front of the graded slab.");
        return;
      }
    } else if (mode === "quick") {
      if (!frontImage || !backImage) {
        Alert.alert("Photos Required", "Please add photos of both the front and back of your card.");
        return;
      }
    } else {
      const allCornersReady = Object.values(cornerImages).every(v => v !== null);
      if (!frontImage || !backImage || !angledFrontImage || !angledBackImage || !allCornersReady) {
        Alert.alert("Photos Required", "Please add all 12 photos for Deep Grade: front, back, angles, and all 8 corner close-ups.");
        return;
      }
    }

    if (activeJob?.status === "processing") {
      Alert.alert("Grading in Progress", "Please wait for the current grading to finish before starting another.");
      return;
    }

    if (mode === "crossover" && isGateEnabled && !canCrossover && !isAdminMode) {
      router.push("/crossover-info");
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

    const wrappedRecordUsage = async (n: number) => { await recordUsage(n); };
    const wrappedCrossoverUsage = async (_n: number) => { await recordCrossoverUsage(); };
    if (mode === "crossover") {
      submitCrossoverGrading(slabImage!, slabBackImage || undefined, wrappedCrossoverUsage, undefined);
    } else if (mode === "deep" && angledFrontImage && angledBackImage) {
      const frontCorners = [cornerImages.cornerFrontTL!, cornerImages.cornerFrontTR!, cornerImages.cornerFrontBL!, cornerImages.cornerFrontBR!];
      const backCorners = [cornerImages.cornerBackTL!, cornerImages.cornerBackTR!, cornerImages.cornerBackBL!, cornerImages.cornerBackBR!];
      submitDeepGrading(frontImage!, backImage!, angledFrontImage, angledBackImage, frontCorners, backCorners, async (n: number) => {
        await recordDeepUsage();
      });
    } else {
      submitGrading(frontImage!, backImage!, wrappedRecordUsage);
    }
  };

  const allCornersReady = Object.values(cornerImages).every(v => v !== null);
  const canSubmit = mode === "crossover"
    ? !!slabImage && !loading
    : mode === "quick"
    ? !!frontImage && !!backImage && !loading
    : !!frontImage && !!backImage && !!angledFrontImage && !!angledBackImage && allCornersReady && !loading;

  const currentStage = ANALYSIS_STAGES[analysisStage];

  const renderHub = () => (
    <ScrollView
      contentContainerStyle={[styles.hubContent, { paddingBottom: insets.bottom + webBottomInset + 120 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.hubSectionLabel}>Raw Cards</Text>

      <Pressable
        style={({ pressed }) => [styles.hubCard, { transform: [{ scale: pressed ? 0.985 : 1 }] }]}
        onPress={() => setMode("quick")}
      >
        <View style={[styles.hubIconWrap, styles.hubIconRed]}>
          <Ionicons name="camera-outline" size={22} color={Colors.primary} />
        </View>
        <View style={styles.hubCardText}>
          <Text style={styles.hubCardTitle}>Quick Grade</Text>
          <Text style={styles.hubCardSub}>2 photos · front & back</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.hubCard, { transform: [{ scale: pressed ? 0.985 : 1 }] }]}
        onPress={handleSelectDeepMode}
      >
        <View style={[styles.hubIconWrap, styles.hubIconAmber]}>
          <Ionicons name="search-outline" size={22} color="#F59E0B" />
        </View>
        <View style={styles.hubCardText}>
          <Text style={styles.hubCardTitle}>Deep Grade</Text>
          <Text style={styles.hubCardSub}>12 photos · premium accuracy</Text>
        </View>
        {isGateEnabled && !canDeepGrade && !isAdminMode ? (
          <View style={styles.hubLockPill}>
            <Ionicons name="lock-closed" size={11} color="#F59E0B" />
            <Text style={styles.hubLockPillText}>Pro</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        )}
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.hubCard, { transform: [{ scale: pressed ? 0.985 : 1 }] }]}
        onPress={() => {
          if (isGateEnabled && !canBulk && !isAdminMode) {
            router.push("/bulk-info");
            return;
          }
          router.push("/bulk");
        }}
      >
        <View style={[styles.hubIconWrap, styles.hubIconGreen]}>
          <Ionicons name="layers-outline" size={22} color="#10B981" />
        </View>
        <View style={styles.hubCardText}>
          <Text style={styles.hubCardTitle}>Bulk Grade</Text>
          <Text style={styles.hubCardSub}>Up to 20 cards at once</Text>
        </View>
        {isGateEnabled && !canBulk && !isAdminMode ? (
          <View style={styles.hubLockPill}>
            <Ionicons name="lock-closed" size={11} color="#F59E0B" />
            <Text style={styles.hubLockPillText}>Pro</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        )}
      </Pressable>

      <Text style={[styles.hubSectionLabel, { marginTop: 28 }]}>Collection Tools</Text>

      <Pressable
        style={({ pressed }) => [styles.hubCard, { transform: [{ scale: pressed ? 0.985 : 1 }] }]}
        onPress={() => router.push("/collection-scan")}
      >
        <View style={[styles.hubIconWrap, styles.hubIconBlue]}>
          <Ionicons name="library-outline" size={22} color="#3B82F6" />
        </View>
        <View style={styles.hubCardText}>
          <Text style={styles.hubCardTitle}>Collection Scan</Text>
          <Text style={styles.hubCardSub}>Condition check · CSV export · free</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.hubCard, { transform: [{ scale: pressed ? 0.985 : 1 }] }]}
        onPress={() => router.push("/deal-advisor")}
      >
        <View style={[styles.hubIconWrap, { backgroundColor: "#F59E0B20" }]}>
          <Ionicons name="chatbubbles-outline" size={22} color="#F59E0B" />
        </View>
        <View style={styles.hubCardText}>
          <Text style={styles.hubCardTitle}>Card Advisor</Text>
          <Text style={styles.hubCardSub}>Deals · values · market trends</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </Pressable>

      <Text style={[styles.hubSectionLabel, { marginTop: 28 }]}>Graded Slabs</Text>

      <Pressable
        style={({ pressed }) => [styles.hubCard, { transform: [{ scale: pressed ? 0.985 : 1 }] }]}
        onPress={() => {
          if (isGateEnabled && !canCrossover && !isAdminMode) {
            router.push("/crossover-info");
          } else {
            setMode("crossover");
          }
        }}
      >
        <View style={[styles.hubIconWrap, styles.hubIconPurple]}>
          <Ionicons name="swap-horizontal-outline" size={22} color="#8B5CF6" />
        </View>
        <View style={styles.hubCardText}>
          <Text style={styles.hubCardTitle}>Crossover Grading</Text>
          <Text style={styles.hubCardSub}>Photograph any graded slab</Text>
        </View>
        {isGateEnabled && !canCrossover && !isAdminMode ? (
          <View style={styles.hubLockPill}>
            <Ionicons name="lock-closed" size={11} color="#8B5CF6" />
            <Text style={[styles.hubLockPillText, { color: "#8B5CF6" }]}>Pro</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        )}
      </Pressable>
    </ScrollView>
  );

  const renderModeSelector = () => (
    <View style={styles.modeSelectorWrap}>
      <View style={styles.modeSelector}>
        <Pressable
          style={[styles.modeTab, mode === "quick" && styles.modeTabActive]}
          onPress={() => {
            setMode("quick");
            setAngledFrontImage(null);
            setAngledBackImage(null);
            setCornerImages({
              cornerFrontTL: null, cornerFrontTR: null, cornerFrontBL: null, cornerFrontBR: null,
              cornerBackTL: null, cornerBackTR: null, cornerBackBL: null, cornerBackBR: null,
            });
            setDeepStep("front");
          }}
        >
          <Ionicons name="flash-outline" size={16} color={mode === "quick" ? Colors.text : Colors.textMuted} />
          <Text style={[styles.modeTabText, mode === "quick" && styles.modeTabTextActive]}>Quick</Text>
        </Pressable>
        <Pressable
          style={[styles.modeTab, mode === "deep" && styles.modeTabActive]}
          onPress={handleSelectDeepMode}
        >
          <Ionicons name="search-outline" size={16} color={mode === "deep" ? "#F59E0B" : Colors.textMuted} />
          <Text style={[styles.modeTabText, mode === "deep" && styles.modeTabTextDeep]}>Deep</Text>
          {(isGateEnabled && !canDeepGrade && !isAdminMode) && (
            <Ionicons name="lock-closed" size={12} color="#F59E0B" style={{ marginLeft: 2 }} />
          )}
        </Pressable>
        <Pressable
          style={[styles.modeTab, mode === "crossover" && styles.modeTabActive]}
          onPress={() => {
            if (isGateEnabled && !canCrossover && !isAdminMode) {
              router.push("/crossover-info");
            } else {
              setMode("crossover");
            }
          }}
        >
          <Ionicons name="git-compare-outline" size={16} color={mode === "crossover" ? "#8B5CF6" : Colors.textMuted} />
          <Text style={[styles.modeTabText, mode === "crossover" && styles.modeTabTextCrossover]}>Crossover</Text>
          {(isGateEnabled && !canCrossover && !isAdminMode) && (
            <Ionicons name="lock-closed" size={12} color="#8B5CF6" style={{ marginLeft: 2 }} />
          )}
        </Pressable>
      </View>
      {(isGateEnabled && !canDeepGrade && !isAdminMode) && (
        <Pressable onPress={handleSelectDeepMode} style={({ pressed }) => [styles.deepTeaserBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <Ionicons name="sparkles" size={12} color="#F59E0B" />
          <Text style={styles.deepTeaser}>
            <Text style={{ color: "#F59E0B", fontFamily: "Inter_700Bold" }}>6x</Text> more accurate grading
          </Text>
          <Ionicons name="chevron-forward" size={11} color="#F59E0B" />
        </Pressable>
      )}
    </View>
  );

  const DEEP_STEPS: DeepStep[] = [
    "front", "angledFront",
    "cornerFrontTL", "cornerFrontTR", "cornerFrontBL", "cornerFrontBR",
    "back", "angledBack",
    "cornerBackTL", "cornerBackTR", "cornerBackBL", "cornerBackBR",
  ];
  const DEEP_STEP_LABELS = [
    "Front", "Front\nAngle",
    "F\nTL", "F\nTR", "F\nBL", "F\nBR",
    "Back", "Back\nAngle",
    "B\nTL", "B\nTR", "B\nBL", "B\nBR",
  ];

  const getDeepStepImage = (step: DeepStep): string | null => {
    if (step === "front") return frontImage;
    if (step === "back") return backImage;
    if (step === "angledFront") return angledFrontImage;
    if (step === "angledBack") return angledBackImage;
    if (isCornerStep(step)) return cornerImages[step] || null;
    return null;
  };

  const getNextStep = (step: DeepStep): DeepStep | null => {
    const idx = DEEP_STEPS.indexOf(step);
    return idx < DEEP_STEPS.length - 1 ? DEEP_STEPS[idx + 1] : null;
  };

  const currentStepIdx = DEEP_STEPS.indexOf(deepStep);
  const isCornerPhase = isCornerStep(deepStep);
  const isFrontCornerPhase = deepStep.startsWith("cornerFront");
  const isBackCornerPhase = deepStep.startsWith("cornerBack");
  const completedCount = DEEP_STEPS.filter(s => !!getDeepStepImage(s)).length;

  const getRemoveHandler = (step: DeepStep) => {
    if (step === "front") return () => setFrontImage(null);
    if (step === "back") return () => setBackImage(null);
    if (step === "angledFront") return () => setAngledFrontImage(null);
    if (step === "angledBack") return () => setAngledBackImage(null);
    return () => setCornerImages(prev => ({ ...prev, [step]: null }));
  };

  const renderDeepGradeSteps = () => (
    <View style={styles.deepStepsContainer}>
      <View style={styles.deepProgressRow}>
        <Text style={styles.deepProgressText}>{completedCount} / 12 photos</Text>
        <View style={styles.deepProgressBarOuter}>
          <View style={[styles.deepProgressBarInner, { width: `${(completedCount / 12) * 100}%` }]} />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deepStepScroll} contentContainerStyle={styles.deepStepScrollContent}>
        {DEEP_STEPS.map((step, i) => {
          const isComplete = !!getDeepStepImage(step);
          const isCurrent = deepStep === step;
          const isCorner = isCornerStep(step);
          return (
            <Pressable key={step} style={styles.deepStepItem} onPress={() => setDeepStep(step)}>
              <View
                style={[
                  styles.deepStepDot,
                  isComplete && styles.deepStepDotComplete,
                  isCurrent && !isComplete && styles.deepStepDotCurrent,
                  isCorner && isCurrent && !isComplete && styles.deepStepDotCornerCurrent,
                ]}
              >
                {isComplete ? (
                  <Ionicons name="checkmark" size={12} color="#fff" />
                ) : (
                  <Text style={[styles.deepStepNumber, isCurrent && styles.deepStepNumberCurrent]}>{i + 1}</Text>
                )}
              </View>
              <Text style={[styles.deepStepLabel, isCurrent && styles.deepStepLabelActive]} numberOfLines={2}>
                {DEEP_STEP_LABELS[i]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isCornerPhase && (
        <View style={styles.cornerPhaseHeader}>
          <Ionicons name="crop-outline" size={16} color="#F59E0B" />
          <Text style={styles.cornerPhaseTitle}>
            {isFrontCornerPhase ? "Front Corner Close-ups" : "Back Corner Close-ups"}
          </Text>
        </View>
      )}

      <View style={styles.deepGuidance}>
        <Ionicons name={DEEP_STEP_GUIDANCE[deepStep].icon} size={20} color="#F59E0B" />
        <View style={{ flex: 1 }}>
          <Text style={styles.deepGuidanceTitle}>{DEEP_STEP_GUIDANCE[deepStep].title}</Text>
          <Text style={styles.deepGuidanceSubtitle}>{DEEP_STEP_GUIDANCE[deepStep].subtitle}</Text>
        </View>
      </View>

      {completedCount === 0 && Platform.OS !== "web" && (
        <Pressable
          style={({ pressed }) => [styles.deepCaptureAllBtn, { opacity: pressed ? 0.8 : 1 }]}
          onPress={launchDeepCamera}
        >
          <LinearGradient
            colors={["#F59E0B", "#D97706"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.deepCaptureAllGradient}
          >
            <Ionicons name="camera" size={22} color="#fff" />
            <Text style={styles.deepCaptureAllText}>Capture All 12 Photos</Text>
            <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.7)" />
          </LinearGradient>
        </Pressable>
      )}

      <View style={styles.deepCaptureArea}>
        <ImageCapture
          label=""
          imageUri={getDeepStepImage(deepStep)}
          onCapture={() => pickImage(deepStep)}
          onRemove={getRemoveHandler(deepStep)}
          loading={false}
        />
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

      <View style={{ height: 100 }} />
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        {mode !== "hub" && !loading && (
          <Pressable
            onPress={() => setMode("hub")}
            hitSlop={10}
            style={({ pressed }) => [styles.headerBack, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </Pressable>
        )}
        <Text style={styles.headerTitle}>
          {mode === "hub" ? "Grade" : mode === "quick" ? "Quick Grade" : mode === "deep" ? "Deep Grade" : "Crossover Grading"}
        </Text>
        {mode === "deep" && remainingDeepGrades !== null && !isAdminMode && (
          <View style={styles.deepBadge}>
            <Text style={styles.deepBadgeText}>{remainingDeepGrades} deep left</Text>
          </View>
        )}
        {mode === "crossover" && remainingCrossoverGrades !== null && !isAdminMode && (
          <View style={[styles.deepBadge, { backgroundColor: "rgba(139, 92, 246, 0.15)" }]}>
            <Text style={[styles.deepBadgeText, { color: "#8B5CF6" }]}>{remainingCrossoverGrades} left</Text>
          </View>
        )}
      </View>

      {mode === "hub" ? (
        renderHub()
      ) : loading ? (
        <View style={styles.analysisContainer}>
          <View style={styles.analysisCard}>
            {mode === "deep" && (
              <View style={styles.deepAnalysisBadge}>
                <Ionicons name="search" size={12} color="#F59E0B" />
                <Text style={styles.deepAnalysisBadgeText}>Deep Grade</Text>
              </View>
            )}
            {mode === "crossover" && (
              <View style={[styles.deepAnalysisBadge, { backgroundColor: "rgba(139, 92, 246, 0.15)" }]}>
                <Ionicons name="git-compare-outline" size={12} color="#8B5CF6" />
                <Text style={[styles.deepAnalysisBadgeText, { color: "#8B5CF6" }]}>Crossover Grade</Text>
              </View>
            )}
            <View style={styles.analysisIconWrap}>
              <View style={[styles.analysisIconBg, mode === "deep" && { backgroundColor: "rgba(245, 158, 11, 0.12)" }, mode === "crossover" && { backgroundColor: "rgba(139, 92, 246, 0.12)" }]}>
                <Ionicons name={currentStage.icon as any} size={32} color={mode === "deep" ? "#F59E0B" : mode === "crossover" ? "#8B5CF6" : Colors.primary} />
              </View>
              <ActivityIndicator color={mode === "deep" ? "#F59E0B" : mode === "crossover" ? "#8B5CF6" : Colors.primary} size="small" style={styles.analysisSpinner} />
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
                  mode === "crossover" && { backgroundColor: "#8B5CF6" },
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
                    color={i < analysisStage ? Colors.success : i === analysisStage ? (mode === "deep" ? "#F59E0B" : mode === "crossover" ? "#8B5CF6" : Colors.primary) : Colors.textMuted}
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
            {mode === "deep" ? "Deep analysis takes 30-60 seconds" : mode === "crossover" ? "Crossover analysis takes 15-30 seconds" : "This usually takes 15-30 seconds"}
          </Text>

          <Pressable
            style={({ pressed }) => [styles.continueButton, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => {
              setLoading(false);
              setFrontImage(null);
              setBackImage(null);
              setAngledFrontImage(null);
              setAngledBackImage(null);
              setCornerImages({
                cornerFrontTL: null, cornerFrontTR: null, cornerFrontBL: null, cornerFrontBR: null,
                cornerBackTL: null, cornerBackTR: null, cornerBackBL: null, cornerBackBR: null,
              });
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
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + webBottomInset + 140 }]}
            showsVerticalScrollIndicator={false}
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
          >
            {mode === "crossover" ? (
              <>
                <View style={styles.crossoverHeader}>
                  <View style={[styles.crossoverHeaderIcon, { backgroundColor: "rgba(139,92,246,0.12)" }]}>
                    <Ionicons name="swap-horizontal-outline" size={20} color="#8B5CF6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.crossoverHeaderTitle}>Photograph the Slab</Text>
                    <Text style={styles.crossoverHeaderSub}>Add photos of the front and back of the graded slab</Text>
                  </View>
                </View>

                <View style={styles.imageRow}>
                  <ImageCapture
                    label="Front"
                    imageUri={slabImage}
                    onCapture={async () => {
                      if (Platform.OS === "web") {
                        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                        if (status !== "granted") { Alert.alert("Permission Required", "Photo library access is needed."); return; }
                        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
                        if (!result.canceled && result.assets[0]) setSlabImage(result.assets[0].uri);
                      } else {
                        Alert.alert("Add Slab Front Photo", "Choose an option", [
                          { text: "Take Photo", onPress: () => setCameraOpen("slabFront") },
                          { text: "Choose from Library", onPress: async () => {
                            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                            if (status !== "granted") return;
                            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
                            if (!result.canceled && result.assets[0]) setSlabImage(result.assets[0].uri);
                          }},
                          { text: "Cancel", style: "cancel" },
                        ]);
                      }
                    }}
                    onRemove={() => setSlabImage(null)}
                    loading={false}
                  />
                  <ImageCapture
                    label="Back"
                    imageUri={slabBackImage}
                    onCapture={async () => {
                      if (Platform.OS === "web") {
                        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                        if (status !== "granted") { Alert.alert("Permission Required", "Photo library access is needed."); return; }
                        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
                        if (!result.canceled && result.assets[0]) setSlabBackImage(result.assets[0].uri);
                      } else {
                        Alert.alert("Add Slab Back Photo", "Choose an option", [
                          { text: "Take Photo", onPress: () => setCameraOpen("slabBack") },
                          { text: "Choose from Library", onPress: async () => {
                            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                            if (status !== "granted") return;
                            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
                            if (!result.canceled && result.assets[0]) setSlabBackImage(result.assets[0].uri);
                          }},
                          { text: "Cancel", style: "cancel" },
                        ]);
                      }
                    }}
                    onRemove={() => setSlabBackImage(null)}
                    loading={false}
                  />
                </View>

                <View style={styles.tipsCard}>
                  <Text style={styles.tipsTitle}>Tips for slab photos</Text>
                  <View style={styles.tipRow}>
                    <Ionicons name="scan" size={16} color="#8B5CF6" />
                    <Text style={styles.tipText}>Photograph both the front and back of the slab if possible</Text>
                  </View>
                  <View style={styles.tipRow}>
                    <Ionicons name="sunny" size={16} color="#8B5CF6" />
                    <Text style={styles.tipText}>Use good lighting to reduce glare on the plastic case</Text>
                  </View>
                  <View style={styles.tipRow}>
                    <Ionicons name="information-circle" size={16} color="#8B5CF6" />
                    <Text style={styles.tipText}>Results are estimates — actual crossover outcomes may vary</Text>
                  </View>
                </View>
              </>
            ) : mode === "quick" ? (
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
                    loading={false}
                  />
                  <ImageCapture
                    label="Back"
                    imageUri={backImage}
                    onCapture={() => pickImage("back")}
                    onRemove={() => setBackImage(null)}
                    loading={false}
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
                colors={mode === "deep" ? ["#F59E0B", "#D97706"] : mode === "crossover" ? ["#8B5CF6", "#6D28D9"] : [Colors.gradientStart, Colors.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientInner}
              >
                <Ionicons name={mode === "deep" ? "search" : mode === "crossover" ? "git-compare-outline" : "sparkles"} size={20} color="#fff" />
                <Text style={styles.analyzeText}>{mode === "deep" ? "Deep Analyze" : mode === "crossover" ? "Crossover Analyze" : "Analyze & Grade"}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </>
      )}

      {cameraOpen && (
        <CardCamera
          side={cameraOpen === "angledFront" || cameraOpen.startsWith("cornerFront") || cameraOpen === "slabFront" ? "front" : cameraOpen === "angledBack" || cameraOpen.startsWith("cornerBack") || cameraOpen === "slabBack" ? "back" : cameraOpen === "front" ? "front" : "back"}
          isAngled={cameraOpen === "angledFront" || cameraOpen === "angledBack"}
          isSlabMode={cameraOpen === "slabFront" || cameraOpen === "slabBack"}
          stepLabel={DEEP_STEP_GUIDANCE[cameraOpen]?.title}
          onCapture={handleCameraCapture}
          onClose={() => { setCameraOpen(null); setDeepCameraActive(false); }}
          deepGradeFlow={deepCameraActive && mode === "deep" ? {
            currentStep: DEEP_STEPS.indexOf(cameraOpen) + 1,
            totalSteps: DEEP_STEPS.length,
            stepTitle: DEEP_STEP_GUIDANCE[cameraOpen].title,
            stepSubtitle: DEEP_STEP_GUIDANCE[cameraOpen].subtitle,
            stepIcon: DEEP_STEP_GUIDANCE[cameraOpen].icon,
            isCornerStep: isCornerStep(cameraOpen),
          } : undefined}
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
                <View style={styles.modalStepNum}><Text style={styles.modalStepNumText}>1-4</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalStepTitle}>Full card shots</Text>
                  <Text style={styles.modalStepDesc}>Front, front angle, back, and back angle to capture the card from all sides</Text>
                </View>
              </View>
              <View style={styles.modalStepRow}>
                <View style={styles.modalStepNum}><Text style={styles.modalStepNumText}>5-8</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalStepTitle}>Front corner close-ups</Text>
                  <Text style={styles.modalStepDesc}>Get close to each corner of the front for detailed whitening and wear inspection</Text>
                </View>
              </View>
              <View style={styles.modalStepRow}>
                <View style={styles.modalStepNum}><Text style={styles.modalStepNumText}>9-12</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalStepTitle}>Back corner close-ups</Text>
                  <Text style={styles.modalStepDesc}>Get close to each corner of the back for detailed edge and corner grading</Text>
                </View>
              </View>
            </View>

            <Text style={styles.modalNote}>
              12 photos total for the most accurate AI grading possible. Corner close-ups let the AI see details invisible in full-card photos.
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

      {adjustImage && (
        <ImageAdjustModal
          visible={true}
          imageUri={adjustImage.uri}
          onConfirm={handleAdjustConfirm}
          onCancel={handleAdjustCancel}
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
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerBack: {
    padding: 2,
  },
  headerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: Colors.text,
    flex: 1,
  },
  hubContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 10,
  },
  hubSectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  hubCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  hubIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  hubIconRed: { backgroundColor: "rgba(255,60,49,0.12)" },
  hubIconAmber: { backgroundColor: "rgba(245,158,11,0.12)" },
  hubIconGreen: { backgroundColor: "rgba(16,185,129,0.12)" },
  hubIconPurple: { backgroundColor: "rgba(139,92,246,0.12)" },
  hubIconBlue: { backgroundColor: "rgba(59,130,246,0.12)" },
  hubCardText: {
    flex: 1,
    gap: 2,
  },
  hubCardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  hubCardSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  hubLockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(245,158,11,0.12)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  hubLockPillPurple: {
    backgroundColor: "rgba(139,92,246,0.12)",
  },
  hubLockPillGreen: {
    backgroundColor: "rgba(16,185,129,0.12)",
  },
  hubLockPillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#F59E0B",
  },
  hubCardLocked: {
    opacity: 0.85,
  },
  hubComingSoonPill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
    backgroundColor: "rgba(139,92,246,0.12)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  hubComingSoonPillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#8B5CF6",
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
  modeSelectorWrap: {
    gap: 0,
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
  modeTabDisabled: {
    opacity: 1,
  },
  modeTabSoonBadge: {
    backgroundColor: "rgba(139,92,246,0.18)",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  modeTabSoonBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    color: "#8B5CF6",
    letterSpacing: 0.3,
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
  deepTeaserBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.25)",
  },
  deepTeaser: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
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
    flex: 1,
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
  deepProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deepProgressText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#F59E0B",
    minWidth: 75,
  },
  deepProgressBarOuter: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.surface,
    borderRadius: 2,
  },
  deepProgressBarInner: {
    height: 4,
    backgroundColor: "#F59E0B",
    borderRadius: 2,
  },
  deepStepScroll: {
    maxHeight: 70,
  },
  deepStepScrollContent: {
    gap: 6,
    paddingHorizontal: 2,
  },
  deepStepItem: {
    alignItems: "center",
    width: 40,
    gap: 4,
  },
  deepStepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
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
  deepStepDotCornerCurrent: {
    borderColor: "#F59E0B",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
  },
  deepStepNumber: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: Colors.textMuted,
  },
  deepStepNumberCurrent: {
    color: "#F59E0B",
  },
  deepStepLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: Colors.textMuted,
    textAlign: "center" as const,
    lineHeight: 11,
  },
  deepStepLabelActive: {
    fontFamily: "Inter_600SemiBold",
    color: "#F59E0B",
  },
  cornerPhaseHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(245, 158, 11, 0.06)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  cornerPhaseTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
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
    width: "60%",
    alignSelf: "center" as const,
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
  deepCaptureAllBtn: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: "hidden" as const,
  },
  deepCaptureAllGradient: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
  },
  deepCaptureAllText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
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
  modeTabTextCrossover: {
    color: "#8B5CF6",
  },
  crossoverInfoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(139, 92, 246, 0.08)",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.2)",
  },
  crossoverHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.2)",
  },
  crossoverHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  crossoverHeaderTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  crossoverHeaderSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  certSection: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  certSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  certSectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  certCompanyRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  certCompanyPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  certCompanyPillActive: {
    backgroundColor: "rgba(139, 92, 246, 0.15)",
    borderColor: "#8B5CF6",
  },
  certCompanyPillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textMuted,
  },
  certCompanyPillTextActive: {
    color: "#8B5CF6",
  },
  certCompanyPillLocked: {
    opacity: 0.5,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  certCompanyPillTextLocked: {
    color: Colors.textMuted,
  },
  certCompanyPillSoonBadge: {
    marginLeft: 4,
    backgroundColor: Colors.surfaceBorder,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  certCompanyPillSoonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    color: Colors.textMuted,
    letterSpacing: 0.3,
  },
  certInputRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  certInput: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  certLookupBtn: {
    borderRadius: 12,
    overflow: "hidden",
  },
  certLookupBtnGradient: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 84,
  },
  certLookupBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  certLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 4,
  },
  certLoadingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  certErrorCard: {
    flexDirection: "column",
    gap: 10,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  certErrorTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  certErrorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#EF4444",
    flex: 1,
    lineHeight: 18,
  },
  certErrorPhotoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(139, 92, 246, 0.12)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.3)",
  },
  certErrorPhotoBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#8B5CF6",
  },
  certPreviewCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.25)",
  },
  certPreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  certPreviewBadge: {
    backgroundColor: "rgba(139, 92, 246, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  certPreviewBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: "#8B5CF6",
    letterSpacing: 0.5,
  },
  certPreviewGradeBadge: {
    alignItems: "flex-end",
  },
  certPreviewGradeLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
  },
  certPreviewGradeValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  certPreviewBody: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  certPreviewImageWrap: {
    position: "relative",
    marginBottom: 8,
    marginRight: 8,
  },
  certPreviewImage: {
    width: 72,
    height: 100,
    borderRadius: 6,
    backgroundColor: Colors.surface,
  },
  certPreviewImageSlab: {
    width: 90,
    height: 126,
    borderRadius: 8,
  },
  certPreviewLabelBadge: {
    position: "absolute",
    bottom: -6,
    right: -8,
    width: 40,
    height: 28,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
    backgroundColor: Colors.surface,
  },
  certPreviewImagesRow: {
    flexDirection: "row",
    gap: 8,
    marginRight: 8,
  },
  certPreviewImageSmall: {
    width: 60,
    height: 84,
    borderRadius: 6,
    backgroundColor: Colors.surface,
  },
  certPreviewImgLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 3,
  },
  certPreviewInfo: {
    flex: 1,
    gap: 4,
    justifyContent: "center",
  },
  certPhotoNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
    lineHeight: 16,
  },
  certPreviewCardName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    lineHeight: 18,
  },
  certPreviewSetName: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  certPreviewCertNum: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  certPreviewCheck: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  certPreviewCheckText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#10B981",
  },
  manualUploadToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  manualUploadDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.surfaceBorder,
  },
  manualUploadDividerText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
  },
  crossoverInfoText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    flex: 1,
  },
  crossoverSection: {
    gap: 8,
  },
  crossoverLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  crossoverOptional: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },

});
