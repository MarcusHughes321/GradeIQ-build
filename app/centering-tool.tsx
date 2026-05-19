import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import CardCamera from "@/components/CardCamera";
import ImageCapture from "@/components/ImageCapture";
import CenteringTool from "@/components/CenteringTool";
import CenteringReport from "@/components/CenteringReport";
import { apiRequest } from "@/lib/query-client";
import type { CenteringMeasurement, CardBounds } from "@/lib/types";

type Step = "capture" | "detecting" | "tool" | "report";

function centeringFromBounds(
  frontBounds: CardBounds,
  backBounds: CardBounds,
): CenteringMeasurement {
  const calcLR = (b: CardBounds) => {
    const left = b.innerLeftPercent ?? b.leftPercent;
    const right = b.innerRightPercent ?? b.rightPercent;
    const outerLeft = b.leftPercent;
    const outerRight = b.rightPercent;
    const innerWidth = right - left;
    const leftBorder = left - outerLeft;
    const rightBorder = outerRight - right;
    const total = leftBorder + rightBorder;
    if (total < 0.5) return 50;
    return Math.round((leftBorder / total) * 100);
  };

  const calcTB = (b: CardBounds) => {
    const top = b.innerTopPercent ?? b.topPercent;
    const bottom = b.innerBottomPercent ?? b.bottomPercent;
    const outerTop = b.topPercent;
    const outerBottom = b.bottomPercent;
    const topBorder = top - outerTop;
    const bottomBorder = outerBottom - bottom;
    const total = topBorder + bottomBorder;
    if (total < 0.5) return 50;
    return Math.round((topBorder / total) * 100);
  };

  return {
    frontLeftRight: calcLR(frontBounds),
    frontTopBottom: calcTB(frontBounds),
    backLeftRight: calcLR(backBounds),
    backTopBottom: calcTB(backBounds),
  };
}

export default function CenteringToolScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const [step, setStep] = useState<Step>("capture");
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState<"front" | "back" | null>(null);

  const [centering, setCentering] = useState<CenteringMeasurement | null>(null);
  const [frontBounds, setFrontBounds] = useState<CardBounds | undefined>(undefined);
  const [backBounds, setBackBounds] = useState<CardBounds | undefined>(undefined);

  const getBase64 = async (uri: string): Promise<string> => {
    if (uri.startsWith("data:")) return uri;
    try {
      const dim = 2048;
      const transforms: ImageManipulator.Action[] = Platform.OS === "android"
        ? [{ rotate: 0 }, { resize: { width: dim } }]
        : [{ resize: { width: dim } }];
      const result = await ImageManipulator.manipulateAsync(uri, transforms, {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      });
      if (result.base64) return `data:image/jpeg;base64,${result.base64}`;
    } catch {}
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleCapture = useCallback((uri: string) => {
    const side = cameraOpen;
    if (!side) return;
    if (side === "front") setFrontImage(uri);
    else setBackImage(uri);
    setCameraOpen(null);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [cameraOpen]);

  const pickFromLibrary = async (side: "front" | "back") => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow access to your photo library in Settings.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      if (side === "front") setFrontImage(result.assets[0].uri);
      else setBackImage(result.assets[0].uri);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleAddPhoto = useCallback((side: "front" | "back") => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Take Photo", "Choose from Library"],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) setCameraOpen(side);
          else if (index === 2) pickFromLibrary(side);
        },
      );
    } else {
      Alert.alert("Add Photo", "How would you like to add this photo?", [
        { text: "Cancel", style: "cancel" },
        { text: "Take Photo", onPress: () => setCameraOpen(side) },
        { text: "Choose from Library", onPress: () => pickFromLibrary(side) },
      ]);
    }
  }, []);

  const handleAnalyse = async () => {
    if (!frontImage || !backImage) {
      Alert.alert("Photos Required", "Please add both front and back photos.");
      return;
    }
    setStep("detecting");
    try {
      const [frontB64, backB64] = await Promise.all([
        getBase64(frontImage),
        getBase64(backImage),
      ]);

      const [frontResp, backResp] = await Promise.all([
        apiRequest("POST", "/api/crop-to-card", { image: frontB64 }),
        apiRequest("POST", "/api/crop-to-card", { image: backB64 }),
      ]);

      const [frontData, backData] = await Promise.all([
        frontResp.json(),
        backResp.json(),
      ]);

      const fBounds: CardBounds = frontData.cardBounds ?? {
        leftPercent: 2, topPercent: 3, rightPercent: 98, bottomPercent: 97,
      };
      const bBounds: CardBounds = backData.cardBounds ?? {
        leftPercent: 2, topPercent: 3, rightPercent: 98, bottomPercent: 97,
      };

      if (frontData.croppedImage) setFrontImage(frontData.croppedImage);
      if (backData.croppedImage) setBackImage(backData.croppedImage);

      const measured = centeringFromBounds(fBounds, bBounds);

      setFrontBounds(fBounds);
      setBackBounds(bBounds);
      setCentering(measured);
      setStep("tool");
    } catch (e) {
      console.log("Border detection failed:", e);
      const fallbackBounds: CardBounds = {
        leftPercent: 2, topPercent: 3, rightPercent: 98, bottomPercent: 97,
      };
      setCentering({ frontLeftRight: 50, frontTopBottom: 50, backLeftRight: 50, backTopBottom: 50 });
      setFrontBounds(fallbackBounds);
      setBackBounds(fallbackBounds);
      setStep("tool");
    }
  };

  if (step === "report" && centering) {
    return (
      <CenteringReport
        centering={centering}
        onReAdjust={() => setStep("tool")}
        onDone={() => {
          setStep("capture");
          setFrontImage(null);
          setBackImage(null);
          setCentering(null);
          setFrontBounds(undefined);
          setBackBounds(undefined);
        }}
      />
    );
  }

  if (step === "tool" && centering && frontImage && backImage) {
    return (
      <CenteringTool
        frontImage={frontImage}
        backImage={backImage}
        centering={centering}
        originalCentering={centering}
        frontCardBounds={frontBounds}
        backCardBounds={backBounds}
        onSave={(updated) => {
          setCentering(updated);
        }}
        onClose={() => {
          setStep("report");
        }}
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      {cameraOpen && (
        <CardCamera
          onCapture={handleCapture}
          onClose={() => setCameraOpen(null)}
          showGyro={true}
          isCornerMode={false}
        />
      )}

      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [styles.headerBack, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Centering Tool</Text>
        <View style={{ width: 36 }} />
      </View>

      {step === "detecting" ? (
        <View style={styles.detectingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.detectingText}>Detecting card borders…</Text>
          <Text style={styles.detectingSubText}>This takes a few seconds</Text>
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.infoCard}>
              <Ionicons name="resize-outline" size={20} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoTitle}>Free Centering Check</Text>
                <Text style={styles.infoSub}>
                  Photograph front and back — we auto-detect the borders and give you the interactive tool to fine-tune.
                </Text>
              </View>
            </View>

            <View style={styles.captureRow}>
              <View style={styles.captureSlot}>
                <Text style={styles.captureLabel}>Front</Text>
                <ImageCapture
                  label=""
                  imageUri={frontImage}
                  onCapture={() => handleAddPhoto("front")}
                  onRemove={() => setFrontImage(null)}
                  loading={false}
                />
              </View>
              <View style={styles.captureSlot}>
                <Text style={styles.captureLabel}>Back</Text>
                <ImageCapture
                  label=""
                  imageUri={backImage}
                  onCapture={() => handleAddPhoto("back")}
                  onRemove={() => setBackImage(null)}
                  loading={false}
                />
              </View>
            </View>

            <View style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>Tips for accuracy</Text>
              <View style={styles.tipRow}>
                <Ionicons name="sunny-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.tipText}>Photograph flat, with even lighting — avoid shadows across borders</Text>
              </View>
              <View style={styles.tipRow}>
                <Ionicons name="expand-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.tipText}>Fill the frame with the card — leave a small gap around all edges</Text>
              </View>
              <View style={styles.tipRow}>
                <Ionicons name="phone-portrait-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.tipText}>Keep the camera parallel to the card — use the spirit level guide</Text>
              </View>
            </View>
          </ScrollView>

          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable
              style={({ pressed }) => [
                styles.analyseBtn,
                (!frontImage || !backImage) && styles.analyseBtnDisabled,
                { opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={handleAnalyse}
              disabled={!frontImage || !backImage}
            >
              <Ionicons name="resize-outline" size={20} color="#fff" />
              <Text style={styles.analyseBtnText}>Analyse Centering</Text>
            </Pressable>
          </View>
        </>
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  headerBack: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  detectingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  detectingText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  detectingSubText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 16,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    backgroundColor: Colors.background,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: `${Colors.primary}14`,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
  },
  infoTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 3,
  },
  infoSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  captureRow: {
    flexDirection: "row",
    gap: 14,
  },
  captureSlot: {
    flex: 1,
    gap: 6,
  },
  captureLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
    textAlign: "center",
  },
  tipsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  tipsTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  tipText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    flex: 1,
    lineHeight: 17,
  },
  analyseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
  },
  analyseBtnDisabled: {
    opacity: 0.45,
  },
  analyseBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
});
