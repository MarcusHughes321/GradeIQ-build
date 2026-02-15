import React, { useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Platform, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import CompanyLabel from "@/components/CompanyLabel";
import type { GradingResult, SavedGrading } from "@/lib/types";

interface ShareCardProps {
  grading: SavedGrading;
  enabledCompanies: string[];
}

function getGradientColor(grade: number): string {
  const ratio = Math.max(0, Math.min(1, (grade - 1) / 9));
  if (ratio <= 0.5) {
    const t = ratio * 2;
    const r = Math.round(239 + (245 - 239) * t);
    const g = Math.round(68 + (158 - 68) * t);
    const b = Math.round(68 + (11 - 68) * t);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const t = (ratio - 0.5) * 2;
    const r = Math.round(245 + (16 - 245) * t);
    const g = Math.round(158 + (185 - 158) * t);
    const b = Math.round(11 + (129 - 11) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function ShareCardContent({ grading, enabledCompanies }: ShareCardProps) {
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
    <View style={styles.shareCard}>
      <View style={styles.shareHeader}>
        <View style={styles.logoRow}>
          <Text style={styles.logoText}>Grade</Text>
          <Text style={styles.logoDot}>.</Text>
          <Text style={styles.logoIQ}>IQ</Text>
        </View>
        <Text style={styles.shareSubtitle}>AI Card Grading</Text>
      </View>

      <View style={styles.shareBody}>
        <View style={styles.shareCardPreview}>
          <Image
            source={{ uri: grading.frontImage }}
            style={styles.shareCardImage}
            contentFit="cover"
          />
        </View>

        <View style={styles.shareCardInfo}>
          <Text style={styles.shareCardName} numberOfLines={2}>
            {result.cardName || "Pokemon Card"}
          </Text>
          {displaySetName ? (
            <Text style={styles.shareSetName} numberOfLines={1}>{displaySetName}</Text>
          ) : null}
          {displaySetNumber ? (
            <Text style={styles.shareSetNumber}>{displaySetNumber}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.shareGrades}>
        {companies.map((c, i) => (
          <View key={c.key} style={styles.shareGradeItem}>
            <CompanyLabel company={c.key} fontSize={13} fontFamily="Inter_600SemiBold" />
            <Text style={[styles.shareGradeValue, { color: getGradientColor(c.grade) }]}>
              {c.grade % 1 === 0 ? c.grade.toString() : c.grade.toFixed(1)}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.shareDivider} />

      <View style={styles.shareSubGrades}>
        {subGrades.map((s) => (
          <View key={s.name} style={styles.shareSubItem}>
            <Text style={styles.shareSubLabel}>{s.name}</Text>
            <Text style={[styles.shareSubValue, { color: getGradientColor(s.grade) }]}>
              {s.grade}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.shareFooter}>
        <View style={styles.shareFooterLine} />
        <Text style={styles.shareFooterText}>Graded with Grade.IQ</Text>
        <View style={styles.shareFooterLine} />
      </View>
    </View>
  );
}

export default function ShareButton({ grading, enabledCompanies }: ShareCardProps) {
  const viewRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    if (!viewRef.current || sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(viewRef, {
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
        link.download = `GradeIQ_${grading.result.cardName?.replace(/\s+/g, "_") || "card"}.png`;
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
  };

  return (
    <>
      <View style={styles.offscreen} pointerEvents="none">
        <View ref={viewRef} collapsable={false}>
          <ShareCardContent grading={grading} enabledCompanies={enabledCompanies} />
        </View>
      </View>

      <Pressable
        onPress={handleShare}
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
  shareCard: {
    width: 380,
    backgroundColor: "#0A0A0A",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  shareHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  logoText: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: "#FFFFFF",
  },
  logoDot: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: "#FF3C31",
  },
  logoIQ: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: "#FFFFFF",
  },
  shareSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#666666",
    marginTop: 2,
  },
  shareBody: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 20,
  },
  shareCardPreview: {
    width: 110,
    height: 154,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#1A1A1A",
  },
  shareCardImage: {
    width: "100%",
    height: "100%",
  },
  shareCardInfo: {
    flex: 1,
    justifyContent: "center",
    gap: 6,
  },
  shareCardName: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: "#FFFFFF",
    lineHeight: 26,
  },
  shareSetName: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#A0A0A0",
  },
  shareSetNumber: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#666666",
  },
  shareGrades: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
  },
  shareGradeItem: {
    alignItems: "center",
    gap: 4,
  },
  shareGradeValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
  },
  shareDivider: {
    height: 1,
    backgroundColor: "#2A2A2A",
    marginBottom: 14,
  },
  shareSubGrades: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  shareSubItem: {
    alignItems: "center",
    gap: 2,
  },
  shareSubLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#666666",
  },
  shareSubValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  shareFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  shareFooterLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#2A2A2A",
  },
  shareFooterText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: "#666666",
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
});
