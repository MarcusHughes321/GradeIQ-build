import React, { useState, useRef, useEffect } from "react";
import * as Notifications from "expo-notifications";
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
import { saveGrading, updateGrading } from "@/lib/storage";
import { getSettings } from "@/lib/settings";
import type { GradingResult } from "@/lib/types";
import CardCamera from "@/components/CardCamera";
import ImageAdjustModal from "@/components/ImageAdjustModal";
import { useSubscription } from "@/lib/subscription";

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

  const [bulkCameraActive, setBulkCameraActive] = useState(false);
  const [bulkCameraSide, setBulkCameraSide] = useState<"front" | "back">("front");
  const [bulkCameraCardIndex, setBulkCameraCardIndex] = useState(0);
  const bulkCameraFrontRef = useRef<string | null>(null);

  const [adjustImage, setAdjustImage] = useState<{ uri: string; cardId: string; side: "front" | "back" } | null>(null);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const { canGrade, checkCanGrade, recordUsage, isGateEnabled } = useSubscription();

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
        quality: 0.9,
      });
      if (!result.canceled && result.assets[0]) {
        setAdjustImage({ uri: result.assets[0].uri, cardId, side });
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

  const startBulkCamera = () => {
    if (loading) return;
    if (cards.length >= MAX_CARDS) {
      Alert.alert("Limit Reached", `You can grade up to ${MAX_CARDS} cards at once.`);
      return;
    }
    bulkCameraFrontRef.current = null;
    setBulkCameraCardIndex(cards.length);
    setBulkCameraSide("front");
    setBulkCameraActive(true);
  };

  const handleBulkCameraCapture = (uri: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (bulkCameraSide === "front") {
      bulkCameraFrontRef.current = uri;
      setBulkCameraSide("back");
    } else {
      const newCard: CardSlot = {
        id: generateId(),
        frontImage: bulkCameraFrontRef.current,
        backImage: uri,
      };
      setCards((prev) => {
        const updated = [...prev, newCard];
        return updated.slice(0, MAX_CARDS);
      });
      bulkCameraFrontRef.current = null;

      const nextIndex = bulkCameraCardIndex + 1;
      if (nextIndex >= MAX_CARDS) {
        setBulkCameraActive(false);
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        setBulkCameraCardIndex(nextIndex);
        setBulkCameraSide("front");
      }
    }
  };

  const handleBulkCameraClose = () => {
    if (bulkCameraSide === "back" && bulkCameraFrontRef.current) {
      setCards((prev) => {
        const updated = [...prev, { id: generateId(), frontImage: bulkCameraFrontRef.current, backImage: null }];
        return updated.slice(0, MAX_CARDS);
      });
    }
    bulkCameraFrontRef.current = null;
    setBulkCameraActive(false);
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
        console.log("[bulk getBase64] ImageManipulator failed, falling back to fetch:", e);
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

  const bulkPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cardImagesRef = useRef<Array<{ frontImage: string; backImage: string }>>([]);
  const scheduledNotifRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (bulkPollingRef.current) clearInterval(bulkPollingRef.current);
    };
  }, []);

  const handleBulkGrade = async () => {
    if (readyCards.length === 0) {
      Alert.alert("No Cards Ready", "Each card needs both a front and back photo.");
      return;
    }

    if (isGateEnabled && !checkCanGrade(readyCards.length)) {
      router.push("/paywall");
      return;
    }

    setLoading(true);
    setCompletedCount(0);
    setTotalToGrade(readyCards.length);
    setCurrentCardName(`Preparing images...`);
    progressAnim.setValue(0);

    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      setCurrentCardName(`Converting ${readyCards.length} cards...`);

      const cardImages = await Promise.all(
        readyCards.map(async (card) => {
          const frontBase64 = await getBase64FromUri(card.frontImage!);
          const backBase64 = await getBase64FromUri(card.backImage!);
          return { frontImage: frontBase64, backImage: backBase64 };
        })
      );

      cardImagesRef.current = cardImages;

      setCurrentCardName(`Submitting ${readyCards.length} cards to server...`);

      const resp = await apiRequest("POST", "/api/bulk-grade-job", {
        cards: cardImages,
      });

      const { jobId } = await resp.json();

      setCurrentCardName(`Server is grading your cards...`);

      if (Platform.OS !== "web") {
        try {
          const estimatedSeconds = Math.max(75, readyCards.length * 70);
          scheduledNotifRef.current = await Notifications.scheduleNotificationAsync({
            content: {
              title: "Bulk Grading Complete",
              body: `Your ${readyCards.length} cards should be ready! Tap to check.`,
              sound: "default",
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: estimatedSeconds,
            },
          });
        } catch {}
      }

      bulkPollingRef.current = setInterval(async () => {
        try {
          const pollResp = await apiRequest("GET", `/api/grade-job/${jobId}`);
          const data = await pollResp.json();

          if (data.completedCards !== undefined) {
            setCompletedCount(data.completedCards);
            Animated.timing(progressAnim, {
              toValue: data.completedCards / (data.totalCards || readyCards.length),
              duration: 400,
              useNativeDriver: false,
            }).start();
            setCurrentCardName(`Grading card ${Math.min(data.completedCards + 1, data.totalCards)} of ${data.totalCards}...`);
          }

          if (data.status === "completed" && data.results) {
            if (bulkPollingRef.current) clearInterval(bulkPollingRef.current);
            bulkPollingRef.current = null;

            if (scheduledNotifRef.current) {
              try { await Notifications.cancelScheduledNotificationAsync(scheduledNotifRef.current); } catch {}
              scheduledNotifRef.current = null;
            }

            const savedIds: string[] = [];
            let failedCount = 0;
            const failedCardImages: string[] = [];

            for (let i = 0; i < data.results.length; i++) {
              const r = data.results[i];
              if (r.status === "completed" && r.result) {
                const gr = r.result as GradingResult;
                const images = cardImagesRef.current[i];
                const saved = await saveGrading(images?.frontImage || "", images?.backImage || "", gr);
                savedIds.push(saved.id);

                (async () => {
                  try {
                    const bulkSettings = await getSettings();
                    const vResp = await apiRequest("POST", "/api/card-value", {
                      cardName: gr.cardName,
                      setName: gr.setName || gr.setInfo,
                      setNumber: gr.setNumber,
                      psaGrade: gr.psa.grade,
                      bgsGrade: gr.beckett.overallGrade,
                      aceGrade: gr.ace.overallGrade,
                      tagGrade: gr.tag?.overallGrade,
                      cgcGrade: gr.cgc?.grade,
                      currency: bulkSettings.currency || "GBP",
                    });
                    const vData = await vResp.json();
                    await updateGrading(saved.id, { result: { ...gr, cardValue: vData } });
                  } catch {}
                })();
              } else {
                failedCount++;
                const origCard = readyCards[i];
                if (origCard?.frontImage) failedCardImages.push(origCard.frontImage);
              }
            }

            await recordUsage(savedIds.length);

            if (Platform.OS !== "web") {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              try {
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: "Bulk Grading Complete",
                    body: `${savedIds.length} of ${data.results.length} cards graded successfully!`,
                    sound: "default",
                  },
                  trigger: null,
                });
              } catch {}
            }

            setLoading(false);
            router.replace({
              pathname: "/bulk-results",
              params: {
                gradingIds: savedIds.join(","),
                failedCount: failedCount.toString(),
                failedImages: failedCardImages.join("|||"),
              },
            });
          } else if (data.status === "failed") {
            if (bulkPollingRef.current) clearInterval(bulkPollingRef.current);
            bulkPollingRef.current = null;
            if (scheduledNotifRef.current) {
              try { await Notifications.cancelScheduledNotificationAsync(scheduledNotifRef.current); } catch {}
              scheduledNotifRef.current = null;
            }
            setLoading(false);
            Alert.alert("Grading Failed", data.error || "There was an error grading your cards.");
            if (Platform.OS !== "web") {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
          }
        } catch (pollErr) {
          console.log("Bulk poll error (will retry):", pollErr);
        }
      }, 3000);
    } catch (error: any) {
      console.error("Bulk grading error:", error);
      Alert.alert("Grading Failed", "There was an error submitting your cards. Please try again.");
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      setLoading(false);
    }
  };

  const incompleteCards = cards.filter((c) => !c.frontImage || !c.backImage);

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
          <Pressable
            style={styles.bulkCameraDoneBtn}
            onPress={handleBulkCameraClose}
          >
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

          <Text style={styles.serverNote}>
            Grading runs on the server — you can leave the app
          </Text>

          <Pressable
            style={({ pressed }) => [styles.continueButton, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.navigate("/(tabs)")}
          >
            <Ionicons name="arrow-back" size={16} color={Colors.text} />
            <Text style={styles.continueButtonText}>Continue browsing</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + webBottomInset + 100 }]}
            showsVerticalScrollIndicator={false}
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
          >
            {cards.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="images-outline" size={40} color={Colors.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>Add Your Card Photos</Text>
                <Text style={styles.emptyText}>
                  Use the camera to snap front and back of each card one after another, or select photos from your library.
                </Text>
                <Text style={styles.emptyHint}>
                  Up to {MAX_CARDS} cards per batch. Each card needs a front and back photo.
                </Text>

                {Platform.OS !== "web" && (
                  <Pressable
                    style={({ pressed }) => [styles.selectBtn, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                    onPress={startBulkCamera}
                  >
                    <Ionicons name="camera" size={22} color="#fff" />
                    <Text style={styles.selectBtnText}>Take Photos with Camera</Text>
                  </Pressable>
                )}

                <Pressable
                  style={({ pressed }) => [styles.selectBtn, styles.selectBtnAlt, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
                  onPress={selectMultipleImages}
                >
                  <Ionicons name="images" size={22} color={Colors.primary} />
                  <Text style={[styles.selectBtnText, { color: Colors.primary }]}>Select from Photo Library</Text>
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
                  <View style={styles.addMoreRow}>
                    {Platform.OS !== "web" && (
                      <Pressable
                        style={({ pressed }) => [styles.addMoreBtn, { opacity: pressed ? 0.7 : 1, flex: 1 }]}
                        onPress={startBulkCamera}
                      >
                        <Ionicons name="camera-outline" size={20} color={Colors.primary} />
                        <Text style={styles.addMoreText}>Camera</Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={({ pressed }) => [styles.addMoreBtn, { opacity: pressed ? 0.7 : 1, flex: 1 }]}
                      onPress={selectMultipleImages}
                    >
                      <Ionicons name="images-outline" size={20} color={Colors.primary} />
                      <Text style={styles.addMoreText}>Library</Text>
                    </Pressable>
                  </View>
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

      {adjustImage && (
        <ImageAdjustModal
          visible={true}
          imageUri={adjustImage.uri}
          onConfirm={(uri) => {
            const { cardId, side } = adjustImage;
            setAdjustImage(null);
            setCards((prev) =>
              prev.map((c) =>
                c.id === cardId ? { ...c, [side === "front" ? "frontImage" : "backImage"]: uri } : c
              )
            );
            if (Platform.OS !== "web") {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
          }}
          onCancel={() => setAdjustImage(null)}
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
  selectBtnAlt: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.primary + "60",
    marginTop: 12,
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
  addMoreRow: {
    flexDirection: "row",
    gap: 10,
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
  serverNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 16,
    textAlign: "center" as const,
  },
  continueButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: 14,
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
  bulkCameraTopRow: {
    position: "absolute" as const,
    left: 16,
    right: 16,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    zIndex: 200,
  },
  bulkCameraBanner: {
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  bulkCameraBannerText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#fff",
  },
  bulkCameraDoneBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  bulkCameraDoneBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#fff",
  },
});
