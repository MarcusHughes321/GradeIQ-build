import React, { useState, useRef } from "react";
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
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { saveGrading } from "@/lib/storage";
import type { GradingResult } from "@/lib/types";

const MAX_CARDS = 20;

interface CardSlot {
  id: string;
  frontImage: string | null;
  backImage: string | null;
}

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 5);
}

export default function BulkScreen() {
  const insets = useSafeAreaInsets();
  const [cards, setCards] = useState<CardSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalToGrade, setTotalToGrade] = useState(0);
  const [currentCardName, setCurrentCardName] = useState("");
  const progressAnim = useRef(new Animated.Value(0)).current;

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const readyCards = cards.filter((c) => c.frontImage && c.backImage);

  const selectMultipleImages = async () => {
    if (loading) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Photo library access is needed to select card photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: MAX_CARDS * 2,
      quality: 0.8,
      orderedSelection: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) return;

    const uris = result.assets.map((a) => a.uri);

    const newCards: CardSlot[] = [];
    for (let i = 0; i < uris.length; i += 2) {
      if (newCards.length >= MAX_CARDS) break;
      const front = uris[i];
      const back = i + 1 < uris.length ? uris[i + 1] : null;
      newCards.push({
        id: generateId(),
        frontImage: front,
        backImage: back,
      });
    }

    setCards((prev) => {
      const combined = [...prev, ...newCards];
      return combined.slice(0, MAX_CARDS);
    });

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const pickSingleImage = async (cardId: string, side: "front" | "back") => {
    if (loading) return;

    const doPickFromLibrary = async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Photo library access is needed.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: true,
        aspect: [63, 88],
      });
      if (!result.canceled && result.assets[0]) {
        setCards((prev) =>
          prev.map((c) =>
            c.id === cardId ? { ...c, [side === "front" ? "frontImage" : "backImage"]: result.assets[0].uri } : c
          )
        );
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
    };

    const doTakePhoto = async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Camera access is needed.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: true,
        aspect: [63, 88],
      });
      if (!result.canceled && result.assets[0]) {
        setCards((prev) =>
          prev.map((c) =>
            c.id === cardId ? { ...c, [side === "front" ? "frontImage" : "backImage"]: result.assets[0].uri } : c
          )
        );
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
    };

    if (Platform.OS === "web") {
      await doPickFromLibrary();
    } else {
      Alert.alert("Replace Photo", "Choose an option", [
        { text: "Take Photo", onPress: doTakePhoto },
        { text: "Choose from Library", onPress: doPickFromLibrary },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  const removeCard = (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  };

  const clearAll = () => {
    if (cards.length === 0) return;
    const doIt = () => setCards([]);
    if (Platform.OS === "web") {
      if (confirm("Remove all cards?")) doIt();
    } else {
      Alert.alert("Clear All", "Remove all cards?", [
        { text: "Cancel", style: "cancel" },
        { text: "Clear All", style: "destructive", onPress: doIt },
      ]);
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

  const handleBulkGrade = async () => {
    if (readyCards.length === 0) {
      Alert.alert("No Cards Ready", "Each card needs both a front and back photo.");
      return;
    }

    setLoading(true);
    setCompletedCount(0);
    setTotalToGrade(readyCards.length);
    setCurrentCardName(`Preparing card 1 of ${readyCards.length}...`);
    progressAnim.setValue(0);

    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      const savedIds: string[] = [];
      let failedCount = 0;

      for (let i = 0; i < readyCards.length; i++) {
        const card = readyCards[i];
        setCurrentCardName(`Grading card ${i + 1} of ${readyCards.length}...`);

        try {
          const frontBase64 = await getBase64FromUri(card.frontImage!);
          const backBase64 = await getBase64FromUri(card.backImage!);

          const response = await apiRequest("POST", "/api/grade-card", {
            frontImage: frontBase64,
            backImage: backBase64,
          });

          const result = await response.json();

          if (result.error) {
            console.error(`Card ${i + 1} failed:`, result.error);
            failedCount++;
          } else {
            const saved = await saveGrading(
              card.frontImage!,
              card.backImage!,
              result as GradingResult
            );
            savedIds.push(saved.id);
            setCurrentCardName(result.cardName || `Card ${i + 1}`);
          }
        } catch (cardErr: any) {
          console.error(`Card ${i + 1} error:`, cardErr?.message);
          failedCount++;
        }

        setCompletedCount(i + 1);
        Animated.timing(progressAnim, {
          toValue: (i + 1) / readyCards.length,
          duration: 400,
          useNativeDriver: false,
        }).start();

        if (Platform.OS !== "web" && i < readyCards.length - 1) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      router.replace({
        pathname: "/bulk-results",
        params: {
          gradingIds: savedIds.join(","),
          failedCount: failedCount.toString(),
        },
      });
    } catch (error: any) {
      console.error("Bulk grading error:", error);
      Alert.alert("Grading Failed", "There was an error grading your cards. Please try again.");
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setLoading(false);
    }
  };

  const incompleteCards = cards.filter((c) => !c.frontImage || !c.backImage);

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
        <Text style={styles.headerTitle}>Bulk Grade</Text>
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
                <Ionicons name="layers" size={32} color={Colors.primary} />
              </View>
              <ActivityIndicator color={Colors.primary} size="small" style={styles.loadingSpinner} />
            </View>

            <Text style={styles.loadingTitle}>Grading {totalToGrade} cards...</Text>
            <Text style={styles.loadingSubtitle}>Full analysis on each card</Text>

            {currentCardName ? (
              <Text style={styles.loadingCardName}>{currentCardName}</Text>
            ) : null}

            <View style={styles.progressBarOuter}>
              <Animated.View
                style={[
                  styles.progressBarInner,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["2%", "100%"],
                    }),
                  },
                ]}
              />
            </View>

            <Text style={styles.progressText}>
              {completedCount} of {totalToGrade} completed
            </Text>

            <Text style={styles.estimateText}>
              {totalToGrade - completedCount > 0 ? `~${Math.max(1, Math.ceil((totalToGrade - completedCount) * 40 / 60))} min remaining` : "Finishing up..."}
            </Text>
          </View>
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + webBottomInset + 100 }]}
            showsVerticalScrollIndicator={false}
          >
            {cards.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="images-outline" size={40} color={Colors.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>Select Your Card Photos</Text>
                <Text style={styles.emptyText}>
                  Pick all your card images at once from your photo library. Select them in order: front, back, front, back...
                </Text>
                <Text style={styles.emptyHint}>
                  Images are automatically paired as front/back for each card. Up to {MAX_CARDS} cards.
                </Text>

                <Pressable
                  style={({ pressed }) => [styles.selectBtn, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                  onPress={selectMultipleImages}
                >
                  <Ionicons name="images" size={22} color="#fff" />
                  <Text style={styles.selectBtnText}>Select Images from Library</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.statusBar}>
                  <View style={styles.statusItem}>
                    <Text style={styles.statusNumber}>{cards.length}</Text>
                    <Text style={styles.statusLabel}>Total</Text>
                  </View>
                  <View style={styles.statusDivider} />
                  <View style={styles.statusItem}>
                    <Text style={[styles.statusNumber, { color: Colors.success }]}>{readyCards.length}</Text>
                    <Text style={styles.statusLabel}>Ready</Text>
                  </View>
                  {incompleteCards.length > 0 && (
                    <>
                      <View style={styles.statusDivider} />
                      <View style={styles.statusItem}>
                        <Text style={[styles.statusNumber, { color: Colors.warning }]}>{incompleteCards.length}</Text>
                        <Text style={styles.statusLabel}>Need Back</Text>
                      </View>
                    </>
                  )}
                </View>

                {cards.map((card, index) => (
                  <View key={card.id} style={styles.cardSlot}>
                    <View style={styles.cardSlotHeader}>
                      <Text style={styles.cardSlotNumber}>Card {index + 1}</Text>
                      <View style={styles.cardSlotBadges}>
                        {card.frontImage && card.backImage ? (
                          <View style={styles.readyBadge}>
                            <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                            <Text style={styles.readyText}>Ready</Text>
                          </View>
                        ) : (
                          <View style={styles.incompleteBadge}>
                            <Ionicons name="alert-circle" size={14} color={Colors.warning} />
                            <Text style={styles.incompleteText}>Needs back</Text>
                          </View>
                        )}
                        <Pressable onPress={() => removeCard(card.id)} hitSlop={8}>
                          <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
                        </Pressable>
                      </View>
                    </View>

                    <View style={styles.cardImages}>
                      <Pressable
                        style={[styles.imageSlot, card.frontImage && styles.imageSlotFilled]}
                        onPress={() => pickSingleImage(card.id, "front")}
                      >
                        {card.frontImage ? (
                          <Image source={{ uri: card.frontImage }} style={styles.slotImage} contentFit="cover" />
                        ) : (
                          <View style={styles.slotPlaceholder}>
                            <Ionicons name="camera-outline" size={20} color={Colors.textMuted} />
                            <Text style={styles.slotLabel}>Front</Text>
                          </View>
                        )}
                        <View style={styles.slotTag}>
                          <Text style={styles.slotTagText}>Front</Text>
                        </View>
                      </Pressable>

                      <Pressable
                        style={[styles.imageSlot, card.backImage && styles.imageSlotFilled, !card.backImage && styles.imageSlotMissing]}
                        onPress={() => pickSingleImage(card.id, "back")}
                      >
                        {card.backImage ? (
                          <Image source={{ uri: card.backImage }} style={styles.slotImage} contentFit="cover" />
                        ) : (
                          <View style={styles.slotPlaceholder}>
                            <Ionicons name="add-circle-outline" size={22} color={Colors.warning} />
                            <Text style={[styles.slotLabel, { color: Colors.warning }]}>Add Back</Text>
                          </View>
                        )}
                        <View style={styles.slotTag}>
                          <Text style={styles.slotTagText}>Back</Text>
                        </View>
                      </Pressable>
                    </View>
                  </View>
                ))}

                {cards.length < MAX_CARDS && (
                  <Pressable
                    style={({ pressed }) => [styles.addMoreBtn, { opacity: pressed ? 0.7 : 1 }]}
                    onPress={selectMultipleImages}
                  >
                    <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
                    <Text style={styles.addMoreText}>Select More Images</Text>
                  </Pressable>
                )}
              </>
            )}
          </ScrollView>

          {cards.length > 0 && (
            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + webBottomInset + 12 }]}>
              <Pressable
                style={({ pressed }) => [
                  styles.gradeBtn,
                  readyCards.length === 0 && styles.gradeBtnDisabled,
                  { transform: [{ scale: pressed && readyCards.length > 0 ? 0.97 : 1 }] },
                ]}
                onPress={handleBulkGrade}
                disabled={readyCards.length === 0}
              >
                <Ionicons name="flash" size={20} color="#fff" />
                <Text style={styles.gradeBtnText}>
                  Grade {readyCards.length} {readyCards.length === 1 ? "Card" : "Cards"}
                </Text>
              </Pressable>
              {readyCards.length > 0 && (
                <Text style={styles.bottomHint}>
                  Estimated time: ~{Math.max(1, Math.ceil(readyCards.length * 40 / 60))} min ({"\u2248"}40s per card)
                </Text>
              )}
              {incompleteCards.length > 0 && (
                <Text style={styles.bottomHint}>
                  {incompleteCards.length} card{incompleteCards.length > 1 ? "s" : ""} missing back photo
                </Text>
              )}
            </View>
          )}
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
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  clearBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 20,
    gap: 12,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  emptyTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.text,
    textAlign: "center",
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
  },
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 28,
    marginTop: 20,
    width: "100%",
  },
  selectBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 16,
  },
  statusItem: {
    alignItems: "center",
    gap: 2,
  },
  statusNumber: {
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
    height: 28,
    backgroundColor: Colors.surfaceBorder,
  },
  cardSlot: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  cardSlotHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  cardSlotNumber: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  cardSlotBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  readyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  readyText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.success,
  },
  incompleteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  incompleteText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.warning,
  },
  cardImages: {
    flexDirection: "row",
    gap: 10,
  },
  imageSlot: {
    flex: 1,
    height: 130,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: "hidden",
    position: "relative",
  },
  imageSlotFilled: {
    borderColor: Colors.success + "40",
  },
  imageSlotMissing: {
    borderColor: Colors.warning + "40",
    borderStyle: "dashed",
  },
  slotImage: {
    width: "100%",
    height: "100%",
  },
  slotPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  slotLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textMuted,
  },
  slotTag: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  slotTagText: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: "#fff",
  },
  addMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.primary + "40",
    borderStyle: "dashed",
    backgroundColor: Colors.primary + "08",
  },
  addMoreText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.primary,
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
  gradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
  },
  gradeBtnDisabled: {
    opacity: 0.4,
  },
  gradeBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
  },
  bottomHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.warning,
    textAlign: "center",
    marginTop: 8,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  loadingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  loadingIconWrap: {
    position: "relative",
    marginBottom: 20,
  },
  loadingIconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary + "15",
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
    fontSize: 20,
    color: Colors.text,
    marginBottom: 4,
  },
  loadingSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  loadingCardName: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.primary,
    marginBottom: 16,
  },
  progressBarOuter: {
    width: "100%",
    height: 6,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 10,
  },
  progressBarInner: {
    height: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  progressText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 4,
  },
  estimateText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
});
