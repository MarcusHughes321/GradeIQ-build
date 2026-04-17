import React, { useState, useRef, useCallback } from "react";
import * as ImageManipulator from "expo-image-manipulator";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Platform,
  Animated,
  ActivityIndicator,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useSettings } from "@/lib/settings-context";
import { CURRENCIES } from "@/lib/settings";
import { useQuery } from "@tanstack/react-query";
import CardCamera from "@/components/CardCamera";

const FALLBACK_RATES: Record<string, number> = { USD: 1, GBP: 0.79, EUR: 0.93, AUD: 1.55, CAD: 1.36, JPY: 151.6 };

const MAX_CARDS = 100;
const DEVICE_ID_KEY = "gradeiq_device_id";

interface CardSlot {
  id: string;
  frontImage: string | null;
  backImage: string | null;
}

interface PastScan {
  jobId: string;
  status: string;
  totalCards: number;
  doneCards: number;
  totalNMUsd: number;
  totalConditionUsd: number;
  conditionCounts: Record<string, number>;
  createdAt: string;
}

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 5);
}

function formatScanDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: diffDays > 365 ? "numeric" : undefined });
}

async function getOrCreateDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const newId = generateId() + generateId();
    await AsyncStorage.setItem(DEVICE_ID_KEY, newId);
    return newId;
  } catch {
    return generateId();
  }
}

const SCAN_STAGES = [
  { label: "Preparing images", icon: "image-outline" as const },
  { label: "Identifying cards", icon: "scan-outline" as const },
  { label: "Assessing condition", icon: "eye-outline" as const },
  { label: "Looking up values", icon: "pricetag-outline" as const },
  { label: "Building report", icon: "document-text-outline" as const },
];

export default function CollectionScanScreen() {
  const insets = useSafeAreaInsets();
  const [cards, setCards] = useState<CardSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalToScan, setTotalToScan] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraSide, setCameraSide] = useState<"front" | "back">("front");
  const [cameraCardIndex, setCameraCardIndex] = useState(0);
  const cameraFrontRef = useRef<string | null>(null);

  const [pastScans, setPastScans] = useState<PastScan[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const { settings } = useSettings();
  const currency = settings.currency ?? "USD";
  const currencyDef = CURRENCIES.find((c) => c.code === currency) ?? CURRENCIES[0];
  const currencySymbol = currencyDef.symbol;
  const { data: ratesData } = useQuery<Record<string, number>>({
    queryKey: ["/api/exchange-rates"],
    staleTime: 5 * 60 * 1000,
  });
  const rates = ratesData ?? {};
  const usdRate = rates["USD"] ?? 1;
  const currencyRate = currency === "USD" ? 1 : (rates[currency] ?? FALLBACK_RATES[currency] ?? 1) / usdRate;

  const fmtScanPrice = (usd: number) => {
    const local = usd * currencyRate;
    return currencySymbol === "¥" ? `${currencySymbol}${Math.round(local)}` : `${currencySymbol}${local.toFixed(2)}`;
  };

  const fetchPastScans = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const deviceId = await getOrCreateDeviceId();
      const base = getApiUrl();
      const url = new URL("/api/collection/jobs", base);
      url.searchParams.set("deviceId", deviceId);
      const resp = await fetch(url.toString());
      if (resp.ok) {
        const data = await resp.json();
        setPastScans(data.jobs ?? []);
      }
    } catch {}
    finally { setLoadingHistory(false); }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPastScans();
    }, [fetchPastScans])
  );

  const deletePastScan = async (jobId: string) => {
    Alert.alert("Delete Scan", "Remove this scan from your history?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            const deviceId = await getOrCreateDeviceId();
            const base = getApiUrl();
            const url = new URL(`/api/collection/job/${jobId}`, base);
            url.searchParams.set("deviceId", deviceId);
            await fetch(url.toString(), { method: "DELETE" });
            setPastScans((prev) => prev.filter((s) => s.jobId !== jobId));
          } catch {}
        }
      }
    ]);
  };

  const readyCards = cards.filter((c) => c.frontImage && c.backImage);
  const hasPartialCard = cameraSide === "back"; // mid-scan, front captured, back pending

  const startCamera = () => {
    if (Platform.OS === "web") {
      Alert.alert("Not Available on Web", "Use the gallery import button on web.");
      return;
    }
    const nextIdx = cards.length;
    setCameraCardIndex(nextIdx);
    setCameraSide("front");
    cameraFrontRef.current = null;
    setCameraActive(true);
  };

  const handleCameraCapture = (uri: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (cameraSide === "front") {
      cameraFrontRef.current = uri;
      setCameraSide("back");
    } else {
      const front = cameraFrontRef.current!;
      const back = uri;
      const newSlotId = generateId();
      setCards((prev) => {
        if (prev.length >= MAX_CARDS) return prev;
        return [...prev, { id: newSlotId, frontImage: front, backImage: back }];
      });
      // Advance to next card
      const nextIdx = cameraCardIndex + 1;
      setCameraCardIndex(nextIdx);
      setCameraSide("front");
      cameraFrontRef.current = null;
    }
  };

  const handleCameraClose = () => {
    // If we were mid-card (front captured, back not yet), discard the partial
    cameraFrontRef.current = null;
    setCameraActive(false);
    setCameraSide("front");
  };

  const selectFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Photo library access is needed.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: MAX_CARDS * 2,
      quality: 0.8,
      orderedSelection: true,
    });
    if (!result.canceled && result.assets.length > 0) {
      const newSlots: CardSlot[] = [];
      for (let i = 0; i < result.assets.length; i += 2) {
        newSlots.push({
          id: generateId(),
          frontImage: result.assets[i]?.uri ?? null,
          backImage: result.assets[i + 1]?.uri ?? null,
        });
      }
      setCards((prev) => [...prev, ...newSlots].slice(0, MAX_CARDS));
    }
  };

  const removeCard = (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  };

  const clearAll = () => {
    Alert.alert("Clear All Cards", "Start over with an empty session?", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: () => setCards([]) },
    ]);
  };

  const animateProgress = (to: number) => {
    Animated.timing(progressAnim, {
      toValue: to,
      duration: 400,
      useNativeDriver: false,
    }).start();
  };

  const startScan = async () => {
    if (readyCards.length === 0 || loading) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setStageIndex(0);
    setCompletedCount(0);
    setTotalToScan(readyCards.length);
    animateProgress(0);

    try {
      const cardPayloads: { frontBase64: string; backBase64: string }[] = [];
      // On Android, camera images carry EXIF rotation that ImageManipulator does
      // not always apply before a plain resize. Force a rotate(0) first which
      // causes a full decode respecting EXIF, producing correctly-oriented pixels.
      const orientTransforms: ImageManipulator.Action[] =
        Platform.OS === "android" ? [{ rotate: 0 }] : [];
      for (const card of readyCards) {
        const frontResult = await ImageManipulator.manipulateAsync(
          card.frontImage!,
          [...orientTransforms, { resize: { width: 1024 } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        const backResult = await ImageManipulator.manipulateAsync(
          card.backImage!,
          [...orientTransforms, { resize: { width: 1024 } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        cardPayloads.push({
          frontBase64: `data:image/jpeg;base64,${frontResult.base64}`,
          backBase64: `data:image/jpeg;base64,${backResult.base64}`,
        });
      }

      const deviceId = await getOrCreateDeviceId();
      setStageIndex(1);

      const url = new URL("/api/collection/job", getApiUrl()).toString();
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, cards: cardPayloads }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.jobId) throw new Error(data.error || "Failed to start scan");

      const { jobId, totalCards } = data;
      setTotalToScan(totalCards);
      setStageIndex(2);

      pollingRef.current = setInterval(async () => {
        try {
          const pollUrl = new URL(`/api/collection/job/${jobId}`, getApiUrl()).toString();
          const pollResp = await fetch(pollUrl);
          const pollData = await pollResp.json();
          const completed = pollData.completedCards ?? 0;
          setCompletedCount(completed);
          const progress = totalCards > 0 ? completed / totalCards : 0;
          animateProgress(progress);
          if (progress > 0.4) setStageIndex(3);
          if (progress > 0.8) setStageIndex(4);
          if (pollData.status === "completed") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            animateProgress(1);
            setLoading(false);
            router.replace({ pathname: "/collection-results", params: { jobId } });
          } else if (pollData.status === "failed") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            setLoading(false);
            Alert.alert("Scan Failed", "There was an error scanning your cards.");
          }
        } catch {}
      }, 2500);
    } catch (err: any) {
      setLoading(false);
      Alert.alert("Scan Failed", err.message || "An error occurred. Please try again.");
    }
  };

  // ── Camera View ────────────────────────────────────────────────────────────
  if (cameraActive && Platform.OS !== "web") {
    const cardNum = cards.length + 1;
    const sideLabel = cameraSide === "front"
      ? `Card ${cardNum}  ·  Front Side`
      : `Card ${cardNum}  ·  Back Side`;

    return (
      <View style={styles.container}>
        <CardCamera
          side={cameraSide}
          stepLabel={sideLabel}
          fastMode
          onCapture={handleCameraCapture}
          onClose={handleCameraClose}
        />

        {/* Done / Cancel button pinned above the shutter */}
        <View style={[styles.cameraDoneWrap, { bottom: insets.bottom + 112 }]}>
          <Pressable
            style={({ pressed }) => [styles.cameraDoneBtn, { opacity: pressed ? 0.85 : 1 }]}
            onPress={handleCameraClose}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.cameraDoneBtnText}>
              {cards.length === 0
                ? "Cancel"
                : `Done  ·  ${cards.length} card${cards.length !== 1 ? "s" : ""} captured`}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Loading View ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.header}>
          <View style={{ width: 40 }} />
          <Text style={styles.headerTitle}>Scanning Collection</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <View style={styles.loadingCard}>
            <View style={styles.loadingIconWrap}>
              <View style={styles.loadingIconBg}>
                <Ionicons name="library-outline" size={32} color="#3B82F6" />
              </View>
              <ActivityIndicator color="#3B82F6" size="small" style={styles.loadingSpinner} />
            </View>
            <Text style={styles.loadingTitle}>Analysing cards…</Text>
            <Text style={styles.loadingSubtitle}>
              {completedCount > 0
                ? `${completedCount} of ${totalToScan} cards done`
                : `Getting ${totalToScan} card${totalToScan !== 1 ? "s" : ""} ready…`}
            </Text>
            <View style={styles.progressBarBg}>
              <Animated.View
                style={[
                  styles.progressBarFill,
                  { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
                ]}
              />
            </View>
            <View style={styles.stagesList}>
              {SCAN_STAGES.map((stage, i) => (
                <View key={i} style={styles.stageRow}>
                  <Ionicons
                    name={i < stageIndex ? "checkmark-circle" : i === stageIndex ? stage.icon : "ellipse-outline"}
                    size={16}
                    color={i < stageIndex ? "#10B981" : i === stageIndex ? "#3B82F6" : Colors.textMuted}
                  />
                  <Text style={[styles.stageLabel, i === stageIndex && styles.stageLabelActive, i < stageIndex && styles.stageLabelDone]}>
                    {stage.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ── Main View ──────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Collection Scan</Text>
        {cards.length > 0 ? (
          <Pressable onPress={clearAll} style={({ pressed }) => [styles.headerAction, { opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="trash-outline" size={18} color={Colors.primary} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {cards.length === 0 ? (
        // ── Empty state ──
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.emptyWrap}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.emptyIconWrap}>
            <Ionicons name="library-outline" size={40} color="#3B82F6" />
          </View>
          <Text style={styles.emptyTitle}>Collection Scan</Text>
          <Text style={styles.emptyDesc}>
            Photograph the front and back of each card. We'll identify each one, check its condition, and build a priced CSV report for your records or a seller.
          </Text>
          <View style={styles.conditionLegend}>
            {["Mint", "Near Mint", "Light Played", "Played", "Heavy Played", "Damaged"].map((c) => (
              <View key={c} style={styles.condLegItem}>
                <View style={[styles.condLegDot, { backgroundColor: CONDITION_COLORS[c] }]} />
                <Text style={styles.condLegText}>{c}</Text>
              </View>
            ))}
          </View>
          <Pressable
            style={({ pressed }) => [styles.startBtn, { opacity: pressed ? 0.85 : 1 }]}
            onPress={startCamera}
          >
            <Ionicons name="camera-outline" size={20} color="#fff" />
            <Text style={styles.startBtnText}>Start Scanning</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.galleryBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={selectFromGallery}
          >
            <Ionicons name="images-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.galleryBtnText}>Import from gallery instead</Text>
          </Pressable>

          {/* ── Recent Scans ── */}
          {(loadingHistory || pastScans.length > 0) && (
            <View style={styles.historySection}>
              <Text style={styles.historySectionTitle}>Recent Scans</Text>
              {loadingHistory && pastScans.length === 0 ? (
                <ActivityIndicator size="small" color={Colors.textMuted} style={{ marginTop: 12 }} />
              ) : (
                pastScans.map((scan) => (
                  <Pressable
                    key={scan.jobId}
                    style={({ pressed }) => [styles.historyRow, { opacity: pressed ? 0.75 : 1 }]}
                    onPress={() => router.push({ pathname: "/collection-results", params: { jobId: scan.jobId } })}
                    onLongPress={() => deletePastScan(scan.jobId)}
                  >
                    <View style={styles.historyIcon}>
                      <Ionicons name="library-outline" size={18} color="#3B82F6" />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <Text style={styles.historyDate}>{formatScanDate(scan.createdAt)}</Text>
                        <Text style={styles.historyValue}>
                          {fmtScanPrice(scan.totalConditionUsd)}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={styles.historyMeta}>{scan.doneCards} card{scan.doneCards !== 1 ? "s" : ""}</Text>
                        {Object.entries(scan.conditionCounts).slice(0, 3).map(([cond, cnt]) => (
                          <View key={cond} style={[styles.historyCondPill, { backgroundColor: CONDITION_COLORS[cond] + "22" }]}>
                            <View style={[styles.historyCondDot, { backgroundColor: CONDITION_COLORS[cond] ?? "#888" }]} />
                            <Text style={[styles.historyCondText, { color: CONDITION_COLORS[cond] ?? "#888" }]}>{cond.replace("Near Mint", "NM").replace("Light Played", "LP").replace("Heavy Played", "HP")} ×{cnt}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  </Pressable>
                ))
              )}
              {pastScans.length > 0 && (
                <Text style={styles.historyHint}>Long-press a scan to delete it</Text>
              )}
            </View>
          )}
        </ScrollView>
      ) : (
        // ── Cards captured ──
        <>
          <View style={styles.capturedHeader}>
            <Text style={styles.capturedTitle}>
              {readyCards.length} card{readyCards.length !== 1 ? "s" : ""} ready
            </Text>
            {hasPartialCard && (
              <Text style={styles.capturedPartial}>+1 in progress</Text>
            )}
          </View>
          <ScrollView
            style={styles.cardList}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 200 }}
            showsVerticalScrollIndicator={false}
          >
            {cards.map((card, idx) => (
              <View key={card.id} style={styles.cardRow}>
                <View style={styles.cardRowIndex}>
                  <Text style={styles.cardRowIndexText}>{idx + 1}</Text>
                </View>
                <Image source={{ uri: card.frontImage! }} style={styles.cardThumb} contentFit="cover" />
                <Image source={{ uri: card.backImage! }} style={styles.cardThumb} contentFit="cover" />
                <View style={styles.cardRowReady}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                  <Text style={styles.cardRowReadyText}>Front & Back</Text>
                </View>
                <Pressable
                  onPress={() => removeCard(card.id)}
                  style={({ pressed }) => [styles.removeBtn, { opacity: pressed ? 0.5 : 1 }]}
                  hitSlop={10}
                >
                  <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </ScrollView>

          {/* Bottom bar */}
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              style={({ pressed }) => [styles.scanMoreBtn, { opacity: pressed ? 0.7 : 1 }]}
              onPress={startCamera}
            >
              <Ionicons name="camera-outline" size={18} color={Colors.text} />
              <Text style={styles.scanMoreBtnText}>Scan More</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.analyseBtn, { opacity: pressed ? 0.85 : 1 }]}
              onPress={startScan}
              disabled={readyCards.length === 0}
            >
              <Ionicons name="library-outline" size={18} color="#fff" />
              <Text style={styles.analyseBtnText}>
                Analyse {readyCards.length} Card{readyCards.length !== 1 ? "s" : ""}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const CONDITION_COLORS: Record<string, string> = {
  "Mint": "#10B981",
  "Near Mint": "#3B82F6",
  "Light Played": "#F59E0B",
  "Played": "#F97316",
  "Heavy Played": "#EF4444",
  "Damaged": "#9CA3AF",
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: { width: 40, alignItems: "flex-start" },
  headerTitle: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: Colors.text,
    textAlign: "center",
  },
  headerAction: { width: 40, alignItems: "flex-end" },

  // Empty state
  emptyWrap: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 32,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(59,130,246,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  emptyDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 21,
  },
  conditionLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  condLegItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  condLegDot: { width: 8, height: 8, borderRadius: 4 },
  condLegText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textMuted },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#3B82F6",
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 14,
    width: "100%",
    marginTop: 4,
  },
  startBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  galleryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 8,
  },
  galleryBtnText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },

  // Captured cards list
  capturedHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    gap: 8,
  },
  capturedTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  capturedPartial: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#F59E0B" },
  cardList: { flex: 1 },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 10,
    gap: 10,
  },
  cardRowIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardRowIndexText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: Colors.textMuted },
  cardThumb: {
    width: 44,
    height: 62,
    borderRadius: 5,
    backgroundColor: Colors.surfaceLight,
  },
  cardRowReady: { flex: 1, flexDirection: "row", alignItems: "center", gap: 5 },
  cardRowReadyText: { fontFamily: "Inter_500Medium", fontSize: 12, color: "#10B981" },
  removeBtn: { padding: 4 },

  // Bottom bar
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 10,
    padding: 16,
    paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  scanMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  scanMoreBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  analyseBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#3B82F6",
  },
  analyseBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" },

  // Camera overlay UI
  cameraDoneWrap: {
    position: "absolute",
    left: 24,
    right: 24,
    alignItems: "center",
    zIndex: 20,
  },
  cameraDoneBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.3)",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 30,
  },
  cameraDoneBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },

  // Loading
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 28,
    width: "100%",
    alignItems: "center",
    gap: 16,
  },
  loadingIconWrap: { position: "relative", marginBottom: 4 },
  loadingIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(59,130,246,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingSpinner: { position: "absolute", bottom: -4, right: -4 },
  loadingTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text },
  loadingSubtitle: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center" },
  progressBarBg: {
    width: "100%",
    height: 6,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: { height: "100%", backgroundColor: "#3B82F6", borderRadius: 3 },
  stagesList: { width: "100%", gap: 10, marginTop: 4 },
  stageRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stageLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textMuted },
  stageLabelActive: { color: Colors.text, fontFamily: "Inter_500Medium" },
  stageLabelDone: { color: "#10B981" },

  // History section
  historySection: {
    width: "100%",
    marginTop: 8,
    gap: 6,
  },
  historySectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 14,
    padding: 14,
  },
  historyIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(59,130,246,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  historyDate: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  historyValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#3B82F6",
  },
  historyMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  historyCondPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  historyCondDot: { width: 5, height: 5, borderRadius: 3 },
  historyCondText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  historyHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 2,
  },
});
