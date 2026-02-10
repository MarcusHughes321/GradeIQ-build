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
import Colors from "@/constants/colors";
import { getGradings, updateGrading } from "@/lib/storage";
import type { SavedGrading, GradingResult, CenteringMeasurement, CardBounds } from "@/lib/types";
import { apiRequest } from "@/lib/query-client";
import GradeCircle from "@/components/GradeCircle";
import CompanyCard from "@/components/CompanyCard";
import CenteringCard from "@/components/CenteringCard";
import CenteringTool from "@/components/CenteringTool";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

function getGradeColor(grade: number): string {
  if (grade >= 9.5) return "#10B981";
  if (grade >= 9) return "#34D399";
  if (grade >= 8) return "#F59E0B";
  if (grade >= 7) return "#FB923C";
  return "#EF4444";
}

interface AreaAnnotation {
  area: string;
  icon: string;
  grade: number;
  notes: string;
}

function getAnnotations(result: GradingResult): AreaAnnotation[] {
  const bgs = result.beckett;
  return [
    {
      area: "Centering",
      icon: "scan-outline",
      grade: bgs.centering.grade,
      notes: bgs.centering.notes || result.psa.centering,
    },
    {
      area: "Corners",
      icon: "resize-outline",
      grade: bgs.corners.grade,
      notes: bgs.corners.notes || result.psa.corners,
    },
    {
      area: "Edges",
      icon: "remove-outline",
      grade: bgs.edges.grade,
      notes: bgs.edges.notes || result.psa.edges,
    },
    {
      area: "Surface",
      icon: "layers-outline",
      grade: bgs.surface.grade,
      notes: bgs.surface.notes || result.psa.surface,
    },
  ];
}

export default function ResultsScreen() {
  const insets = useSafeAreaInsets();
  const { gradingId } = useLocalSearchParams<{ gradingId: string }>();
  const [grading, setGrading] = useState<SavedGrading | null>(null);
  const [showFront, setShowFront] = useState(true);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [viewerShowFront, setViewerShowFront] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [centeringToolVisible, setCenteringToolVisible] = useState(false);
  const [originalCentering, setOriginalCentering] = useState<CenteringMeasurement | null>(null);
  const zoomScrollRef = useRef<ScrollView>(null);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

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

  const detectBoundsForImage = async (imageUri: string): Promise<CardBounds | null> => {
    try {
      const base64 = await getBase64FromUri(imageUri);
      const resp = await apiRequest("POST", "/api/detect-bounds", { image: base64 });
      const bounds = await resp.json();
      if (bounds && bounds.leftPercent !== undefined) return bounds;
      return null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    loadGrading();
  }, [gradingId]);

  const loadGrading = async () => {
    const all = await getGradings();
    const found = all.find((g) => g.id === gradingId);
    if (found) {
      let needsUpdate = false;
      let updatedResult = { ...found.result };

      if (found.result.centering && !found.result.psa?.centeringGrade) {
        const c = found.result.centering;
        const frontWorst = Math.max(c.frontLeftRight, c.frontTopBottom);
        const backWorst = Math.max(c.backLeftRight, c.backTopBottom);

        let psaCG: number;
        if (frontWorst <= 55 && backWorst <= 75) psaCG = 10;
        else if (frontWorst <= 60 && backWorst <= 75) psaCG = 9;
        else if (frontWorst <= 65 && backWorst <= 90) psaCG = 8;
        else if (frontWorst <= 70 && backWorst <= 90) psaCG = 7;
        else psaCG = 6;

        let bgsCG: number;
        if (frontWorst <= 50 && backWorst <= 50) bgsCG = 10;
        else if (frontWorst <= 55 && backWorst <= 55) bgsCG = 9.5;
        else if (frontWorst <= 60 && backWorst <= 60) bgsCG = 9;
        else if (frontWorst <= 65 && backWorst <= 65) bgsCG = 8.5;
        else if (frontWorst <= 70 && backWorst <= 70) bgsCG = 8;
        else bgsCG = 7;

        let aceCG: number;
        if (frontWorst <= 60 && backWorst <= 60) aceCG = 10;
        else if (frontWorst <= 65 && backWorst <= 65) aceCG = 9;
        else if (frontWorst <= 70 && backWorst <= 70) aceCG = 8;
        else aceCG = 7;

        updatedResult.psa = { ...updatedResult.psa, centeringGrade: psaCG };
        if (updatedResult.beckett) {
          updatedResult.beckett = {
            ...updatedResult.beckett,
            centering: { ...updatedResult.beckett.centering, grade: bgsCG },
          };
        }
        if (updatedResult.ace) {
          updatedResult.ace = {
            ...updatedResult.ace,
            centering: { ...updatedResult.ace.centering, grade: aceCG },
          };
        }
        needsUpdate = true;
      }

      const updatedGrading = { ...found, result: updatedResult };
      setGrading(updatedGrading);
      if (!originalCentering && updatedResult.centering) {
        setOriginalCentering({ ...updatedResult.centering });
      }
      if (needsUpdate) {
        updateGrading(found.id, { result: updatedResult });
      }
      if (!updatedResult.frontCardBounds || !updatedResult.backCardBounds) {
        detectBoundsForOldCard(updatedGrading);
      }
    }
  };

  const detectBoundsForOldCard = async (g: SavedGrading) => {
    try {
      const [frontBounds, backBounds] = await Promise.all([
        g.result.frontCardBounds ? Promise.resolve(g.result.frontCardBounds) : detectBoundsForImage(g.frontImage),
        g.result.backCardBounds ? Promise.resolve(g.result.backCardBounds) : detectBoundsForImage(g.backImage),
      ]);
      if (frontBounds || backBounds) {
        const updatedResult = {
          ...g.result,
          frontCardBounds: frontBounds || { leftPercent: 3, topPercent: 2, rightPercent: 97, bottomPercent: 98 },
          backCardBounds: backBounds || { leftPercent: 3, topPercent: 2, rightPercent: 97, bottomPercent: 98 },
        };
        const updatedGrading = { ...g, result: updatedResult };
        setGrading(updatedGrading);
        await updateGrading(g.id, { result: updatedResult });
      }
    } catch {}
  };

  const openImageViewer = (front: boolean) => {
    setViewerShowFront(front);
    setShowAnnotations(true);
    setSelectedArea(null);
    setImageViewerVisible(true);
  };

  const closeImageViewer = () => {
    setImageViewerVisible(false);
    setSelectedArea(null);
  };

  const handleCenteringChange = async (newCentering: CenteringMeasurement) => {
    if (!grading) return;
    const c = newCentering;
    const frontWorst = Math.max(c.frontLeftRight, c.frontTopBottom);
    const backWorst = Math.max(c.backLeftRight, c.backTopBottom);

    const calcPsaCentering = (): number => {
      if (frontWorst <= 55 && backWorst <= 75) return 10;
      if (frontWorst <= 60 && backWorst <= 75) return 9;
      if (frontWorst <= 65 && backWorst <= 90) return 8;
      if (frontWorst <= 70 && backWorst <= 90) return 7;
      return 6;
    };
    const calcBgsCentering = (): number => {
      if (frontWorst <= 50 && backWorst <= 50) return 10;
      if (frontWorst <= 55 && backWorst <= 55) return 9.5;
      if (frontWorst <= 60 && backWorst <= 60) return 9;
      if (frontWorst <= 65 && backWorst <= 65) return 8.5;
      if (frontWorst <= 70 && backWorst <= 70) return 8;
      return 7;
    };
    const calcAceCentering = (): number => {
      if (frontWorst <= 60 && backWorst <= 60) return 10;
      if (frontWorst <= 65 && backWorst <= 65) return 9;
      if (frontWorst <= 70 && backWorst <= 70) return 8;
      return 7;
    };

    const prevResult = grading.result;
    const centeringNote = `Front: ${c.frontLeftRight}/${100 - c.frontLeftRight} LR, ${c.frontTopBottom}/${100 - c.frontTopBottom} TB. Back: ${c.backLeftRight}/${100 - c.backLeftRight} LR, ${c.backTopBottom}/${100 - c.backTopBottom} TB.`;

    const psaCenteringGrade = calcPsaCentering();
    const bgsCenteringGrade = calcBgsCentering();
    const aceCenteringGrade = calcAceCentering();

    const psaNonCenteringMax = (() => {
      const minOther = Math.min(
        prevResult.beckett.corners.grade,
        prevResult.beckett.edges.grade,
        prevResult.beckett.surface.grade
      );
      if (minOther >= 9.5) return 10;
      if (minOther >= 8.5) return 9;
      if (minOther >= 7.5) return 8;
      if (minOther >= 6.5) return 7;
      if (minOther >= 5.5) return 6;
      return Math.max(1, Math.round(minOther));
    })();

    const bgsAvg = (bgsCenteringGrade + prevResult.beckett.corners.grade + prevResult.beckett.edges.grade + prevResult.beckett.surface.grade) / 4;
    const aceAvg = (aceCenteringGrade + prevResult.ace.corners.grade + prevResult.ace.edges.grade + prevResult.ace.surface.grade) / 4;
    const roundHalf = (v: number) => Math.round(v * 2) / 2;

    const VALID_PSA = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10];
    const psaFinal = Math.min(psaCenteringGrade, psaNonCenteringMax);
    const psaGrade = VALID_PSA.reduce((prev, curr) =>
      Math.abs(curr - psaFinal) < Math.abs(prev - psaFinal) ? curr : prev
    );

    const updatedResult: GradingResult = {
      ...prevResult,
      centering: newCentering,
      psa: {
        ...prevResult.psa,
        grade: psaGrade,
        centeringGrade: psaCenteringGrade,
        centering: centeringNote,
      },
      beckett: {
        ...prevResult.beckett,
        centering: { grade: bgsCenteringGrade, notes: centeringNote },
        overallGrade: roundHalf(bgsAvg),
      },
      ace: {
        ...prevResult.ace,
        centering: { grade: aceCenteringGrade, notes: centeringNote },
        overallGrade: roundHalf(aceAvg),
      },
    };

    const updatedGrading = { ...grading, result: updatedResult };
    setGrading(updatedGrading);
    await updateGrading(grading.id, { result: updatedResult });
  };

  if (!grading) {
    return (
      <View style={[styles.loading, { paddingTop: insets.top + webTopInset }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const { result } = grading;
  const annotations = getAnnotations(result);
  const selectedAnnotation = annotations.find((a) => a.area === selectedArea);

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
            <Text style={styles.condition} numberOfLines={2}>{result.overallCondition}</Text>
          </View>
        </View>

        <View style={styles.gradesSummaryRow}>
          <GradeCircle grade={result.psa.grade} size={58} color={Colors.cardPSA} label="PSA" />
          <GradeCircle grade={result.beckett.overallGrade} size={58} color={Colors.cardBeckett} label="BGS" />
          <GradeCircle grade={result.ace.overallGrade} size={58} color={Colors.cardAce} label="ACE" />
        </View>

        <View style={styles.imageRow}>
          <Pressable
            style={({ pressed }) => [styles.imageThumb, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
            onPress={() => openImageViewer(true)}
          >
            <Image source={{ uri: grading.frontImage }} style={styles.imageThumbImg} contentFit="cover" />
            <View style={styles.imageThumbLabel}>
              <Text style={styles.imageThumbText}>Front</Text>
              <Ionicons name="expand-outline" size={12} color="#fff" />
            </View>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.imageThumb, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
            onPress={() => openImageViewer(false)}
          >
            <Image source={{ uri: grading.backImage }} style={styles.imageThumbImg} contentFit="cover" />
            <View style={styles.imageThumbLabel}>
              <Text style={styles.imageThumbText}>Back</Text>
              <Ionicons name="expand-outline" size={12} color="#fff" />
            </View>
          </Pressable>
        </View>

        <CenteringCard
          centering={result.centering || { frontLeftRight: 50, frontTopBottom: 50, backLeftRight: 50, backTopBottom: 50 }}
          onOpenTool={() => setCenteringToolVisible(true)}
        />

        <CompanyCard company="PSA" grade={result.psa} color={Colors.cardPSA} />
        <CompanyCard company="Beckett" grade={result.beckett} color={Colors.cardBeckett} />
        <CompanyCard company="Ace" grade={result.ace} color={Colors.cardAce} />

        <View style={styles.disclaimer}>
          <Ionicons name="information-circle" size={14} color={Colors.textMuted} />
          <Text style={styles.disclaimerText}>
            AI estimates based on photo analysis. Actual grades may differ.
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
                onPress={() => { setShowAnnotations(!showAnnotations); setSelectedArea(null); }}
                style={({ pressed }) => [styles.modalHeaderBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Ionicons
                  name={showAnnotations ? "eye" : "eye-off-outline"}
                  size={22}
                  color={showAnnotations ? Colors.primary : "rgba(255,255,255,0.5)"}
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
                <View style={styles.annotationOverlay} pointerEvents="box-none">
                  <Pressable
                    style={[styles.areaLabel, styles.areaLabelCentering, selectedArea === "Centering" && styles.areaLabelSelected]}
                    onPress={() => setSelectedArea(selectedArea === "Centering" ? null : "Centering")}
                  >
                    <View style={[styles.areaLabelDot, { backgroundColor: getGradeColor(result.beckett.centering.grade) }]} />
                    <Text style={styles.areaLabelText}>Centering</Text>
                    <Text style={[styles.areaLabelGrade, { color: getGradeColor(result.beckett.centering.grade) }]}>
                      {result.beckett.centering.grade}
                    </Text>
                  </Pressable>

                  <View style={styles.cornerIndicators} pointerEvents="none">
                    <View style={[styles.cornerBracket, styles.cornerTL, { borderColor: getGradeColor(result.beckett.corners.grade) }]} />
                    <View style={[styles.cornerBracket, styles.cornerTR, { borderColor: getGradeColor(result.beckett.corners.grade) }]} />
                    <View style={[styles.cornerBracket, styles.cornerBL, { borderColor: getGradeColor(result.beckett.corners.grade) }]} />
                    <View style={[styles.cornerBracket, styles.cornerBR, { borderColor: getGradeColor(result.beckett.corners.grade) }]} />
                  </View>

                  <Pressable
                    style={[styles.areaLabel, styles.areaLabelCorners, selectedArea === "Corners" && styles.areaLabelSelected]}
                    onPress={() => setSelectedArea(selectedArea === "Corners" ? null : "Corners")}
                  >
                    <View style={[styles.areaLabelDot, { backgroundColor: getGradeColor(result.beckett.corners.grade) }]} />
                    <Text style={styles.areaLabelText}>Corners</Text>
                    <Text style={[styles.areaLabelGrade, { color: getGradeColor(result.beckett.corners.grade) }]}>
                      {result.beckett.corners.grade}
                    </Text>
                  </Pressable>

                  <View style={styles.edgeIndicators} pointerEvents="none">
                    <View style={[styles.edgeBar, styles.edgeLeft, { backgroundColor: getGradeColor(result.beckett.edges.grade) }]} />
                    <View style={[styles.edgeBar, styles.edgeRight, { backgroundColor: getGradeColor(result.beckett.edges.grade) }]} />
                  </View>

                  <Pressable
                    style={[styles.areaLabel, styles.areaLabelEdges, selectedArea === "Edges" && styles.areaLabelSelected]}
                    onPress={() => setSelectedArea(selectedArea === "Edges" ? null : "Edges")}
                  >
                    <View style={[styles.areaLabelDot, { backgroundColor: getGradeColor(result.beckett.edges.grade) }]} />
                    <Text style={styles.areaLabelText}>Edges</Text>
                    <Text style={[styles.areaLabelGrade, { color: getGradeColor(result.beckett.edges.grade) }]}>
                      {result.beckett.edges.grade}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[styles.areaLabel, styles.areaLabelSurface, selectedArea === "Surface" && styles.areaLabelSelected]}
                    onPress={() => setSelectedArea(selectedArea === "Surface" ? null : "Surface")}
                  >
                    <View style={[styles.areaLabelDot, { backgroundColor: getGradeColor(result.beckett.surface.grade) }]} />
                    <Text style={styles.areaLabelText}>Surface</Text>
                    <Text style={[styles.areaLabelGrade, { color: getGradeColor(result.beckett.surface.grade) }]}>
                      {result.beckett.surface.grade}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          </ScrollView>

          {selectedAnnotation && (
            <View style={styles.notePopup}>
              <View style={styles.notePopupHeader}>
                <Ionicons name={selectedAnnotation.icon as any} size={16} color={getGradeColor(selectedAnnotation.grade)} />
                <Text style={styles.notePopupArea}>{selectedAnnotation.area}</Text>
                <View style={[styles.notePopupBadge, { backgroundColor: getGradeColor(selectedAnnotation.grade) + "30" }]}>
                  <Text style={[styles.notePopupGrade, { color: getGradeColor(selectedAnnotation.grade) }]}>
                    {selectedAnnotation.grade}/10
                  </Text>
                </View>
                <Pressable onPress={() => setSelectedArea(null)} style={styles.notePopupClose}>
                  <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.4)" />
                </Pressable>
              </View>
              <Text style={styles.notePopupText}>{selectedAnnotation.notes}</Text>
            </View>
          )}

          {!selectedAnnotation && showAnnotations && (
            <View style={styles.annotationHint}>
              <Ionicons name="hand-left-outline" size={14} color="rgba(255,255,255,0.5)" />
              <Text style={styles.annotationHintText}>Tap labels on the card to see details</Text>
            </View>
          )}

          <View style={styles.modalFooter}>
            <Pressable
              style={({ pressed }) => [
                styles.modalTab,
                viewerShowFront && styles.modalTabActive,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={() => { setViewerShowFront(true); setSelectedArea(null); }}
            >
              <Text style={[styles.modalTabText, viewerShowFront && styles.modalTabTextActive]}>Front</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.modalTab,
                !viewerShowFront && styles.modalTabActive,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={() => { setViewerShowFront(false); setSelectedArea(null); }}
            >
              <Text style={[styles.modalTabText, !viewerShowFront && styles.modalTabTextActive]}>Back</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={centeringToolVisible}
        animationType="slide"
        onRequestClose={() => setCenteringToolVisible(false)}
      >
        <CenteringTool
          frontImage={grading.frontImage}
          backImage={grading.backImage}
          centering={result.centering || { frontLeftRight: 50, frontTopBottom: 50, backLeftRight: 50, backTopBottom: 50 }}
          originalCentering={originalCentering || result.centering || { frontLeftRight: 50, frontTopBottom: 50, backLeftRight: 50, backTopBottom: 50 }}
          frontCardBounds={result.frontCardBounds}
          backCardBounds={result.backCardBounds}
          onSave={(newCentering) => {
            handleCenteringChange(newCentering);
          }}
          onClose={() => setCenteringToolVisible(false)}
        />
      </Modal>
    </View>
  );
}

const IMG_WIDTH = SCREEN_WIDTH - 32;
const IMG_HEIGHT = IMG_WIDTH / 0.714;
const MAX_IMG_HEIGHT = SCREEN_HEIGHT * 0.52;
const FINAL_IMG_HEIGHT = Math.min(IMG_HEIGHT, MAX_IMG_HEIGHT);

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
    paddingHorizontal: 16,
    gap: 12,
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
  gradesSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
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
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 8,
    alignItems: "center",
  },
  disclaimerText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 15,
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
  zoomScrollView: {
    flex: 1,
  },
  zoomScrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalImageWrap: {
    width: IMG_WIDTH,
    height: FINAL_IMG_HEIGHT,
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
  areaLabel: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
  },
  areaLabelSelected: {
    borderColor: Colors.primary,
    backgroundColor: "rgba(0,0,0,0.88)",
  },
  areaLabelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  areaLabelText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#fff",
  },
  areaLabelGrade: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  areaLabelCentering: {
    top: "6%",
    alignSelf: "center",
    left: "28%",
    right: "28%",
    justifyContent: "center",
  },
  areaLabelCorners: {
    top: "16%",
    right: "4%",
  },
  areaLabelEdges: {
    left: "4%",
    top: "50%",
  },
  areaLabelSurface: {
    bottom: "12%",
    alignSelf: "center",
    left: "28%",
    right: "28%",
    justifyContent: "center",
  },
  cornerIndicators: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cornerBracket: {
    position: "absolute",
    width: 24,
    height: 24,
  },
  cornerTL: {
    top: "2%",
    left: "3%",
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    top: "2%",
    right: "3%",
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 6,
  },
  cornerBL: {
    bottom: "2%",
    left: "3%",
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    bottom: "2%",
    right: "3%",
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 6,
  },
  edgeIndicators: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  edgeBar: {
    position: "absolute",
    width: 5,
    borderRadius: 3,
    opacity: 0.85,
  },
  edgeLeft: {
    left: "1%",
    top: "30%",
    height: "40%",
  },
  edgeRight: {
    right: "1%",
    top: "30%",
    height: "40%",
  },
  notePopup: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "rgba(30,30,30,0.95)",
    borderRadius: 16,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  notePopupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notePopupArea: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
    flex: 1,
  },
  notePopupBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  notePopupGrade: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  notePopupClose: {
    marginLeft: 4,
  },
  notePopupText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    lineHeight: 19,
  },
  annotationHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  annotationHintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    paddingBottom: 16,
    paddingTop: 6,
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
