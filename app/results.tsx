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
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getGradings, updateGrading } from "@/lib/storage";
import type { SavedGrading, GradingResult, CenteringMeasurement, CardBounds, CardValueEstimate, DefectMarker } from "@/lib/types";
import { apiRequest } from "@/lib/query-client";
import GradeCircle from "@/components/GradeCircle";
import CompanyCard from "@/components/CompanyCard";
import CenteringCard from "@/components/CenteringCard";
import CenteringTool from "@/components/CenteringTool";
import CompanyLabel from "@/components/CompanyLabel";
import DefectOverlay from "@/components/DefectOverlay";
import { useSettings } from "@/lib/settings-context";
import { useSubscription } from "@/lib/subscription";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const SEVERITY_COLORS_MAP: Record<string, string> = {
  minor: "#F59E0B",
  moderate: "#FB923C",
  major: "#EF4444",
};

function getGradeColor(grade: number): string {
  if (grade >= 9.5) return "#10B981";
  if (grade >= 9) return "#34D399";
  if (grade >= 8) return "#F59E0B";
  if (grade >= 7) return "#FB923C";
  return "#EF4444";
}

function getGradientColor(grade: number, maxGrade: number = 10): string {
  const ratio = Math.max(0, Math.min(1, (grade - 1) / (maxGrade - 1)));
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

function getGradeSummary(psa: number, bgs: number, ace: number): string {
  const avg = (psa + bgs + ace) / 3;
  if (avg >= 9.5) return "Exceptional condition. This card is in pristine, gem mint shape across all grading standards.";
  if (avg >= 9) return "Outstanding condition. This card grades extremely well with only the most minor imperfections.";
  if (avg >= 8) return "Great condition. This card shows well with minimal wear, suitable for most collections.";
  if (avg >= 7) return "Good condition. This card has some visible wear but remains attractive and collectible.";
  if (avg >= 6) return "Decent condition. Noticeable wear present, but the card retains its appeal for casual collectors.";
  return "Below average condition. This card shows significant wear and would benefit from careful handling.";
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
  const { settings } = useSettings();
  const enabledCompanies = settings.enabledCompanies;
  const { isSubscribed, isGateEnabled } = useSubscription();
  const [grading, setGrading] = useState<SavedGrading | null>(null);
  const [showFront, setShowFront] = useState(true);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [viewerShowFront, setViewerShowFront] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [centeringToolVisible, setCenteringToolVisible] = useState(false);
  const [originalCentering, setOriginalCentering] = useState<CenteringMeasurement | null>(null);
  const [cardValue, setCardValue] = useState<CardValueEstimate | null>(null);
  const [loadingValue, setLoadingValue] = useState(false);
  const [reAnalysing, setReAnalysing] = useState(false);
  const [reAnalyseStage, setReAnalyseStage] = useState("");
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

  const fetchCardValue = async (result: GradingResult) => {
    if (result.cardValue) {
      setCardValue(result.cardValue);
      return;
    }
    setLoadingValue(true);
    try {
      const resp = await apiRequest("POST", "/api/card-value", {
        cardName: result.cardName,
        setName: result.setName || result.setInfo,
        setNumber: result.setNumber,
        psaGrade: result.psa.grade,
        bgsGrade: result.beckett.overallGrade,
        aceGrade: result.ace.overallGrade,
        tagGrade: result.tag?.overallGrade,
        cgcGrade: result.cgc?.grade,
      });
      const data = await resp.json();
      setCardValue(data);
      if (grading) {
        const updatedResult = { ...grading.result, cardValue: data };
        await updateGrading(grading.id, { result: updatedResult });
        setGrading({ ...grading, result: updatedResult });
      }
    } catch {
      setCardValue({
        psaValue: "No value data found",
        bgsValue: "No value data found",
        aceValue: "No value data found",
        tagValue: "No value data found",
        cgcValue: "No value data found",
        rawValue: "No value data found",
        source: "Error fetching values",
      });
    } finally {
      setLoadingValue(false);
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
      const hasFrontBounds = updatedResult.frontCardBounds &&
        updatedResult.frontCardBounds.leftPercent > 1 &&
        updatedResult.frontCardBounds.rightPercent < 99 &&
        (updatedResult.frontCardBounds.rightPercent - updatedResult.frontCardBounds.leftPercent) < 95;
      const hasBackBounds = updatedResult.backCardBounds &&
        updatedResult.backCardBounds.leftPercent > 1 &&
        updatedResult.backCardBounds.rightPercent < 99 &&
        (updatedResult.backCardBounds.rightPercent - updatedResult.backCardBounds.leftPercent) < 95;

      if (!hasFrontBounds || !hasBackBounds) {
        detectBoundsForOldCard(updatedGrading, !hasFrontBounds, !hasBackBounds);
      }
      fetchCardValue(updatedResult);
    }
  };

  const detectBoundsForOldCard = async (g: SavedGrading, needFront: boolean, needBack: boolean) => {
    try {
      const [frontBounds, backBounds] = await Promise.all([
        needFront ? detectBoundsForImage(g.frontImage) : Promise.resolve(null),
        needBack ? detectBoundsForImage(g.backImage) : Promise.resolve(null),
      ]);
      if (frontBounds || backBounds) {
        const updatedResult = {
          ...g.result,
          frontCardBounds: (needFront && frontBounds) ? frontBounds : g.result.frontCardBounds || { leftPercent: 3, topPercent: 2, rightPercent: 97, bottomPercent: 98 },
          backCardBounds: (needBack && backBounds) ? backBounds : g.result.backCardBounds || { leftPercent: 3, topPercent: 2, rightPercent: 97, bottomPercent: 98 },
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

  const handleReAnalyse = async () => {
    if (!grading || reAnalysing) return;
    setReAnalysing(true);
    setReAnalyseStage("Preparing images...");
    try {
      const [frontBase64, backBase64] = await Promise.all([
        getBase64FromUri(grading.frontImage),
        getBase64FromUri(grading.backImage),
      ]);
      setReAnalyseStage("Analysing card condition...");
      const stageTimer = setTimeout(() => setReAnalyseStage("Grading corners, edges & surface..."), 4000);
      const stageTimer2 = setTimeout(() => setReAnalyseStage("Calculating grades..."), 8000);
      const stageTimer3 = setTimeout(() => setReAnalyseStage("Almost done..."), 12000);
      const resp = await apiRequest("POST", "/api/regrade-card", {
        frontImage: frontBase64,
        backImage: backBase64,
        cardName: grading.result.cardName,
        setName: grading.result.setName,
        setNumber: grading.result.setNumber,
      });
      clearTimeout(stageTimer);
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);
      setReAnalyseStage("Updating results...");
      const newResult: GradingResult = await resp.json();
      const updatedGrading = { ...grading, result: newResult };
      setGrading(updatedGrading);
      await updateGrading(grading.id, { result: newResult });
      setCardValue(null);
      fetchCardValue(newResult);
    } catch (err) {
      console.error("Re-analysis failed:", err);
    } finally {
      setReAnalysing(false);
      setReAnalyseStage("");
    }
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
    const calcTagCentering = (): number => {
      if (frontWorst <= 55 && backWorst <= 75) return 10;
      if (frontWorst <= 60 && backWorst <= 80) return 9;
      if (frontWorst <= 65 && backWorst <= 85) return 8.5;
      if (frontWorst <= 70 && backWorst <= 90) return 8;
      return 7;
    };
    const calcCgcCentering = (): number => {
      if (frontWorst <= 50 && backWorst <= 55) return 10;
      if (frontWorst <= 55 && backWorst <= 75) return 10;
      if (frontWorst <= 60 && backWorst <= 80) return 9.5;
      if (frontWorst <= 65 && backWorst <= 85) return 9;
      if (frontWorst <= 70 && backWorst <= 90) return 8.5;
      return 8;
    };

    const prevResult = grading.result;
    const centeringNote = `Front: ${c.frontLeftRight}/${100 - c.frontLeftRight} LR, ${c.frontTopBottom}/${100 - c.frontTopBottom} TB. Back: ${c.backLeftRight}/${100 - c.backLeftRight} LR, ${c.backTopBottom}/${100 - c.backTopBottom} TB.`;

    const psaCenteringGrade = calcPsaCentering();
    const bgsCenteringGrade = calcBgsCentering();
    const aceCenteringGrade = calcAceCentering();
    const tagCenteringGrade = calcTagCentering();
    const cgcCenteringGrade = calcCgcCentering();

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
    const roundHalf = (v: number) => Math.round(v * 2) / 2;

    const aceGrades = [aceCenteringGrade, prevResult.ace.corners.grade, prevResult.ace.edges.grade, prevResult.ace.surface.grade];
    const aceCount10 = aceGrades.filter(g => g === 10).length;
    const aceCount9 = aceGrades.filter(g => g === 9).length;
    let aceOverall: number;
    if (aceCount10 >= 3 && aceCount9 >= 1 && aceCenteringGrade === 10) {
      aceOverall = 10;
    } else {
      aceOverall = Math.round(aceGrades.reduce((a, b) => a + b, 0) / 4);
    }

    const VALID_PSA = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10];
    const psaFinal = Math.min(psaCenteringGrade, psaNonCenteringMax);
    const psaGrade = VALID_PSA.reduce((prev, curr) =>
      Math.abs(curr - psaFinal) < Math.abs(prev - psaFinal) ? curr : prev
    );

    const tagGrades = prevResult.tag ? [tagCenteringGrade, prevResult.tag.corners.grade, prevResult.tag.edges.grade, prevResult.tag.surface.grade] : [];
    const tagOverall = tagGrades.length > 0 ? roundHalf(tagGrades.reduce((a, b) => a + b, 0) / 4) : 0;

    const VALID_CGC = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
    const cgcSubGrades = prevResult.cgc ? (() => {
      const parseGrade = (s: string): number => {
        const m = s.match(/(\d+\.?\d*)/);
        return m ? parseFloat(m[1]) : 9;
      };
      return [cgcCenteringGrade, parseGrade(prevResult.cgc.corners), parseGrade(prevResult.cgc.edges), parseGrade(prevResult.cgc.surface)];
    })() : [];
    const cgcRawAvg = cgcSubGrades.length > 0 ? cgcSubGrades.reduce((a, b) => a + b, 0) / 4 : 0;
    const cgcGrade = cgcSubGrades.length > 0 ? VALID_CGC.reduce((prev, curr) =>
      Math.abs(curr - cgcRawAvg) < Math.abs(prev - cgcRawAvg) ? curr : prev
    ) : prevResult.cgc?.grade ?? 0;

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
        overallGrade: aceOverall,
      },
      ...(prevResult.tag ? {
        tag: {
          ...prevResult.tag,
          centering: { grade: tagCenteringGrade, notes: centeringNote },
          overallGrade: tagOverall,
        },
      } : {}),
      ...(prevResult.cgc ? {
        cgc: {
          ...prevResult.cgc,
          grade: cgcGrade,
          centering: centeringNote,
        },
      } : {}),
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
  const displaySetName = result.setName || result.setInfo || "";
  const displaySetNumber = result.setNumber || "";
  const gradeSummary = getGradeSummary(result.psa.grade, result.beckett.overallGrade, result.ace.overallGrade);

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/");
            }
          }}
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
            {result.defects && result.defects.length > 0 && (
              <DefectOverlay defects={result.defects} side={showFront ? "front" : "back"} />
            )}
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
            {displaySetName ? (
              <Text style={styles.setName}>{displaySetName}</Text>
            ) : null}
            {displaySetNumber ? (
              <View style={styles.setNumberBadge}>
                <Text style={styles.setNumberText}>{displaySetNumber}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Ionicons name="clipboard-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.summaryTitle}>Condition Summary</Text>
          </View>
          <Text style={styles.summaryText}>{result.overallCondition || gradeSummary}</Text>
        </View>

        {result.defects && result.defects.length > 0 && (
          <View style={styles.defectsCard}>
            <View style={styles.summaryHeader}>
              <Ionicons name="alert-circle-outline" size={16} color="#F59E0B" />
              <Text style={styles.summaryTitle}>Defects Found ({result.defects.length})</Text>
            </View>
            {result.defects.map((d, i) => (
              <View key={i} style={styles.defectRow}>
                <View style={[styles.defectDot, { backgroundColor: SEVERITY_COLORS_MAP[d.severity] || "#F59E0B" }]} />
                <View style={styles.defectInfo}>
                  <Text style={styles.defectDesc}>{d.description}</Text>
                  <Text style={styles.defectMeta}>
                    {d.type.charAt(0).toUpperCase() + d.type.slice(1)} · {d.side.charAt(0).toUpperCase() + d.side.slice(1)} · {d.severity}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.overallGradesCard}>
          <Text style={styles.sectionTitle}>Overall Grades</Text>
          <View style={styles.gradeChips}>
            {enabledCompanies.includes("PSA") && (
              <>
                <View style={styles.gradeChip}>
                  <CompanyLabel company="PSA" fontSize={11} fontFamily="Inter_600SemiBold" />
                  <Text style={[styles.gradeChipValue, { color: getGradientColor(result.psa.grade) }]}>
                    {result.psa.grade % 1 === 0 ? result.psa.grade.toString() : result.psa.grade.toFixed(1)}
                  </Text>
                  <View style={[styles.gradeBar, { backgroundColor: getGradientColor(result.psa.grade) }]} />
                </View>
                {(enabledCompanies.includes("Beckett") || enabledCompanies.includes("Ace") || enabledCompanies.includes("TAG") || enabledCompanies.includes("CGC")) && <View style={styles.gradeChipDivider} />}
              </>
            )}
            {enabledCompanies.includes("Beckett") && (
              <>
                <View style={styles.gradeChip}>
                  <CompanyLabel company="BGS" fontSize={11} fontFamily="Inter_600SemiBold" />
                  <Text style={[styles.gradeChipValue, { color: getGradientColor(result.beckett.overallGrade) }]}>
                    {result.beckett.overallGrade % 1 === 0 ? result.beckett.overallGrade.toString() : result.beckett.overallGrade.toFixed(1)}
                  </Text>
                  <View style={[styles.gradeBar, { backgroundColor: getGradientColor(result.beckett.overallGrade) }]} />
                </View>
                {(enabledCompanies.includes("Ace") || enabledCompanies.includes("TAG") || enabledCompanies.includes("CGC")) && <View style={styles.gradeChipDivider} />}
              </>
            )}
            {enabledCompanies.includes("Ace") && (
              <>
                <View style={styles.gradeChip}>
                  <CompanyLabel company="ACE" fontSize={11} fontFamily="Inter_600SemiBold" />
                  <Text style={[styles.gradeChipValue, { color: getGradientColor(result.ace.overallGrade) }]}>
                    {result.ace.overallGrade}
                  </Text>
                  <View style={[styles.gradeBar, { backgroundColor: getGradientColor(result.ace.overallGrade) }]} />
                </View>
                {(enabledCompanies.includes("TAG") || enabledCompanies.includes("CGC")) && <View style={styles.gradeChipDivider} />}
              </>
            )}
            {enabledCompanies.includes("TAG") && result.tag && (
              <>
                <View style={styles.gradeChip}>
                  <CompanyLabel company="TAG" fontSize={11} fontFamily="Inter_600SemiBold" />
                  <Text style={[styles.gradeChipValue, { color: getGradientColor(result.tag.overallGrade) }]}>
                    {result.tag.overallGrade % 1 === 0 ? result.tag.overallGrade.toString() : result.tag.overallGrade.toFixed(1)}
                  </Text>
                  <View style={[styles.gradeBar, { backgroundColor: getGradientColor(result.tag.overallGrade) }]} />
                </View>
                {enabledCompanies.includes("CGC") && <View style={styles.gradeChipDivider} />}
              </>
            )}
            {enabledCompanies.includes("CGC") && result.cgc && (
              <View style={styles.gradeChip}>
                <CompanyLabel company="CGC" fontSize={11} fontFamily="Inter_600SemiBold" />
                <Text style={[styles.gradeChipValue, { color: getGradientColor(result.cgc.grade) }]}>
                  {result.cgc.grade % 1 === 0 ? result.cgc.grade.toString() : result.cgc.grade.toFixed(1)}
                </Text>
                <View style={[styles.gradeBar, { backgroundColor: getGradientColor(result.cgc.grade) }]} />
              </View>
            )}
          </View>
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

        <View style={styles.valueCard}>
          <View style={styles.valueHeader}>
            <Ionicons name="pricetag-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.valueTitle}>Estimated Card Values</Text>
          </View>
          {isGateEnabled && !isSubscribed ? (
            <View style={{ overflow: "hidden" as const, borderRadius: 12 }}>
              <View style={styles.valueGrid}>
                <View style={styles.valueSectionHeader}>
                  <Text style={styles.valueSectionTitle}>Your Grade</Text>
                  <Text style={styles.valueSectionTitle}>In Grade 10</Text>
                </View>
                {enabledCompanies.includes("PSA") && (
                <View style={styles.valueRow}>
                  <View style={styles.valueLabelRow}><CompanyLabel company="PSA" fontSize={13} /><Text style={styles.valueLabel}> --</Text></View>
                  <Text style={styles.valueAmount}>£--</Text>
                  <Text style={styles.valueAmount10}>£--</Text>
                </View>
                )}
                {enabledCompanies.includes("Beckett") && (
                <View style={styles.valueRow}>
                  <View style={styles.valueLabelRow}><CompanyLabel company="BGS" fontSize={13} /><Text style={styles.valueLabel}> --</Text></View>
                  <Text style={styles.valueAmount}>£--</Text>
                  <Text style={styles.valueAmount10}>£--</Text>
                </View>
                )}
                {enabledCompanies.includes("Ace") && (
                <View style={styles.valueRow}>
                  <View style={styles.valueLabelRow}><CompanyLabel company="ACE" fontSize={13} /><Text style={styles.valueLabel}> --</Text></View>
                  <Text style={styles.valueAmount}>£--</Text>
                  <Text style={styles.valueAmount10}>£--</Text>
                </View>
                )}
                <View style={[styles.valueRow, styles.valueRowLast]}>
                  <Text style={styles.valueLabel}>Raw (Ungraded)</Text>
                  <Text style={styles.valueAmount}>£--</Text>
                  <Text style={styles.valueAmount10}>{" "}</Text>
                </View>
              </View>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => router.push("/paywall")}
              >
                <BlurView intensity={40} tint="dark" style={styles.proBlurOverlay}>
                  <View style={styles.proBlurContent}>
                    <Ionicons name="lock-closed" size={20} color="#F59E0B" />
                    <Text style={styles.proBlurTitle}>Pro Feature</Text>
                    <Text style={styles.proBlurSubtitle}>Upgrade to see market values</Text>
                  </View>
                </BlurView>
              </Pressable>
            </View>
          ) : loadingValue ? (
            <View style={styles.valueLoading}>
              <ActivityIndicator color={Colors.primary} size="small" />
              <Text style={styles.valueLoadingText}>Looking up values...</Text>
            </View>
          ) : cardValue ? (
            <View style={styles.valueGrid}>
              <View style={styles.valueSectionHeader}>
                <Text style={styles.valueSectionTitle}>Your Grade</Text>
                <Text style={styles.valueSectionTitle}>In Grade 10</Text>
              </View>
              {enabledCompanies.includes("PSA") && (
              <View style={styles.valueRow}>
                <View style={styles.valueLabelRow}><CompanyLabel company="PSA" fontSize={13} /><Text style={styles.valueLabel}> {result.psa.grade}</Text></View>
                <Text style={[styles.valueAmount, cardValue.psaValue.includes("No value") && styles.valueNA]}>
                  {cardValue.psaValue}
                </Text>
                <Text style={[styles.valueAmount10, cardValue.psa10Value?.includes("No value") && styles.valueNA]}>
                  {result.psa.grade === 10 ? "-" : cardValue.psa10Value || "-"}
                </Text>
              </View>
              )}
              {enabledCompanies.includes("Beckett") && (
              <View style={styles.valueRow}>
                <View style={styles.valueLabelRow}><CompanyLabel company="BGS" fontSize={13} /><Text style={styles.valueLabel}> {result.beckett.overallGrade}</Text></View>
                <Text style={[styles.valueAmount, cardValue.bgsValue.includes("No value") && styles.valueNA]}>
                  {cardValue.bgsValue}
                </Text>
                <Text style={[styles.valueAmount10, cardValue.bgs10Value?.includes("No value") && styles.valueNA]}>
                  {result.beckett.overallGrade === 10 ? "-" : cardValue.bgs10Value || "-"}
                </Text>
              </View>
              )}
              {enabledCompanies.includes("Ace") && (
              <View style={styles.valueRow}>
                <View style={styles.valueLabelRow}><CompanyLabel company="ACE" fontSize={13} /><Text style={styles.valueLabel}> {result.ace.overallGrade}</Text></View>
                <Text style={[styles.valueAmount, cardValue.aceValue.includes("No value") && styles.valueNA]}>
                  {cardValue.aceValue}
                </Text>
                <Text style={[styles.valueAmount10, cardValue.ace10Value?.includes("No value") && styles.valueNA]}>
                  {result.ace.overallGrade === 10 ? "-" : cardValue.ace10Value || "-"}
                </Text>
              </View>
              )}
              {enabledCompanies.includes("TAG") && (
              <View style={styles.valueRow}>
                <View style={styles.valueLabelRow}><CompanyLabel company="TAG" fontSize={13} /><Text style={styles.valueLabel}> {result.tag.overallGrade}</Text></View>
                <Text style={[styles.valueAmount, cardValue.tagValue?.includes("No value") && styles.valueNA]}>
                  {cardValue.tagValue || "-"}
                </Text>
                <Text style={[styles.valueAmount10, cardValue.tag10Value?.includes("No value") && styles.valueNA]}>
                  {result.tag.overallGrade === 10 ? "-" : cardValue.tag10Value || "-"}
                </Text>
              </View>
              )}
              {enabledCompanies.includes("CGC") && (
              <View style={styles.valueRow}>
                <View style={styles.valueLabelRow}><CompanyLabel company="CGC" fontSize={13} /><Text style={styles.valueLabel}> {result.cgc.grade}</Text></View>
                <Text style={[styles.valueAmount, cardValue.cgcValue?.includes("No value") && styles.valueNA]}>
                  {cardValue.cgcValue || "-"}
                </Text>
                <Text style={[styles.valueAmount10, cardValue.cgc10Value?.includes("No value") && styles.valueNA]}>
                  {result.cgc.grade === 10 ? "-" : cardValue.cgc10Value || "-"}
                </Text>
              </View>
              )}
              <View style={[styles.valueRow, styles.valueRowLast]}>
                <Text style={styles.valueLabel}>Raw (Ungraded)</Text>
                <Text style={[styles.valueAmount, cardValue.rawValue.includes("No value") && styles.valueNA]}>
                  {cardValue.rawValue}
                </Text>
                <Text style={styles.valueAmount10}>{" "}</Text>
              </View>
              <Text style={styles.valueSource}>{cardValue.source}</Text>
            </View>
          ) : (
            <Text style={styles.valueNA}>No value data found</Text>
          )}
        </View>

        <CenteringCard
          centering={result.centering || { frontLeftRight: 50, frontTopBottom: 50, backLeftRight: 50, backTopBottom: 50 }}
          onOpenTool={() => setCenteringToolVisible(true)}
          enabledCompanies={enabledCompanies}
        />

        {enabledCompanies.includes("PSA") && <CompanyCard company="PSA" grade={result.psa} color={Colors.cardPSA} />}
        {enabledCompanies.includes("Beckett") && <CompanyCard company="Beckett" grade={result.beckett} color={Colors.cardBeckett} />}
        {enabledCompanies.includes("Ace") && <CompanyCard company="Ace" grade={result.ace} color={Colors.cardAce} />}
        {enabledCompanies.includes("TAG") && result.tag && <CompanyCard company="TAG" grade={result.tag} color={Colors.cardTAG} />}
        {enabledCompanies.includes("CGC") && result.cgc && <CompanyCard company="CGC" grade={result.cgc} color={Colors.cardCGC} />}

        <View style={styles.disclaimer}>
          <Ionicons name="information-circle" size={14} color={Colors.textMuted} />
          <Text style={styles.disclaimerText}>
            AI estimates based on photo analysis. Actual grades and values may differ.
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

              {showAnnotations && result.defects && result.defects.length > 0 && (
                <DefectOverlay defects={result.defects} side={viewerShowFront ? "front" : "back"} />
              )}

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
                { opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={() => setViewerShowFront(true)}
            >
              <Text style={[styles.modalTabText, viewerShowFront && styles.modalTabTextActive]}>Front</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.modalTab,
                !viewerShowFront && styles.modalTabActive,
                { opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={() => setViewerShowFront(false)}
            >
              <Text style={[styles.modalTabText, !viewerShowFront && styles.modalTabTextActive]}>Back</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {reAnalysing && (
        <View style={styles.reAnalyseOverlay}>
          <View style={styles.reAnalyseBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.reAnalyseTitle}>Re-analysing card...</Text>
            <Text style={styles.reAnalyseSubtitle}>{reAnalyseStage || "Preparing..."}</Text>
          </View>
        </View>
      )}

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
          onClose={(wasStraightened) => {
            setCenteringToolVisible(false);
            if (wasStraightened) {
              handleReAnalyse();
            }
          }}
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
    justifyContent: "center",
  },
  cardName: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.text,
  },
  setName: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  setNumberBadge: {
    alignSelf: "flex-start",
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  setNumberText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 8,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  summaryText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
    lineHeight: 20,
  },
  defectsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.2)",
    gap: 10,
  },
  defectRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 10,
  },
  defectDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  defectInfo: {
    flex: 1,
    gap: 2,
  },
  defectDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
    lineHeight: 18,
  },
  defectMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: "capitalize" as const,
  },
  overallGradesCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 14,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  gradeChips: {
    flexDirection: "row",
    alignItems: "center",
  },
  gradeChip: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  gradeChipDivider: {
    width: 1,
    height: 50,
    backgroundColor: Colors.surfaceBorder,
  },
  gradeChipLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  gradeChipValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
  },
  gradeBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
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
  valueCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 12,
  },
  valueHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  valueTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  valueLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 12,
  },
  valueLoadingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  valueGrid: {
    gap: 0,
  },
  valueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  valueRowLast: {
    borderBottomWidth: 0,
  },
  valueSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  valueSectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: Colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  valueLabelRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    flex: 1,
  },
  valueLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  valueAmount: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: "#10B981",
    textAlign: "right" as const,
    flex: 1,
  },
  valueAmount10: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#F59E0B",
    textAlign: "right" as const,
    flex: 1,
  },
  valueNA: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
  },
  valueSource: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 6,
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
  reAnalyseOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    zIndex: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  reAnalyseBox: {
    alignItems: "center",
    gap: 12,
    padding: 32,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginHorizontal: 40,
  },
  reAnalyseTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  reAnalyseSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  proBlurOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
  },
  proBlurContent: {
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  proBlurTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#F59E0B",
  },
  proBlurSubtitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
  },
});
