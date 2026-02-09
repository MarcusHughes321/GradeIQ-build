import React, { useEffect, useState, useRef } from "react";
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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import { getGradings } from "@/lib/storage";
import type { SavedGrading, GradingResult } from "@/lib/types";
import GradeCircle from "@/components/GradeCircle";
import CompanyCard from "@/components/CompanyCard";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface AnalysisNote {
  area: string;
  icon: string;
  notes: string;
  grade: string;
  color: string;
}

function getAnalysisNotes(result: GradingResult, isFront: boolean): AnalysisNote[] {
  const bgs = result.beckett;
  const notes: AnalysisNote[] = [];

  const centeringNote = isFront
    ? (bgs.centering.notes || result.psa.centering)
    : (bgs.centering.notes || result.psa.centering);
  if (centeringNote) {
    notes.push({
      area: "Centering",
      icon: "scan-outline",
      notes: centeringNote,
      grade: `${bgs.centering.grade}/10`,
      color: getGradeColor(bgs.centering.grade),
    });
  }

  const cornersNote = isFront
    ? (bgs.corners.notes || result.psa.corners)
    : (bgs.corners.notes || result.psa.corners);
  if (cornersNote) {
    notes.push({
      area: "Corners",
      icon: "resize-outline",
      notes: cornersNote,
      grade: `${bgs.corners.grade}/10`,
      color: getGradeColor(bgs.corners.grade),
    });
  }

  const edgesNote = isFront
    ? (bgs.edges.notes || result.psa.edges)
    : (bgs.edges.notes || result.psa.edges);
  if (edgesNote) {
    notes.push({
      area: "Edges",
      icon: "remove-outline",
      notes: edgesNote,
      grade: `${bgs.edges.grade}/10`,
      color: getGradeColor(bgs.edges.grade),
    });
  }

  const surfaceNote = isFront
    ? (bgs.surface.notes || result.psa.surface)
    : (bgs.surface.notes || result.psa.surface);
  if (surfaceNote) {
    notes.push({
      area: "Surface",
      icon: "layers-outline",
      notes: surfaceNote,
      grade: `${bgs.surface.grade}/10`,
      color: getGradeColor(bgs.surface.grade),
    });
  }

  return notes;
}

function getGradeColor(grade: number): string {
  if (grade >= 9.5) return "#10B981";
  if (grade >= 9) return "#34D399";
  if (grade >= 8) return "#F59E0B";
  if (grade >= 7) return "#FB923C";
  return "#EF4444";
}

function AnnotationCard({ note }: { note: AnalysisNote }) {
  return (
    <View style={annoStyles.card}>
      <View style={annoStyles.cardHeader}>
        <View style={[annoStyles.iconWrap, { backgroundColor: note.color + "20" }]}>
          <Ionicons name={note.icon as any} size={14} color={note.color} />
        </View>
        <Text style={annoStyles.areaText}>{note.area}</Text>
        <View style={[annoStyles.gradeBadge, { backgroundColor: note.color + "25" }]}>
          <Text style={[annoStyles.gradeText, { color: note.color }]}>{note.grade}</Text>
        </View>
      </View>
      <Text style={annoStyles.noteText} numberOfLines={3}>{note.notes}</Text>
    </View>
  );
}

export default function ResultsScreen() {
  const insets = useSafeAreaInsets();
  const { gradingId } = useLocalSearchParams<{ gradingId: string }>();
  const [grading, setGrading] = useState<SavedGrading | null>(null);
  const [showFront, setShowFront] = useState(true);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [viewerShowFront, setViewerShowFront] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);

  const zoomScale = useSharedValue(1);
  const zoomScrollRef = useRef<ScrollView>(null);

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
    setShowAnnotations(true);
    setImageViewerVisible(true);
  };

  const closeImageViewer = () => {
    setImageViewerVisible(false);
    zoomScale.value = withSpring(1);
  };

  if (!grading) {
    return (
      <View style={[styles.loading, { paddingTop: insets.top + webTopInset }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const { result } = grading;
  const analysisNotes = getAnalysisNotes(result, viewerShowFront);

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
        onRequestClose={closeImageViewer}
      >
        <View style={[styles.modalOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.modalHeader}>
            <Pressable
              onPress={closeImageViewer}
              style={({ pressed }) => [styles.modalHeaderBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
            <Text style={styles.modalTitle}>{viewerShowFront ? "Front" : "Back"}</Text>
            <View style={styles.modalHeaderRight}>
              <Pressable
                onPress={() => setShowAnnotations(!showAnnotations)}
                style={({ pressed }) => [styles.modalHeaderBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Ionicons
                  name={showAnnotations ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"}
                  size={22}
                  color={showAnnotations ? Colors.primary : "#fff"}
                />
              </Pressable>
              <Pressable
                onPress={() => setViewerShowFront(!viewerShowFront)}
                style={({ pressed }) => [styles.modalHeaderBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Ionicons name="swap-horizontal" size={24} color="#fff" />
              </Pressable>
            </View>
          </View>

          <View style={styles.modalBody}>
            <ScrollView
              ref={zoomScrollRef}
              style={styles.zoomScrollView}
              contentContainerStyle={styles.zoomScrollContent}
              maximumZoomScale={5}
              minimumZoomScale={1}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              bouncesZoom={true}
              centerContent={true}
            >
              <View style={styles.modalImageWrap}>
                <Image
                  source={{ uri: viewerShowFront ? grading.frontImage : grading.backImage }}
                  style={styles.modalImage}
                  contentFit="contain"
                />
                {showAnnotations && (
                  <View style={styles.annotationOverlay}>
                    <View style={[styles.annotationMarker, styles.markerTopCenter]}>
                      <View style={[styles.markerDot, { backgroundColor: getGradeColor(result.beckett.centering.grade) }]} />
                    </View>
                    <View style={[styles.annotationMarker, styles.markerTopLeft]}>
                      <View style={[styles.markerCorner, { borderColor: getGradeColor(result.beckett.corners.grade) }]} />
                    </View>
                    <View style={[styles.annotationMarker, styles.markerTopRight]}>
                      <View style={[styles.markerCorner, { borderColor: getGradeColor(result.beckett.corners.grade), transform: [{ rotate: "90deg" }] }]} />
                    </View>
                    <View style={[styles.annotationMarker, styles.markerBottomLeft]}>
                      <View style={[styles.markerCorner, { borderColor: getGradeColor(result.beckett.corners.grade), transform: [{ rotate: "-90deg" }] }]} />
                    </View>
                    <View style={[styles.annotationMarker, styles.markerBottomRight]}>
                      <View style={[styles.markerCorner, { borderColor: getGradeColor(result.beckett.corners.grade), transform: [{ rotate: "180deg" }] }]} />
                    </View>
                    <View style={[styles.annotationMarker, styles.markerLeftEdge]}>
                      <View style={[styles.markerEdge, { backgroundColor: getGradeColor(result.beckett.edges.grade) }]} />
                    </View>
                    <View style={[styles.annotationMarker, styles.markerRightEdge]}>
                      <View style={[styles.markerEdge, { backgroundColor: getGradeColor(result.beckett.edges.grade) }]} />
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>

            {showAnnotations && (
              <View style={styles.annotationPanel}>
                <ScrollView
                  horizontal={false}
                  showsVerticalScrollIndicator={false}
                  style={styles.annotationScroll}
                  contentContainerStyle={styles.annotationScrollContent}
                >
                  {analysisNotes.map((note, i) => (
                    <AnnotationCard key={note.area} note={note} />
                  ))}
                </ScrollView>
              </View>
            )}
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

const annoStyles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  areaText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#fff",
    flex: 1,
  },
  gradeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  gradeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  noteText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    lineHeight: 16,
  },
});

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
    backgroundColor: "rgba(0,0,0,0.97)",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  modalHeaderBtn: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  modalHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  modalTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  modalBody: {
    flex: 1,
  },
  zoomScrollView: {
    flex: 1,
  },
  zoomScrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalImageWrap: {
    width: SCREEN_WIDTH - 24,
    aspectRatio: 0.7,
    maxHeight: SCREEN_HEIGHT * 0.48,
  },
  modalImage: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
  },
  annotationOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  annotationMarker: {
    position: "absolute",
  },
  markerTopCenter: {
    top: "4%",
    left: "40%",
    right: "40%",
    alignItems: "center",
  },
  markerDot: {
    width: 20,
    height: 6,
    borderRadius: 3,
    opacity: 0.8,
  },
  markerTopLeft: {
    top: "3%",
    left: "5%",
  },
  markerTopRight: {
    top: "3%",
    right: "5%",
  },
  markerBottomLeft: {
    bottom: "3%",
    left: "5%",
  },
  markerBottomRight: {
    bottom: "3%",
    right: "5%",
  },
  markerCorner: {
    width: 16,
    height: 16,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: "#F59E0B",
    borderTopLeftRadius: 4,
    opacity: 0.85,
  },
  markerLeftEdge: {
    left: "2%",
    top: "40%",
    bottom: "40%",
    justifyContent: "center",
  },
  markerRightEdge: {
    right: "2%",
    top: "40%",
    bottom: "40%",
    justifyContent: "center",
  },
  markerEdge: {
    width: 4,
    height: 30,
    borderRadius: 2,
    opacity: 0.7,
  },
  annotationPanel: {
    maxHeight: SCREEN_HEIGHT * 0.3,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  annotationScroll: {
    flex: 1,
  },
  annotationScrollContent: {
    gap: 8,
    paddingBottom: 4,
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    paddingBottom: 16,
    paddingTop: 8,
    paddingHorizontal: 40,
  },
  modalTab: {
    flex: 1,
    paddingVertical: 11,
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
