import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Modal,
  Dimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getGradings } from "@/lib/storage";
import type { SavedGrading } from "@/lib/types";
import GradeCircle from "@/components/GradeCircle";
import CompanyCard from "@/components/CompanyCard";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function ResultsScreen() {
  const insets = useSafeAreaInsets();
  const { gradingId } = useLocalSearchParams<{ gradingId: string }>();
  const [grading, setGrading] = useState<SavedGrading | null>(null);
  const [showFront, setShowFront] = useState(true);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [viewerShowFront, setViewerShowFront] = useState(true);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  useEffect(() => {
    loadGrading();
  }, [gradingId]);

  const loadGrading = async () => {
    const all = await getGradings();
    const found = all.find((g) => g.id === gradingId);
    if (found) {
      setGrading(found);
    }
  };

  const openImageViewer = (front: boolean) => {
    setViewerShowFront(front);
    setImageViewerVisible(true);
  };

  if (!grading) {
    return (
      <View style={[styles.loading, { paddingTop: insets.top + webTopInset }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const { result } = grading;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Results</Text>
        <Pressable
          onPress={() => router.replace("/")}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="home" size={22} color={Colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + webBottomInset + 30 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cardPreview}>
          <Pressable
            onPress={() => openImageViewer(showFront)}
            onLongPress={() => setShowFront(!showFront)}
            style={({ pressed }) => [styles.cardImageWrapper, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Image
              source={{ uri: showFront ? grading.frontImage : grading.backImage }}
              style={styles.cardImage}
              contentFit="cover"
            />
            <View style={styles.viewBadge}>
              <Ionicons name="expand" size={14} color="#fff" />
            </View>
            <Pressable
              onPress={() => setShowFront(!showFront)}
              style={({ pressed }) => [styles.flipBadge, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Ionicons name="swap-horizontal" size={14} color="#fff" />
              <Text style={styles.flipText}>{showFront ? "Front" : "Back"}</Text>
            </Pressable>
          </Pressable>

          <View style={styles.cardInfo}>
            <Text style={styles.cardName}>{result.cardName || "Pokemon Card"}</Text>
            {result.setInfo ? (
              <Text style={styles.setInfo}>{result.setInfo}</Text>
            ) : null}
            <Text style={styles.condition} numberOfLines={3}>{result.overallCondition}</Text>

            <View style={styles.gradesRow}>
              <GradeCircle grade={result.psa.grade} size={52} color={Colors.cardPSA} label="PSA" />
              <GradeCircle
                grade={result.beckett.overallGrade}
                size={52}
                color={Colors.cardBeckett}
                label="BGS"
              />
              <GradeCircle grade={result.ace.overallGrade} size={52} color={Colors.cardAce} label="ACE" />
            </View>
          </View>
        </View>

        <View style={styles.imageRow}>
          <Pressable
            style={({ pressed }) => [styles.imageThumb, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
            onPress={() => openImageViewer(true)}
          >
            <Image
              source={{ uri: grading.frontImage }}
              style={styles.imageThumbImg}
              contentFit="cover"
            />
            <View style={styles.imageThumbLabel}>
              <Text style={styles.imageThumbText}>Front</Text>
              <Ionicons name="expand-outline" size={12} color="#fff" />
            </View>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.imageThumb, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
            onPress={() => openImageViewer(false)}
          >
            <Image
              source={{ uri: grading.backImage }}
              style={styles.imageThumbImg}
              contentFit="cover"
            />
            <View style={styles.imageThumbLabel}>
              <Text style={styles.imageThumbText}>Back</Text>
              <Ionicons name="expand-outline" size={12} color="#fff" />
            </View>
          </Pressable>
        </View>

        <CompanyCard company="PSA" grade={result.psa} color={Colors.cardPSA} />
        <CompanyCard company="Beckett" grade={result.beckett} color={Colors.cardBeckett} />
        <CompanyCard company="Ace" grade={result.ace} color={Colors.cardAce} />

        <View style={styles.disclaimer}>
          <Ionicons name="information-circle" size={16} color={Colors.textMuted} />
          <Text style={styles.disclaimerText}>
            These grades are AI estimates based on photo analysis. Actual grades from professional
            grading companies may differ. Photo quality affects accuracy.
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={imageViewerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setImageViewerVisible(false)}
      >
        <View style={[styles.modalOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.modalHeader}>
            <Pressable
              onPress={() => setImageViewerVisible(false)}
              style={({ pressed }) => [styles.modalCloseBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
            <Text style={styles.modalTitle}>{viewerShowFront ? "Front" : "Back"}</Text>
            <Pressable
              onPress={() => setViewerShowFront(!viewerShowFront)}
              style={({ pressed }) => [styles.modalFlipBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Ionicons name="swap-horizontal" size={24} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.modalImageContainer}>
            <Image
              source={{ uri: viewerShowFront ? grading.frontImage : grading.backImage }}
              style={styles.modalImage}
              contentFit="contain"
            />
          </View>

          <View style={styles.modalFooter}>
            <Pressable
              style={({ pressed }) => [
                styles.modalTab,
                viewerShowFront && styles.modalTabActive,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={() => setViewerShowFront(true)}
            >
              <Text style={[styles.modalTabText, viewerShowFront && styles.modalTabTextActive]}>Front</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.modalTab,
                !viewerShowFront && styles.modalTabActive,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={() => setViewerShowFront(false)}
            >
              <Text style={[styles.modalTabText, !viewerShowFront && styles.modalTabTextActive]}>Back</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loading: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
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
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: Colors.text,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 16,
  },
  cardPreview: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    gap: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  cardImageWrapper: {
    width: 100,
    height: 140,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.surfaceLight,
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  viewBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  flipBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    gap: 4,
  },
  flipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: "#fff",
  },
  cardInfo: {
    flex: 1,
    gap: 6,
  },
  cardName: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  setInfo: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  condition: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  gradesRow: {
    flexDirection: "row",
    gap: 14,
    marginTop: 8,
  },
  imageRow: {
    flexDirection: "row",
    gap: 12,
  },
  imageThumb: {
    flex: 1,
    height: 100,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  imageThumbImg: {
    width: "100%",
    height: "100%",
  },
  imageThumbLabel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    gap: 6,
  },
  imageThumbText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#fff",
  },
  disclaimer: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  disclaimerText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 16,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "space-between",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  modalCloseBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: "#fff",
  },
  modalFlipBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  modalImageContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  modalImage: {
    width: SCREEN_WIDTH - 32,
    height: SCREEN_HEIGHT * 0.65,
    borderRadius: 12,
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingBottom: 20,
    paddingHorizontal: 40,
  },
  modalTab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
  },
  modalTabActive: {
    backgroundColor: Colors.primary,
  },
  modalTabText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
  },
  modalTabTextActive: {
    color: "#fff",
  },
});
