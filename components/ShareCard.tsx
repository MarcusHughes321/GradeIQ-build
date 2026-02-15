import React, { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import CompanyLabel from "@/components/CompanyLabel";
import type { GradingResult, SavedGrading } from "@/lib/types";

interface ShareCardProps {
  grading: SavedGrading;
  enabledCompanies: string[];
}

type ShareFormat = "instagram_post" | "instagram_story" | "twitter";

interface FormatConfig {
  key: ShareFormat;
  label: string;
  subtitle: string;
  icon: string;
  iconSet: "ionicons" | "material";
  width: number;
  height: number;
}

const FORMATS: FormatConfig[] = [
  {
    key: "instagram_post",
    label: "Instagram Post",
    subtitle: "1080 x 1080",
    icon: "logo-instagram",
    iconSet: "ionicons",
    width: 1080,
    height: 1080,
  },
  {
    key: "instagram_story",
    label: "Story / TikTok",
    subtitle: "1080 x 1920",
    icon: "phone-portrait-outline",
    iconSet: "ionicons",
    width: 1080,
    height: 1920,
  },
  {
    key: "twitter",
    label: "Twitter / Facebook",
    subtitle: "1200 x 630",
    icon: "open-outline",
    iconSet: "ionicons",
    width: 1200,
    height: 630,
  },
];

function getGradientColor(grade: number): string {
  const ratio = Math.max(0, Math.min(1, (grade - 1) / 9));
  if (ratio <= 0.5) {
    const t = ratio * 2;
    const r = Math.round(239 + (245 - 239) * t);
    const g = Math.round(68 + (158 - 68) * t);
    const b = Math.round(11 + (11 - 68) * t);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const t = (ratio - 0.5) * 2;
    const r = Math.round(245 + (16 - 245) * t);
    const g = Math.round(158 + (185 - 158) * t);
    const b = Math.round(11 + (129 - 11) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function ShareCardSquare({ grading, enabledCompanies }: ShareCardProps) {
  const { result } = grading;
  const displaySetName = result.setName || result.setInfo || "";
  const displaySetNumber = result.setNumber || "";

  const companies: { key: string; label: string; grade: number }[] = [];
  if (enabledCompanies.includes("PSA")) companies.push({ key: "PSA", label: "PSA", grade: result.psa.grade });
  if (enabledCompanies.includes("Beckett")) companies.push({ key: "BGS", label: "BGS", grade: result.beckett.overallGrade });
  if (enabledCompanies.includes("Ace")) companies.push({ key: "ACE", label: "ACE", grade: result.ace.overallGrade });
  if (enabledCompanies.includes("TAG") && result.tag) companies.push({ key: "TAG", label: "TAG", grade: result.tag.overallGrade });
  if (enabledCompanies.includes("CGC") && result.cgc) companies.push({ key: "CGC", label: "CGC", grade: result.cgc.grade });

  const subGrades = [
    { name: "Centering", grade: result.beckett.centering.grade },
    { name: "Corners", grade: result.beckett.corners.grade },
    { name: "Edges", grade: result.beckett.edges.grade },
    { name: "Surface", grade: result.beckett.surface.grade },
  ];

  return (
    <View style={squareStyles.card}>
      <View style={squareStyles.header}>
        <View style={squareStyles.logoRow}>
          <Text style={squareStyles.logoText}>Grade</Text>
          <Text style={squareStyles.logoDot}>.</Text>
          <Text style={squareStyles.logoIQ}>IQ</Text>
        </View>
        <Text style={squareStyles.subtitle}>AI Card Grading</Text>
      </View>

      <View style={squareStyles.body}>
        <View style={squareStyles.cardPreview}>
          <Image source={{ uri: grading.frontImage }} style={squareStyles.cardImage} contentFit="cover" />
        </View>
        <View style={squareStyles.cardInfo}>
          <Text style={squareStyles.cardName} numberOfLines={2}>{result.cardName || "Pokemon Card"}</Text>
          {displaySetName ? <Text style={squareStyles.setName} numberOfLines={1}>{displaySetName}</Text> : null}
          {displaySetNumber ? <Text style={squareStyles.setNumber}>{displaySetNumber}</Text> : null}
        </View>
      </View>

      <View style={squareStyles.grades}>
        {companies.map((c) => (
          <View key={c.key} style={squareStyles.gradeItem}>
            <CompanyLabel company={c.key} fontSize={14} fontFamily="Inter_600SemiBold" />
            <Text style={[squareStyles.gradeValue, { color: getGradientColor(c.grade) }]}>
              {c.grade % 1 === 0 ? c.grade.toString() : c.grade.toFixed(1)}
            </Text>
          </View>
        ))}
      </View>

      <View style={squareStyles.divider} />

      <View style={squareStyles.subGrades}>
        {subGrades.map((s) => (
          <View key={s.name} style={squareStyles.subItem}>
            <Text style={squareStyles.subLabel}>{s.name}</Text>
            <Text style={[squareStyles.subValue, { color: getGradientColor(s.grade) }]}>{s.grade}</Text>
          </View>
        ))}
      </View>

      <View style={squareStyles.footer}>
        <View style={squareStyles.footerLine} />
        <Text style={squareStyles.footerText}>Graded with Grade.IQ</Text>
        <View style={squareStyles.footerLine} />
      </View>
    </View>
  );
}

function ShareCardStory({ grading, enabledCompanies }: ShareCardProps) {
  const { result } = grading;
  const displaySetName = result.setName || result.setInfo || "";
  const displaySetNumber = result.setNumber || "";

  const companies: { key: string; label: string; grade: number }[] = [];
  if (enabledCompanies.includes("PSA")) companies.push({ key: "PSA", label: "PSA", grade: result.psa.grade });
  if (enabledCompanies.includes("Beckett")) companies.push({ key: "BGS", label: "BGS", grade: result.beckett.overallGrade });
  if (enabledCompanies.includes("Ace")) companies.push({ key: "ACE", label: "ACE", grade: result.ace.overallGrade });
  if (enabledCompanies.includes("TAG") && result.tag) companies.push({ key: "TAG", label: "TAG", grade: result.tag.overallGrade });
  if (enabledCompanies.includes("CGC") && result.cgc) companies.push({ key: "CGC", label: "CGC", grade: result.cgc.grade });

  const subGrades = [
    { name: "Centering", grade: result.beckett.centering.grade },
    { name: "Corners", grade: result.beckett.corners.grade },
    { name: "Edges", grade: result.beckett.edges.grade },
    { name: "Surface", grade: result.beckett.surface.grade },
  ];

  return (
    <View style={storyStyles.card}>
      <View style={storyStyles.header}>
        <View style={storyStyles.logoRow}>
          <Text style={storyStyles.logoText}>Grade</Text>
          <Text style={storyStyles.logoDot}>.</Text>
          <Text style={storyStyles.logoIQ}>IQ</Text>
        </View>
        <Text style={storyStyles.subtitle}>AI Card Grading</Text>
      </View>

      <View style={storyStyles.imageContainer}>
        <Image source={{ uri: grading.frontImage }} style={storyStyles.cardImage} contentFit="contain" />
      </View>

      <View style={storyStyles.cardInfo}>
        <Text style={storyStyles.cardName} numberOfLines={2}>{result.cardName || "Pokemon Card"}</Text>
        {displaySetName ? <Text style={storyStyles.setName} numberOfLines={1}>{displaySetName}</Text> : null}
        {displaySetNumber ? <Text style={storyStyles.setNumber}>{displaySetNumber}</Text> : null}
      </View>

      <View style={storyStyles.grades}>
        {companies.map((c) => (
          <View key={c.key} style={storyStyles.gradeItem}>
            <CompanyLabel company={c.key} fontSize={16} fontFamily="Inter_600SemiBold" />
            <Text style={[storyStyles.gradeValue, { color: getGradientColor(c.grade) }]}>
              {c.grade % 1 === 0 ? c.grade.toString() : c.grade.toFixed(1)}
            </Text>
          </View>
        ))}
      </View>

      <View style={storyStyles.divider} />

      <View style={storyStyles.subGrades}>
        {subGrades.map((s) => (
          <View key={s.name} style={storyStyles.subItem}>
            <Text style={storyStyles.subLabel}>{s.name}</Text>
            <Text style={[storyStyles.subValue, { color: getGradientColor(s.grade) }]}>{s.grade}</Text>
          </View>
        ))}
      </View>

      <View style={storyStyles.footer}>
        <View style={storyStyles.footerLine} />
        <Text style={storyStyles.footerText}>Graded with Grade.IQ</Text>
        <View style={storyStyles.footerLine} />
      </View>
    </View>
  );
}

function ShareCardWide({ grading, enabledCompanies }: ShareCardProps) {
  const { result } = grading;
  const displaySetName = result.setName || result.setInfo || "";
  const displaySetNumber = result.setNumber || "";

  const companies: { key: string; label: string; grade: number }[] = [];
  if (enabledCompanies.includes("PSA")) companies.push({ key: "PSA", label: "PSA", grade: result.psa.grade });
  if (enabledCompanies.includes("Beckett")) companies.push({ key: "BGS", label: "BGS", grade: result.beckett.overallGrade });
  if (enabledCompanies.includes("Ace")) companies.push({ key: "ACE", label: "ACE", grade: result.ace.overallGrade });
  if (enabledCompanies.includes("TAG") && result.tag) companies.push({ key: "TAG", label: "TAG", grade: result.tag.overallGrade });
  if (enabledCompanies.includes("CGC") && result.cgc) companies.push({ key: "CGC", label: "CGC", grade: result.cgc.grade });

  const subGrades = [
    { name: "Centering", grade: result.beckett.centering.grade },
    { name: "Corners", grade: result.beckett.corners.grade },
    { name: "Edges", grade: result.beckett.edges.grade },
    { name: "Surface", grade: result.beckett.surface.grade },
  ];

  return (
    <View style={wideStyles.card}>
      <View style={wideStyles.leftSection}>
        <View style={wideStyles.imageContainer}>
          <Image source={{ uri: grading.frontImage }} style={wideStyles.cardImage} contentFit="cover" />
        </View>
      </View>

      <View style={wideStyles.rightSection}>
        <View style={wideStyles.header}>
          <View style={wideStyles.logoRow}>
            <Text style={wideStyles.logoText}>Grade</Text>
            <Text style={wideStyles.logoDot}>.</Text>
            <Text style={wideStyles.logoIQ}>IQ</Text>
          </View>
        </View>

        <Text style={wideStyles.cardName} numberOfLines={2}>{result.cardName || "Pokemon Card"}</Text>
        {displaySetName ? <Text style={wideStyles.setName} numberOfLines={1}>{displaySetName}</Text> : null}

        <View style={wideStyles.grades}>
          {companies.map((c) => (
            <View key={c.key} style={wideStyles.gradeItem}>
              <CompanyLabel company={c.key} fontSize={11} fontFamily="Inter_600SemiBold" />
              <Text style={[wideStyles.gradeValue, { color: getGradientColor(c.grade) }]}>
                {c.grade % 1 === 0 ? c.grade.toString() : c.grade.toFixed(1)}
              </Text>
            </View>
          ))}
        </View>

        <View style={wideStyles.divider} />

        <View style={wideStyles.subGrades}>
          {subGrades.map((s) => (
            <View key={s.name} style={wideStyles.subItem}>
              <Text style={wideStyles.subLabel}>{s.name}</Text>
              <Text style={[wideStyles.subValue, { color: getGradientColor(s.grade) }]}>{s.grade}</Text>
            </View>
          ))}
        </View>

        <Text style={wideStyles.footerText}>Graded with Grade.IQ</Text>
      </View>
    </View>
  );
}

export default function ShareButton({ grading, enabledCompanies }: ShareCardProps) {
  const squareRef = useRef<View>(null);
  const storyRef = useRef<View>(null);
  const wideRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const getRef = (format: ShareFormat) => {
    switch (format) {
      case "instagram_post": return squareRef;
      case "instagram_story": return storyRef;
      case "twitter": return wideRef;
    }
  };

  const handleShare = useCallback(async (format: ShareFormat) => {
    const ref = getRef(format);
    if (!ref.current || sharing) return;
    setSharing(true);
    setShowPicker(false);

    await new Promise((r) => setTimeout(r, 100));

    try {
      const config = FORMATS.find((f) => f.key === format)!;
      const scale = config.width / (format === "twitter" ? 600 : format === "instagram_story" ? 360 : 380);

      const uri = await captureRef(ref, {
        format: "png",
        quality: 1,
        result: "tmpfile",
        width: config.width,
        height: config.height,
      });

      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "Share your Grade.IQ results",
          UTI: "public.png",
        });
      } else if (Platform.OS === "web") {
        const link = document.createElement("a");
        link.href = uri;
        link.download = `GradeIQ_${grading.result.cardName?.replace(/\s+/g, "_") || "card"}_${format}.png`;
        link.click();
      } else {
        Alert.alert("Sharing not available", "Sharing is not supported on this device.");
      }
    } catch (err) {
      console.error("Share error:", err);
      Alert.alert("Error", "Failed to create share image. Please try again.");
    } finally {
      setSharing(false);
    }
  }, [grading, sharing]);

  return (
    <>
      <View style={offscreenStyles.container} pointerEvents="none">
        <View ref={squareRef} collapsable={false} style={offscreenStyles.squareWrap}>
          <ShareCardSquare grading={grading} enabledCompanies={enabledCompanies} />
        </View>
        <View ref={storyRef} collapsable={false} style={offscreenStyles.storyWrap}>
          <ShareCardStory grading={grading} enabledCompanies={enabledCompanies} />
        </View>
        <View ref={wideRef} collapsable={false} style={offscreenStyles.wideWrap}>
          <ShareCardWide grading={grading} enabledCompanies={enabledCompanies} />
        </View>
      </View>

      <Pressable
        onPress={() => setShowPicker(true)}
        style={({ pressed }) => [btnStyles.shareBtn, { opacity: pressed ? 0.8 : 1 }]}
        disabled={sharing}
      >
        {sharing ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="share-outline" size={18} color="#FFFFFF" />
            <Text style={btnStyles.shareBtnText}>Share Results</Text>
          </>
        )}
      </Pressable>

      <Modal
        visible={showPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPicker(false)}
      >
        <Pressable style={pickerStyles.overlay} onPress={() => setShowPicker(false)}>
          <Pressable style={pickerStyles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={pickerStyles.handle} />
            <Text style={pickerStyles.title}>Choose Format</Text>
            <Text style={pickerStyles.desc}>Pick the right size for where you're posting</Text>

            <View style={pickerStyles.options}>
              {FORMATS.map((format) => (
                <Pressable
                  key={format.key}
                  style={({ pressed }) => [
                    pickerStyles.option,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                  onPress={() => handleShare(format.key)}
                >
                  <View style={pickerStyles.optionIcon}>
                    <Ionicons name={format.icon as any} size={24} color="#FFFFFF" />
                  </View>
                  <View style={pickerStyles.optionInfo}>
                    <Text style={pickerStyles.optionLabel}>{format.label}</Text>
                    <Text style={pickerStyles.optionSize}>{format.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#555" />
                </Pressable>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [pickerStyles.cancelBtn, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => setShowPicker(false)}
            >
              <Text style={pickerStyles.cancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const offscreenStyles = StyleSheet.create({
  container: {
    position: "absolute",
    left: -9999,
    top: -9999,
    opacity: 1,
  },
  squareWrap: {
    width: 380,
    height: 380,
  },
  storyWrap: {
    width: 360,
    height: 640,
  },
  wideWrap: {
    width: 600,
    height: 315,
  },
});

const squareStyles = StyleSheet.create({
  card: {
    width: 380,
    height: 380,
    backgroundColor: "#0A0A0A",
    padding: 24,
    justifyContent: "space-between",
  },
  header: {
    alignItems: "center",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  logoText: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF" },
  logoDot: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FF3C31" },
  logoIQ: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF" },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#666666", marginTop: 1 },
  body: {
    flexDirection: "row",
    gap: 14,
  },
  cardPreview: {
    width: 90,
    height: 126,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#1A1A1A",
  },
  cardImage: { width: "100%", height: "100%" },
  cardInfo: {
    flex: 1,
    justifyContent: "center",
    gap: 4,
  },
  cardName: { fontFamily: "Inter_700Bold", fontSize: 17, color: "#FFFFFF", lineHeight: 22 },
  setName: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#A0A0A0" },
  setNumber: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#666666" },
  grades: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  gradeItem: { alignItems: "center", gap: 3 },
  gradeValue: { fontFamily: "Inter_700Bold", fontSize: 22 },
  divider: { height: 1, backgroundColor: "#2A2A2A" },
  subGrades: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  subItem: { alignItems: "center", gap: 2 },
  subLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#666666" },
  subValue: { fontFamily: "Inter_700Bold", fontSize: 14 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  footerLine: { flex: 1, height: 1, backgroundColor: "#2A2A2A" },
  footerText: { fontFamily: "Inter_500Medium", fontSize: 10, color: "#666666" },
});

const storyStyles = StyleSheet.create({
  card: {
    width: 360,
    height: 640,
    backgroundColor: "#0A0A0A",
    padding: 30,
    justifyContent: "space-between",
    alignItems: "center",
  },
  header: {
    alignItems: "center",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  logoText: { fontFamily: "Inter_700Bold", fontSize: 32, color: "#FFFFFF" },
  logoDot: { fontFamily: "Inter_700Bold", fontSize: 32, color: "#FF3C31" },
  logoIQ: { fontFamily: "Inter_700Bold", fontSize: 32, color: "#FFFFFF" },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#666666", marginTop: 2 },
  imageContainer: {
    width: 200,
    height: 280,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1A1A1A",
  },
  cardImage: { width: "100%", height: "100%" },
  cardInfo: {
    alignItems: "center",
    gap: 6,
    width: "100%",
  },
  cardName: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF", textAlign: "center", lineHeight: 28 },
  setName: { fontFamily: "Inter_400Regular", fontSize: 14, color: "#A0A0A0", textAlign: "center" },
  setNumber: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#666666" },
  grades: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
  },
  gradeItem: { alignItems: "center", gap: 4 },
  gradeValue: { fontFamily: "Inter_700Bold", fontSize: 28 },
  divider: { height: 1, backgroundColor: "#2A2A2A", width: "100%" },
  subGrades: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  subItem: { alignItems: "center", gap: 3 },
  subLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#666666" },
  subValue: { fontFamily: "Inter_700Bold", fontSize: 18 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  footerLine: { flex: 1, height: 1, backgroundColor: "#2A2A2A" },
  footerText: { fontFamily: "Inter_500Medium", fontSize: 11, color: "#666666" },
});

const wideStyles = StyleSheet.create({
  card: {
    width: 600,
    height: 315,
    backgroundColor: "#0A0A0A",
    flexDirection: "row",
  },
  leftSection: {
    width: 210,
    height: 315,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  imageContainer: {
    width: 170,
    height: 238,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#1A1A1A",
  },
  cardImage: { width: "100%", height: "100%" },
  rightSection: {
    flex: 1,
    padding: 20,
    paddingLeft: 0,
    justifyContent: "space-between",
  },
  header: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  logoText: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFFFFF" },
  logoDot: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#FF3C31" },
  logoIQ: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFFFFF" },
  cardName: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF", lineHeight: 20 },
  setName: { fontFamily: "Inter_400Regular", fontSize: 11, color: "#A0A0A0" },
  grades: {
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: 16,
  },
  gradeItem: { alignItems: "center", gap: 2 },
  gradeValue: { fontFamily: "Inter_700Bold", fontSize: 20 },
  divider: { height: 1, backgroundColor: "#2A2A2A" },
  subGrades: {
    flexDirection: "row",
    gap: 16,
  },
  subItem: { alignItems: "center", gap: 1 },
  subLabel: { fontFamily: "Inter_400Regular", fontSize: 9, color: "#666666" },
  subValue: { fontFamily: "Inter_700Bold", fontSize: 13 },
  footerText: { fontFamily: "Inter_500Medium", fontSize: 9, color: "#666666" },
});

const btnStyles = StyleSheet.create({
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FF3C31",
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 0,
  },
  shareBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#FFFFFF",
  },
});

const pickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#1A1A1A",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#444",
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: "#FFFFFF",
    textAlign: "center",
  },
  desc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#888",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 20,
  },
  options: {
    gap: 10,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#222",
    borderRadius: 14,
    padding: 16,
    gap: 14,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#333",
    alignItems: "center",
    justifyContent: "center",
  },
  optionInfo: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#FFFFFF",
  },
  optionSize: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#888",
  },
  cancelBtn: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#222",
    borderRadius: 14,
  },
  cancelText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#888",
  },
});
