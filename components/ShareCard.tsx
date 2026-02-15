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
  Image as RNImage,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import CompanyLabel from "@/components/CompanyLabel";
import type { SavedGrading } from "@/lib/types";

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
  width: number;
  height: number;
}

const FORMATS: FormatConfig[] = [
  { key: "instagram_post", label: "Instagram Post", subtitle: "1080 x 1080", icon: "logo-instagram", width: 1080, height: 1080 },
  { key: "instagram_story", label: "Story / TikTok", subtitle: "1080 x 1920", icon: "phone-portrait-outline", width: 1080, height: 1920 },
  { key: "twitter", label: "Twitter / Facebook", subtitle: "1200 x 630", icon: "open-outline", width: 1200, height: 630 },
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

function useCardData(grading: SavedGrading, enabledCompanies: string[]) {
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

  return { result, displaySetName, displaySetNumber, companies, subGrades };
}

function LogoHeader({ fontSize }: { fontSize: number }) {
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize, color: "#FFFFFF" }}>Grade</Text>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize, color: "#FF3C31" }}>.</Text>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize, color: "#FFFFFF" }}>IQ</Text>
      </View>
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: Math.round(fontSize * 0.4), color: "#666666", marginTop: 1 }}>
        AI Card Grading
      </Text>
    </View>
  );
}

function SquareCard({ grading, enabledCompanies, onImageLoad }: ShareCardProps & { onImageLoad?: () => void }) {
  const { result, displaySetName, displaySetNumber, companies, subGrades } = useCardData(grading, enabledCompanies);
  return (
    <View style={{ width: 380, height: 380, backgroundColor: "#0A0A0A", padding: 24, justifyContent: "space-between" }}>
      <LogoHeader fontSize={22} />
      <View style={{ flexDirection: "row", gap: 14 }}>
        <View style={{ width: 90, height: 126, borderRadius: 8, overflow: "hidden", backgroundColor: "#1A1A1A" }}>
          <RNImage source={{ uri: grading.frontImage }} style={{ width: 90, height: 126 }} resizeMode="cover" onLoad={onImageLoad} />
        </View>
        <View style={{ flex: 1, justifyContent: "center", gap: 4 }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 17, color: "#FFFFFF", lineHeight: 22 }} numberOfLines={2}>{result.cardName || "Pokemon Card"}</Text>
          {displaySetName ? <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#A0A0A0" }} numberOfLines={1}>{displaySetName}</Text> : null}
          {displaySetNumber ? <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#666666" }}>{displaySetNumber}</Text> : null}
        </View>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
        {companies.map((c) => (
          <View key={c.key} style={{ alignItems: "center", gap: 3 }}>
            <CompanyLabel company={c.key} fontSize={14} fontFamily="Inter_600SemiBold" />
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: getGradientColor(c.grade) }}>
              {c.grade % 1 === 0 ? c.grade.toString() : c.grade.toFixed(1)}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ height: 1, backgroundColor: "#2A2A2A" }} />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {subGrades.map((s) => (
          <View key={s.name} style={{ alignItems: "center", gap: 2 }}>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "#666666" }}>{s.name}</Text>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: getGradientColor(s.grade) }}>{s.grade}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: "#2A2A2A" }} />
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: "#666666" }}>Graded with Grade.IQ</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: "#2A2A2A" }} />
      </View>
    </View>
  );
}

function StoryCard({ grading, enabledCompanies, onImageLoad }: ShareCardProps & { onImageLoad?: () => void }) {
  const { result, displaySetName, displaySetNumber, companies, subGrades } = useCardData(grading, enabledCompanies);
  return (
    <View style={{ width: 360, height: 640, backgroundColor: "#0A0A0A", padding: 30, justifyContent: "space-between", alignItems: "center" }}>
      <LogoHeader fontSize={32} />
      <View style={{ width: 200, height: 280, borderRadius: 12, overflow: "hidden", backgroundColor: "#1A1A1A" }}>
        <RNImage source={{ uri: grading.frontImage }} style={{ width: 200, height: 280 }} resizeMode="contain" onLoad={onImageLoad} />
      </View>
      <View style={{ alignItems: "center", gap: 6, width: "100%" }}>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#FFFFFF", textAlign: "center", lineHeight: 28 }} numberOfLines={2}>{result.cardName || "Pokemon Card"}</Text>
        {displaySetName ? <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: "#A0A0A0", textAlign: "center" }} numberOfLines={1}>{displaySetName}</Text> : null}
        {displaySetNumber ? <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#666666" }}>{displaySetNumber}</Text> : null}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-around", width: "100%" }}>
        {companies.map((c) => (
          <View key={c.key} style={{ alignItems: "center", gap: 4 }}>
            <CompanyLabel company={c.key} fontSize={16} fontFamily="Inter_600SemiBold" />
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 28, color: getGradientColor(c.grade) }}>
              {c.grade % 1 === 0 ? c.grade.toString() : c.grade.toFixed(1)}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ height: 1, backgroundColor: "#2A2A2A", width: "100%" }} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", width: "100%" }}>
        {subGrades.map((s) => (
          <View key={s.name} style={{ alignItems: "center", gap: 3 }}>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#666666" }}>{s.name}</Text>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: getGradientColor(s.grade) }}>{s.grade}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, width: "100%" }}>
        <View style={{ flex: 1, height: 1, backgroundColor: "#2A2A2A" }} />
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: "#666666" }}>Graded with Grade.IQ</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: "#2A2A2A" }} />
      </View>
    </View>
  );
}

function WideCard({ grading, enabledCompanies, onImageLoad }: ShareCardProps & { onImageLoad?: () => void }) {
  const { result, displaySetName, displaySetNumber, companies, subGrades } = useCardData(grading, enabledCompanies);
  return (
    <View style={{ width: 600, height: 315, backgroundColor: "#0A0A0A", flexDirection: "row" }}>
      <View style={{ width: 210, height: 315, padding: 20, justifyContent: "center", alignItems: "center" }}>
        <View style={{ width: 170, height: 238, borderRadius: 10, overflow: "hidden", backgroundColor: "#1A1A1A" }}>
          <RNImage source={{ uri: grading.frontImage }} style={{ width: 170, height: 238 }} resizeMode="cover" onLoad={onImageLoad} />
        </View>
      </View>
      <View style={{ flex: 1, padding: 20, paddingLeft: 0, justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFFFFF" }}>Grade</Text>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#FF3C31" }}>.</Text>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#FFFFFF" }}>IQ</Text>
        </View>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF", lineHeight: 20 }} numberOfLines={2}>{result.cardName || "Pokemon Card"}</Text>
        {displaySetName ? <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "#A0A0A0" }} numberOfLines={1}>{displaySetName}</Text> : null}
        <View style={{ flexDirection: "row", justifyContent: "flex-start", gap: 16 }}>
          {companies.map((c) => (
            <View key={c.key} style={{ alignItems: "center", gap: 2 }}>
              <CompanyLabel company={c.key} fontSize={11} fontFamily="Inter_600SemiBold" />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: getGradientColor(c.grade) }}>
                {c.grade % 1 === 0 ? c.grade.toString() : c.grade.toFixed(1)}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ height: 1, backgroundColor: "#2A2A2A" }} />
        <View style={{ flexDirection: "row", gap: 16 }}>
          {subGrades.map((s) => (
            <View key={s.name} style={{ alignItems: "center", gap: 1 }}>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: "#666666" }}>{s.name}</Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: getGradientColor(s.grade) }}>{s.grade}</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: "#666666" }}>Graded with Grade.IQ</Text>
      </View>
    </View>
  );
}

export default function ShareButton({ grading, enabledCompanies }: ShareCardProps) {
  const captureViewRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [activeFormat, setActiveFormat] = useState<ShareFormat | null>(null);
  const imageLoadedRef = useRef(false);
  const pendingCaptureRef = useRef<ShareFormat | null>(null);

  const doCapture = useCallback(async (format: ShareFormat) => {
    if (!captureViewRef.current || sharing) {
      setActiveFormat(null);
      return;
    }
    setSharing(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      const uri = await captureRef(captureViewRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
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
      setActiveFormat(null);
    }
  }, [grading, sharing]);

  const onCardImageLoaded = useCallback(() => {
    imageLoadedRef.current = true;
    if (pendingCaptureRef.current) {
      const fmt = pendingCaptureRef.current;
      pendingCaptureRef.current = null;
      setTimeout(() => doCapture(fmt), 150);
    }
  }, [doCapture]);

  const handleFormatSelected = useCallback((format: ShareFormat) => {
    imageLoadedRef.current = false;
    pendingCaptureRef.current = format;
    setActiveFormat(format);
    setShowPicker(false);
    setTimeout(() => {
      if (!imageLoadedRef.current) {
        pendingCaptureRef.current = null;
        doCapture(format);
      }
    }, 2000);
  }, [doCapture]);

  const renderActiveCard = () => {
    if (!activeFormat) return null;
    const props = { grading, enabledCompanies, onImageLoad: onCardImageLoaded };
    switch (activeFormat) {
      case "instagram_post": return <SquareCard {...props} />;
      case "instagram_story": return <StoryCard {...props} />;
      case "twitter": return <WideCard {...props} />;
    }
  };

  return (
    <>
      {activeFormat && (
        <View style={styles.offscreen} pointerEvents="none">
          <View ref={captureViewRef} collapsable={false}>
            {renderActiveCard()}
          </View>
        </View>
      )}

      <Pressable
        onPress={() => setShowPicker(true)}
        style={({ pressed }) => [styles.shareBtn, { opacity: pressed ? 0.8 : 1 }]}
        disabled={sharing}
      >
        {sharing ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="share-outline" size={18} color="#FFFFFF" />
            <Text style={styles.shareBtnText}>Share Results</Text>
          </>
        )}
      </Pressable>

      <Modal
        visible={showPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPicker(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowPicker(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.title}>Choose Format</Text>
            <Text style={styles.desc}>Pick the right size for where you're posting</Text>

            <View style={styles.options}>
              {FORMATS.map((format) => (
                <Pressable
                  key={format.key}
                  style={({ pressed }) => [styles.option, { opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => handleFormatSelected(format.key)}
                >
                  <View style={styles.optionIcon}>
                    <Ionicons name={format.icon as any} size={24} color="#FFFFFF" />
                  </View>
                  <View style={styles.optionInfo}>
                    <Text style={styles.optionLabel}>{format.label}</Text>
                    <Text style={styles.optionSize}>{format.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#555" />
                </Pressable>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [styles.cancelBtn, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => setShowPicker(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  offscreen: {
    position: "absolute",
    left: -9999,
    top: -9999,
    opacity: 1,
  },
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
