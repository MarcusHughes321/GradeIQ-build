import React, { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  ActivityIndicator,
  Image as RNImage,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import CompanyLabel from "@/components/CompanyLabel";
import type { SavedGrading, CardValueEstimate, CenteringMeasurement } from "@/lib/types";

interface ShareCardProps {
  grading: SavedGrading;
  enabledCompanies: string[];
  cardValue?: CardValueEstimate | null;
  showMarketData?: boolean;
}

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

function formatGrade(grade: number): string {
  return grade % 1 === 0 ? grade.toString() : grade.toFixed(1);
}

function normVal(v: number): number {
  return Math.max(v, 100 - v);
}

function formatRatio(value: number): string {
  const norm = normVal(value);
  const other = 100 - norm;
  return `${norm}/${other}`;
}

function getCenteringColor(value: number): string {
  const norm = normVal(value);
  if (norm <= 52) return "#10B981";
  if (norm <= 55) return "#34D399";
  if (norm <= 60) return "#F59E0B";
  if (norm <= 65) return "#FB923C";
  return "#EF4444";
}

function ShareCardContent({ grading, enabledCompanies, cardValue, showMarketData, onFrontLoad, onBackLoad }: ShareCardProps & { onFrontLoad?: () => void; onBackLoad?: () => void }) {
  const { result } = grading;

  const companies: { key: string; grade: number; value?: string }[] = [];
  if (enabledCompanies.includes("PSA")) companies.push({ key: "PSA", grade: result.psa.grade, value: cardValue?.psaValue });
  if (enabledCompanies.includes("Beckett")) companies.push({ key: "BGS", grade: result.beckett.overallGrade, value: cardValue?.bgsValue });
  if (enabledCompanies.includes("Ace")) companies.push({ key: "ACE", grade: result.ace.overallGrade, value: cardValue?.aceValue });
  if (enabledCompanies.includes("TAG") && result.tag) companies.push({ key: "TAG", grade: result.tag.overallGrade, value: cardValue?.tagValue });
  if (enabledCompanies.includes("CGC") && result.cgc) companies.push({ key: "CGC", grade: result.cgc.grade, value: cardValue?.cgcValue });

  const rawValue = cardValue?.rawValue;
  const hasValues = showMarketData && cardValue && companies.some(c => c.value && !c.value.includes("No value"));

  return (
    <View style={{ width: 300, backgroundColor: "#0A0A0A", padding: 18, alignItems: "center" }}>
      <View style={{ alignItems: "center", marginTop: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: "#FFFFFF" }}>Grade</Text>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: "#FF3C31" }}>.IQ</Text>
        </View>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: "#777", marginTop: 2, letterSpacing: 0.5 }}>
          Built for the community, by the community
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginTop: 14, width: "100%" }}>
        <View style={{ flex: 1, aspectRatio: 0.714, borderRadius: 8, overflow: "hidden", backgroundColor: "#1A1A1A" }}>
          <RNImage source={{ uri: grading.frontImage || grading.frontImageUrl || "" }} style={{ width: "100%", height: "100%" }} resizeMode="cover" onLoad={onFrontLoad} />
        </View>
        <View style={{ flex: 1, aspectRatio: 0.714, borderRadius: 8, overflow: "hidden", backgroundColor: "#1A1A1A" }}>
          <RNImage source={{ uri: grading.backImage || grading.backImageUrl || "" }} style={{ width: "100%", height: "100%" }} resizeMode="cover" onLoad={onBackLoad} />
        </View>
      </View>

      <View style={{ width: "100%", marginTop: 12 }}>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#FFFFFF", textAlign: "center" }} numberOfLines={1}>
          {result.cardName || "Pokemon Card"}
        </Text>
        {(result.setName || result.setInfo) ? (
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: "#888", textAlign: "center", marginTop: 2 }} numberOfLines={1}>
            {result.setName || result.setInfo}{result.setNumber ? ` - ${result.setNumber}` : ""}
          </Text>
        ) : null}
        {rawValue && !rawValue.includes("No value") ? (
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#999", textAlign: "center", marginTop: 3 }}>
            Raw: {rawValue}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-around", width: "100%", marginTop: 10, backgroundColor: "#111111", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 6 }}>
        {companies.map((c) => (
          <View key={c.key} style={{ alignItems: "center", gap: 2 }}>
            <CompanyLabel company={c.key} fontSize={9} fontFamily="Inter_600SemiBold" />
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: getGradientColor(c.grade) }}>
              {formatGrade(c.grade)}
            </Text>
            {c.value && !c.value.includes("No value") ? (
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 7, color: "#888", marginTop: 1 }} numberOfLines={1}>
                {c.value}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      {result.centering ? (
        <View style={{ width: "100%", marginTop: 6, backgroundColor: "#111111", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 8, color: "#555", marginBottom: 4 }}>Centering</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 8, color: "#777" }}>Front</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 8, color: "#666" }}>L/R</Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: getCenteringColor(result.centering.frontLeftRight) }}>
                  {formatRatio(result.centering.frontLeftRight)}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 8, color: "#666" }}>T/B</Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: getCenteringColor(result.centering.frontTopBottom) }}>
                  {formatRatio(result.centering.frontTopBottom)}
                </Text>
              </View>
            </View>
            <View style={{ width: 1, backgroundColor: "#2A2A2A", marginHorizontal: 10 }} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 8, color: "#777" }}>Back</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 8, color: "#666" }}>L/R</Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: getCenteringColor(result.centering.backLeftRight) }}>
                  {formatRatio(result.centering.backLeftRight)}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 8, color: "#666" }}>T/B</Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: getCenteringColor(result.centering.backTopBottom) }}>
                  {formatRatio(result.centering.backTopBottom)}
                </Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8, width: "100%" }}>
        <View style={{ flex: 1, height: 1, backgroundColor: "#2A2A2A" }} />
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: "#555" }}>gradeiq.app</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: "#2A2A2A" }} />
      </View>
    </View>
  );
}

export default function ShareButton({ grading, enabledCompanies, cardValue, showMarketData }: ShareCardProps) {
  const captureViewRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [ready, setReady] = useState(false);
  const sharingRef = useRef(false);
  const imagesLoadedRef = useRef({ front: false, back: false });

  const doCapture = useCallback(async () => {
    if (!captureViewRef.current || sharingRef.current) return;
    sharingRef.current = true;
    setSharing(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 300));
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
        link.download = `GradeIQ_${grading.result.cardName?.replace(/\s+/g, "_") || "card"}.png`;
        link.click();
      } else {
        Alert.alert("Sharing not available", "Sharing is not supported on this device.");
      }
    } catch (err) {
      console.error("Share error:", err);
      Alert.alert("Error", "Failed to create share image. Please try again.");
    } finally {
      sharingRef.current = false;
      setSharing(false);
      setReady(false);
    }
  }, [grading]);

  const checkBothLoaded = useCallback(() => {
    if (imagesLoadedRef.current.front && imagesLoadedRef.current.back) {
      setTimeout(() => doCapture(), 300);
    }
  }, [doCapture]);

  const handleShare = useCallback(() => {
    if (sharingRef.current) return;
    imagesLoadedRef.current = { front: false, back: false };
    setReady(true);
    setTimeout(() => {
      if (!imagesLoadedRef.current.front || !imagesLoadedRef.current.back) {
        doCapture();
      }
    }, 2500);
  }, [doCapture]);

  const onFrontLoad = useCallback(() => {
    imagesLoadedRef.current.front = true;
    checkBothLoaded();
  }, [checkBothLoaded]);

  const onBackLoad = useCallback(() => {
    imagesLoadedRef.current.back = true;
    checkBothLoaded();
  }, [checkBothLoaded]);

  return (
    <>
      {ready && (
        <View style={styles.offscreen} pointerEvents="none">
          <View ref={captureViewRef} collapsable={false}>
            <ShareCardContent
              grading={grading}
              enabledCompanies={enabledCompanies}
              cardValue={cardValue}
              showMarketData={showMarketData}
              onFrontLoad={onFrontLoad}
              onBackLoad={onBackLoad}
            />
          </View>
        </View>
      )}

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
    position: "absolute" as const,
    left: -9999,
    top: -9999,
    opacity: 1,
  },
  shareBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
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
