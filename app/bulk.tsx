import React, { useState, useCallback, useRef } from "react";
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

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const MAX_CARDS = 20;
const CARD_SIZE = (SCREEN_WIDTH - 40 - 12) / 2;

interface CardSlot {
  id: string;
  frontImage: string | null;
  backImage: string | null;
}

export default function BulkScreen() {
  const insets = useSafeAreaInsets();
  const [cards, setCards] = useState<CardSlot[]>([
    { id: "1", frontImage: null, backImage: null },
  ]);
  const [loading, setLoading] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalToGrade, setTotalToGrade] = useState(0);
  const [currentCardName, setCurrentCardName] = useState("");
  const progressAnim = useRef(new Animated.Value(0)).current;

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const readyCards = cards.filter((c) => c.frontImage && c.backImage);

  const addCard = () => {
    if (cards.length >= MAX_CARDS) {
      Alert.alert("Maximum Reached", `You can grade up to ${MAX_CARDS} cards at once.`);
      return;
    }
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    setCards((prev) => [...prev, { id, frontImage: null, backImage: null }]);
  };

  const removeCard = (id: string) => {
    if (cards.length <= 1) return;
    setCards((prev) => prev.filter((c) => c.id !== id));
  };

  const pickImage = async (cardId: string, side: "front" | "back") => {
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
        base64: true,
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
        base64: true,
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
      Alert.alert("Add Photo", "Choose an option", [
        { text: "Take Photo", onPress: doTakePhoto },
        { text: "Choose from Library", onPress: doPickFromLibrary },
        { text: "Cancel", style: "cancel" },
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
      Alert.alert("No Cards Ready", "Add front and back photos for at least one card.");
      return;
    }

    setLoading(true);
    setCompletedCount(0);
    setTotalToGrade(readyCards.length);
    setCurrentCardName("");
    progressAnim.setValue(0);

    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      const cardsPayload = await Promise.all(
        readyCards.map(async (card) => ({
          frontImage: await getBase64FromUri(card.frontImage!),
          backImage: await getBase64FromUri(card.backImage!),
          originalFrontUri: card.frontImage!,
          originalBackUri: card.backImage!,
        }))
      );

      const response = await apiRequest("POST", "/api/bulk-grade", {
        cards: cardsPayload.map((c) => ({
          frontImage: c.frontImage,
          backImage: c.backImage,
        })),
      });

      const data = await response.json();
      const savedIds: string[] = [];

      for (const item of data.results) {
        if (item.result) {
          const payload = cardsPayload[item.index];
          const saved = await saveGrading(
            payload.originalFrontUri,
            payload.originalBackUri,
            item.result as GradingResult
          );
          savedIds.push(saved.id);
          setCompletedCount((prev) => prev + 1);
          setCurrentCardName(item.result.cardName || `Card ${item.index + 1}`);
          Animated.timing(progressAnim, {
            toValue: (savedIds.length) / readyCards.length,
            duration: 300,
            useNativeDriver: false,
          }).start();
        }
      }

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      const failedCount = data.results.filter((r: any) => r.error).length;

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

  const renderCardSlot = (card: CardSlot, index: number) => (
    <View key={card.id} style={styles.cardSlot}>
      <View style={styles.cardSlotHeader}>
        <Text style={styles.cardSlotNumber}>Card {index + 1}</Text>
        {cards.length > 1 && !loading && (
          <Pressable onPress={() => removeCard(card.id)} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      <View style={styles.cardImages}>
        <Pressable
          style={[styles.imageSlot, card.frontImage && styles.imageSlotFilled]}
          onPress={() => pickImage(card.id, "front")}
          disabled={loading}
        >
          {card.frontImage ? (
            <Image source={{ uri: card.frontImage }} style={styles.slotImage} contentFit="cover" />
          ) : (
            <View style={styles.slotPlaceholder}>
              <Ionicons name="camera-outline" size={20} color={Colors.textMuted} />
              <Text style={styles.slotLabel}>Front</Text>
            </View>
          )}
        </Pressable>

        <Pressable
          style={[styles.imageSlot, card.backImage && styles.imageSlotFilled]}
          onPress={() => pickImage(card.id, "back")}
          disabled={loading}
        >
          {card.backImage ? (
            <Image source={{ uri: card.backImage }} style={styles.slotImage} contentFit="cover" />
          ) : (
            <View style={styles.slotPlaceholder}>
              <Ionicons name="camera-outline" size={20} color={Colors.textMuted} />
              <Text style={styles.slotLabel}>Back</Text>
            </View>
          )}
        </Pressable>
      </View>

      {card.frontImage && card.backImage && (
        <View style={styles.readyBadge}>
          <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
          <Text style={styles.readyText}>Ready</Text>
        </View>
      )}
    </View>
  );

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
        <View style={{ width: 40 }} />
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
            <Text style={styles.loadingSubtitle}>Processing 3 cards at a time</Text>

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
              Estimated: ~{Math.ceil((totalToGrade / 3) * 15)}s total
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
            <View style={styles.infoBar}>
              <Ionicons name="information-circle" size={16} color={Colors.textSecondary} />
              <Text style={styles.infoText}>
                Add front & back photos for each card. Max {MAX_CARDS} cards. Cards are processed 3 at a time for speed.
              </Text>
            </View>

            {cards.map((card, i) => renderCardSlot(card, i))}

            {cards.length < MAX_CARDS && (
              <Pressable
                style={({ pressed }) => [styles.addCardBtn, { opacity: pressed ? 0.7 : 1 }]}
                onPress={addCard}
              >
                <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
                <Text style={styles.addCardText}>Add Another Card</Text>
              </Pressable>
            )}
          </ScrollView>

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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  infoBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 4,
  },
  infoText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
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
  cardImages: {
    flexDirection: "row",
    gap: 10,
  },
  imageSlot: {
    flex: 1,
    height: 120,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderStyle: "dashed",
    overflow: "hidden",
  },
  imageSlotFilled: {
    borderStyle: "solid",
    borderColor: Colors.primary + "40",
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
  readyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    alignSelf: "center",
  },
  readyText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.success,
  },
  addCardBtn: {
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
  addCardText: {
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
