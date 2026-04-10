import React, { useState, useRef } from "react";
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
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import CardCamera from "@/components/CardCamera";

const MAX_CARDS = 100;
const DEVICE_ID_KEY = "gradeiq_device_id";

interface CardSlot {
  id: string;
  frontImage: string | null;
  backImage: string | null;
}

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 5);
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

  const [bulkCameraActive, setBulkCameraActive] = useState(false);
  const [bulkCameraSide, setBulkCameraSide] = useState<"front" | "back">("front");
  const [bulkCameraCardIndex, setBulkCameraCardIndex] = useState(0);
  const bulkCameraFrontRef = useRef<string | null>(null);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const readyCards = cards.filter((c) => c.frontImage && c.backImage);

  const selectMultipleImages = async () => {
    if (loading) return;
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
        const slot: CardSlot = {
          id: generateId(),
          frontImage: result.assets[i]?.uri ?? null,
          backImage: result.assets[i + 1]?.uri ?? null,
        };
        newSlots.push(slot);
      }
      setCards((prev) => {
        const combined = [...prev, ...newSlots];
        return combined.slice(0, MAX_CARDS);
      });
    }
  };

  const addEmptyCard = () => {
    if (cards.length >= MAX_CARDS || loading) return;
    setCards((prev) => [...prev, { id: generateId(), frontImage: null, backImage: null }]);
  };

  const removeCard = (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  };

  const clearAll = () => {
    Alert.alert("Clear All", "Remove all cards from this session?", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: () => setCards([]) },
    ]);
  };

  const startBulkCamera = () => {
    if (Platform.OS === "web") {
      Alert.alert("Not Available", "Camera scanning is only available on mobile.");
      return;
    }
    setBulkCameraCardIndex(0);
    setBulkCameraSide("front");
    bulkCameraFrontRef.current = null;
    setBulkCameraActive(true);
  };

  const handleBulkCameraCapture = (uri: string) => {
    if (bulkCameraSide === "front") {
      bulkCameraFrontRef.current = uri;
      setBulkCameraSide("back");
    } else {
      const front = bulkCameraFrontRef.current!;
      const back = uri;
      setCards((prev) => {
        const updated = [...prev];
        const existingIdx = updated.findIndex((c) => c.id === `cam_${bulkCameraCardIndex}`);
        if (existingIdx >= 0) {
          updated[existingIdx] = { ...updated[existingIdx], frontImage: front, backImage: back };
        } else {
          updated.push({ id: `cam_${bulkCameraCardIndex}`, frontImage: front, backImage: back });
        }
        return updated.slice(0, MAX_CARDS);
      });
      const nextIdx = bulkCameraCardIndex + 1;
      setBulkCameraCardIndex(nextIdx);
      setBulkCameraSide("front");
      bulkCameraFrontRef.current = null;
    }
  };

  const handleBulkCameraClose = () => {
    setBulkCameraActive(false);
    bulkCameraFrontRef.current = null;
  };

  const animateProgress = (to: number) => {
    Animated.timing(progressAnim, {
      toValue: to,
      duration: 400,
      useNativeDriver: false,
    }).start();
  };

  const pickImageForSlot = async (cardId: string, side: "front" | "back") => {
    if (Platform.OS === "web") {
      Alert.alert("Not Available", "Use the gallery import button to add images on web.");
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Photo library access is needed.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setCards((prev) =>
        prev.map((c) => c.id === cardId ? { ...c, [side === "front" ? "frontImage" : "backImage"]: uri } : c)
      );
    }
  };

  const startScan = async () => {
    if (readyCards.length === 0 || loading) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setLoading(true);
    setStageIndex(0);
    setCompletedCount(0);
    setTotalToScan(readyCards.length);
    animateProgress(0);

    try {
      // Convert images to base64
      const cardPayloads: { frontBase64: string; backBase64: string }[] = [];
      for (const card of readyCards) {
        const frontResult = await ImageManipulator.manipulateAsync(
          card.frontImage!,
          [{ resize: { width: 1024 } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        const backResult = await ImageManipulator.manipulateAsync(
          card.backImage!,
          [{ resize: { width: 1024 } }],
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
      if (!resp.ok || !data.jobId) {
        throw new Error(data.error || "Failed to start scan");
      }

      const { jobId, totalCards } = data;
      setTotalToScan(totalCards);
      setStageIndex(2);

      // Poll for progress
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
            router.replace({
              pathname: "/collection-results",
              params: { jobId },
            });
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

  if (bulkCameraActive && Platform.OS !== "web") {
    return (
      <View style={styles.container}>
        <CardCamera
          side={bulkCameraSide}
          onCapture={handleBulkCameraCapture}
          onClose={handleBulkCameraClose}
        />
        <View style={[styles.bulkCameraTopRow, { top: insets.top + 145 }]}>
          <View style={styles.bulkCameraBanner}>
            <Text style={styles.bulkCameraBannerText}>
              Card {bulkCameraCardIndex + 1} — {bulkCameraSide === "front" ? "Front" : "Back"}
            </Text>
          </View>
          <Pressable style={styles.bulkCameraDoneBtn} onPress={handleBulkCameraClose}>
            <Text style={styles.bulkCameraDoneBtnText}>Done</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </Pressable>
        </View>
      </View>
    );
  }

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
        <Text style={styles.headerTitle}>Collection Scan</Text>
        {cards.length > 0 && !loading ? (
          <Pressable onPress={clearAll} style={({ pressed }) => [styles.clearBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="trash-outline" size={18} color={Colors.primary} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <View style={styles.loadingCard}>
            <View style={styles.loadingIconWrap}>
              <View style={styles.loadingIconBg}>
                <Ionicons name="library-outline" size={32} color="#3B82F6" />
              </View>
              <ActivityIndicator color="#3B82F6" size="small" style={styles.loadingSpinner} />
            </View>
            <Text style={styles.loadingTitle}>Scanning Collection</Text>
            <Text style={styles.loadingSubtitle}>
              {completedCount > 0
                ? `${completedCount} of ${totalToScan} cards scanned`
                : `Preparing ${totalToScan} card${totalToScan !== 1 ? "s" : ""}…`}
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
      ) : (
        <>
          {/* Status bar */}
          <View style={styles.statusBar}>
            <View style={styles.statusItem}>
              <Text style={styles.statusNum}>{cards.length}</Text>
              <Text style={styles.statusLabel}>Total</Text>
            </View>
            <View style={styles.statusDivider} />
            <View style={styles.statusItem}>
              <Text style={[styles.statusNum, { color: "#10B981" }]}>{readyCards.length}</Text>
              <Text style={styles.statusLabel}>Ready</Text>
            </View>
            <View style={styles.statusDivider} />
            <View style={styles.statusItem}>
              <Text style={[styles.statusNum, { color: "#F59E0B" }]}>{cards.length - readyCards.length}</Text>
              <Text style={styles.statusLabel}>Need Back</Text>
            </View>
          </View>

          {/* Card list */}
          <ScrollView
            style={styles.cardList}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 160 }}
            showsVerticalScrollIndicator={false}
          >
            {cards.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="library-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No cards yet</Text>
                <Text style={styles.emptySub}>Use the camera or import from your gallery below</Text>
              </View>
            ) : (
              cards.map((card, idx) => (
                <View key={card.id} style={styles.cardRow}>
                  <View style={styles.cardRowLeft}>
                    <View style={styles.cardIndex}>
                      <Text style={styles.cardIndexText}>{idx + 1}</Text>
                    </View>
                    <Pressable
                      style={[styles.thumbSlot, card.frontImage && styles.thumbSlotFilled]}
                      onPress={() => pickImageForSlot(card.id, "front")}
                    >
                      {card.frontImage ? (
                        <Image source={{ uri: card.frontImage }} style={styles.thumb} contentFit="cover" />
                      ) : (
                        <View style={styles.thumbEmpty}>
                          <Ionicons name="add" size={16} color={Colors.textMuted} />
                          <Text style={styles.thumbLabel}>Front</Text>
                        </View>
                      )}
                    </Pressable>
                    <Pressable
                      style={[styles.thumbSlot, card.backImage && styles.thumbSlotFilled, !card.frontImage && styles.thumbSlotDisabled]}
                      onPress={() => card.frontImage ? pickImageForSlot(card.id, "back") : null}
                    >
                      {card.backImage ? (
                        <Image source={{ uri: card.backImage }} style={styles.thumb} contentFit="cover" />
                      ) : (
                        <View style={styles.thumbEmpty}>
                          <Ionicons name="add" size={16} color={Colors.textMuted} />
                          <Text style={styles.thumbLabel}>Back</Text>
                        </View>
                      )}
                    </Pressable>
                    {card.frontImage && card.backImage ? (
                      <View style={styles.readyBadge}>
                        <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                      </View>
                    ) : (
                      <View style={styles.pendingBadge}>
                        <Ionicons name="ellipse-outline" size={18} color={Colors.textMuted} />
                      </View>
                    )}
                  </View>
                  <Pressable
                    onPress={() => removeCard(card.id)}
                    style={({ pressed }) => [styles.removeBtn, { opacity: pressed ? 0.5 : 1 }]}
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
                  </Pressable>
                </View>
              ))
            )}

            {cards.length < MAX_CARDS && (
              <Pressable
                style={({ pressed }) => [styles.addCardBtn, { opacity: pressed ? 0.6 : 1 }]}
                onPress={addEmptyCard}
              >
                <Ionicons name="add" size={18} color={Colors.textMuted} />
                <Text style={styles.addCardBtnText}>Add card slot</Text>
              </Pressable>
            )}
          </ScrollView>

          {/* Bottom actions */}
          <View style={[styles.bottomActions, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.bottomRow}>
              <Pressable
                style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
                onPress={startBulkCamera}
              >
                <Ionicons name="camera-outline" size={20} color={Colors.text} />
                <Text style={styles.actionBtnText}>Camera</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
                onPress={selectMultipleImages}
              >
                <Ionicons name="images-outline" size={20} color={Colors.text} />
                <Text style={styles.actionBtnText}>Gallery</Text>
              </Pressable>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.scanBtn,
                readyCards.length === 0 && styles.scanBtnDisabled,
                { opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={startScan}
              disabled={readyCards.length === 0}
            >
              <Ionicons name="library-outline" size={18} color={readyCards.length === 0 ? Colors.textMuted : "#fff"} />
              <Text style={[styles.scanBtnText, readyCards.length === 0 && styles.scanBtnTextDisabled]}>
                {readyCards.length === 0
                  ? "Add cards to scan"
                  : `Scan ${readyCards.length} card${readyCards.length !== 1 ? "s" : ""}`}
              </Text>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40,
    alignItems: "flex-start",
  },
  headerTitle: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: Colors.text,
    textAlign: "center",
  },
  clearBtn: {
    width: 40,
    alignItems: "flex-end",
  },
  statusBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 14,
  },
  statusItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statusNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.text,
  },
  statusLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  statusDivider: {
    width: 1,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: 4,
  },
  cardList: {
    flex: 1,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.textSecondary,
  },
  emptySub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    paddingHorizontal: 32,
  },
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
  cardRowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardIndexText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: Colors.textMuted,
  },
  thumbSlot: {
    width: 52,
    height: 72,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    borderStyle: "dashed",
    overflow: "hidden",
  },
  thumbSlotFilled: {
    borderStyle: "solid",
    borderColor: Colors.surfaceBorder,
  },
  thumbSlotDisabled: {
    opacity: 0.4,
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  thumbEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  thumbLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: Colors.textMuted,
  },
  readyBadge: {
    marginLeft: 4,
  },
  pendingBadge: {
    marginLeft: 4,
  },
  removeBtn: {
    padding: 4,
  },
  addCardBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    borderStyle: "dashed",
  },
  addCardBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textMuted,
  },
  bottomActions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    gap: 10,
  },
  bottomRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  actionBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#3B82F6",
  },
  scanBtnDisabled: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  scanBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
  scanBtnTextDisabled: {
    color: Colors.textMuted,
  },
  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
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
  loadingIconWrap: {
    position: "relative",
    marginBottom: 4,
  },
  loadingIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingSpinner: {
    position: "absolute",
    bottom: -4,
    right: -4,
  },
  loadingTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  loadingSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  progressBarBg: {
    width: "100%",
    height: 6,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#3B82F6",
    borderRadius: 3,
  },
  stagesList: {
    width: "100%",
    gap: 10,
    marginTop: 4,
  },
  stageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stageLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  stageLabelActive: {
    color: Colors.text,
    fontFamily: "Inter_500Medium",
  },
  stageLabelDone: {
    color: "#10B981",
  },
  // Camera
  bulkCameraTopRow: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
  },
  bulkCameraBanner: {
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bulkCameraBannerText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  bulkCameraDoneBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bulkCameraDoneBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
});
