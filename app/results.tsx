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
  TextInput,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getGradings, updateGrading, deleteGrading } from "@/lib/storage";
import type { SavedGrading, GradingResult, CenteringMeasurement, CardBounds, CardValueEstimate, DefectMarker } from "@/lib/types";
import { apiRequest } from "@/lib/query-client";
import GradeCircle from "@/components/GradeCircle";
import CompanyCard from "@/components/CompanyCard";
import CenteringCard from "@/components/CenteringCard";
import CenteringTool from "@/components/CenteringTool";
import CompanyLabel from "@/components/CompanyLabel";
import DefectOverlay from "@/components/DefectOverlay";
import ShareButton from "@/components/ShareCard";
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

function parsePrice(str: string | undefined | null): number | null {
  if (!str || str.includes("No value") || str === "-") return null;
  // Handle price ranges like "£125 - £148" or "$1,200 - $1,500"
  const rangeSep = str.match(/^(.+?)\s*[-–]\s*(.+)$/);
  if (rangeSep) {
    const lo = parseFloat(rangeSep[1].replace(/[^\d.]/g, ""));
    const hi = parseFloat(rangeSep[2].replace(/[^\d.]/g, ""));
    if (!isNaN(lo) && !isNaN(hi) && hi > lo) return (lo + hi) / 2;
  }
  const num = str.replace(/[^\d.]/g, "");
  const n = parseFloat(num);
  return isNaN(n) ? null : n;
}

function getCurrencySymbol(str: string | undefined | null): string {
  if (!str) return "£";
  const match = str.match(/^([£$€¥]|[A-Z]{1,3}\$?)/);
  return match ? match[1] : "£";
}

function parseGradeNum(gradeStr: string): number {
  const match = gradeStr.match(/(\d+(?:\.\d+)?)$/);
  return match ? parseFloat(match[1]) : 0;
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

/** Map (company, grade) → the matching eBay price key, e.g. ("psa", 9) → "psa9" */
function getEbayGradePrice(
  ebay: Record<string, number> | null,
  company: string,
  grade: number
): number | null {
  if (!ebay) return null;
  const key = company.toLowerCase() + grade.toString().replace(".", "");
  const val = ebay[key];
  return typeof val === "number" && val > 0 ? val : null;
}

/** Convert eBay USD price to GBP and round */
const toGBP = (usd: number) => Math.round(usd * 0.79);

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
  const { settings, setCurrency } = useSettings();
  const enabledCompanies = settings.enabledCompanies;
  const { isSubscribed, isGateEnabled, isAdminMode } = useSubscription();
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
  const [ebayPrices, setEbayPrices] = useState<{
    psa10: number; psa9: number; psa8: number; psa7: number;
    bgs10: number; bgs95: number; bgs9: number; bgs85: number; bgs8: number;
    ace10: number; ace9: number; ace8: number;
    tag10: number; tag9: number; tag8: number;
    cgc10: number; cgc95: number; cgc9: number; cgc8: number;
    raw: number;
  } | null>(null);
  const [ebayLoading, setEbayLoading] = useState(false);
  const [reAnalysing, setReAnalysing] = useState(false);
  const [reAnalyseStage, setReAnalyseStage] = useState("");
  const [correctionVisible, setCorrectionVisible] = useState(false);
  const [correctionName, setCorrectionName] = useState("");
  const [correctionNumber, setCorrectionNumber] = useState("");
  const [correctionSet, setCorrectionSet] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [rescanning, setRescanning] = useState(false);
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
        currency: settings.currency || "GBP",
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

  const openCorrectionModal = () => {
    if (!grading) return;
    setCorrectionName(grading.result.cardName || "");
    setCorrectionNumber(grading.result.setNumber || "");
    setCorrectionSet(grading.result.setName || grading.result.setInfo || "");
    setCorrectionVisible(true);
  };

  const applyCorrection = async () => {
    if (!grading) return;
    setCorrecting(true);
    try {
      const updatedResult = {
        ...grading.result,
        cardName: correctionName.trim() || grading.result.cardName,
        setNumber: correctionNumber.trim() || grading.result.setNumber,
        setName: correctionSet.trim() || grading.result.setName,
        cardValue: undefined,
      };
      const updatedGrading = { ...grading, result: updatedResult };
      await updateGrading(grading.id, { result: updatedResult });
      setGrading(updatedGrading);
      setCardValue(null);
      setCorrectionVisible(false);
      setLoadingValue(true);
      try {
        const resp = await apiRequest("POST", "/api/card-value", {
          cardName: updatedResult.cardName,
          setName: updatedResult.setName || updatedResult.setInfo,
          setNumber: updatedResult.setNumber,
          psaGrade: updatedResult.psa.grade,
          bgsGrade: updatedResult.beckett.overallGrade,
          aceGrade: updatedResult.ace.overallGrade,
          tagGrade: updatedResult.tag?.overallGrade,
          cgcGrade: updatedResult.cgc?.grade,
          currency: settings.currency || "GBP",
        });
        const data = await resp.json();
        setCardValue(data);
        const withValue = { ...updatedResult, cardValue: data };
        await updateGrading(grading.id, { result: withValue });
        setGrading({ ...updatedGrading, result: withValue });
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
    } catch {
    } finally {
      setCorrecting(false);
    }
  };

  const handleRescan = async () => {
    if (!grading || rescanning) return;
    setRescanning(true);
    try {
      const [frontBase64, backBase64] = await Promise.all([
        getBase64FromUri(grading.frontImage),
        getBase64FromUri(grading.backImage),
      ]);
      const resp = await apiRequest("POST", "/api/reidentify-card", {
        frontImage: frontBase64,
        backImage: backBase64,
        previousCardName: grading.result.cardName,
        previousSetName: grading.result.setName || grading.result.setInfo,
        previousSetNumber: grading.result.setNumber,
      });
      const newId = await resp.json();
      if (newId.cardName) setCorrectionName(newId.cardName);
      if (newId.setName && !/^\d+\s*\/\s*\d+$/.test(newId.setName.trim())) {
        setCorrectionSet(newId.setName);
      }
      if (newId.setNumber) setCorrectionNumber(newId.setNumber);
    } catch (err) {
      console.error("Re-scan failed:", err);
    } finally {
      setRescanning(false);
    }
  };

  useEffect(() => {
    loadGrading();
  }, [gradingId]);

  useEffect(() => {
    const cardName = grading?.result?.cardName;
    const setName = grading?.result?.setName || grading?.result?.setInfo;
    const cardNumber = grading?.result?.setNumber;
    if (!cardName || !setName) return;
    if (!(isSubscribed || isAdminMode)) return;
    setEbayLoading(true);
    setEbayPrices(null);
    const params = new URLSearchParams({
      name: cardName,
      setName,
      ...(cardNumber ? { cardNumber } : {}),
    });
    const gradingId = grading?.id;
    const gradingResult = grading?.result;
    apiRequest("GET", `/api/ebay-all-grades?${params}`)
      .then(r => r.json())
      .then(data => {
        setEbayPrices(data);
        setEbayLoading(false);
        if (gradingId && gradingResult && data && !data.error) {
          const { fetchedAt, isStale, ...priceData } = data;
          updateGrading(gradingId, {
            result: { ...gradingResult, savedEbayPrices: priceData },
          }).catch(() => {});
        }
      })
      .catch(() => { setEbayLoading(false); });
  }, [grading?.result?.cardName, grading?.result?.setName, grading?.result?.setInfo, grading?.result?.setNumber, isSubscribed, isAdminMode]);

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

  const handleDelete = () => {
    if (!grading) return;
    if (Platform.OS === "web") {
      if (confirm("Delete this grading? This cannot be undone.")) {
        deleteGrading(grading.id).then(() => {
          if (router.canGoBack()) router.back();
          else router.replace("/");
        });
      }
    } else {
      Alert.alert("Delete Grading", "Are you sure you want to delete this grading? This cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteGrading(grading.id).then(() => {
              if (router.canGoBack()) router.back();
              else router.replace("/");
            });
          },
        },
      ]);
    }
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
    const norm = (v: number) => Math.max(v, 100 - v);
    const frontWorst = Math.max(norm(c.frontLeftRight), norm(c.frontTopBottom));
    const backWorst = Math.max(norm(c.backLeftRight), norm(c.backTopBottom));

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
    const fLR = norm(c.frontLeftRight);
    const fTB = norm(c.frontTopBottom);
    const bLR = norm(c.backLeftRight);
    const bTB = norm(c.backTopBottom);
    const centeringNote = `Front: ${fLR}/${100 - fLR} LR, ${fTB}/${100 - fTB} TB. Back: ${bLR}/${100 - bLR} LR, ${bTB}/${100 - bTB} TB.`;

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
    const aceLowest = Math.min(...aceGrades);
    const aceAvg = Math.round(aceGrades.reduce((a, b) => a + b, 0) / 4);
    let aceOverall = Math.min(aceAvg, aceLowest + 1);
    if (aceOverall === 10) {
      const otherGrades = [prevResult.ace.corners.grade, prevResult.ace.edges.grade, prevResult.ace.surface.grade];
      const tensCount = otherGrades.filter(g => g === 10).length;
      const ninesCount = otherGrades.filter(g => g === 9).length;
      const meetsAce10 = aceCenteringGrade === 10 && tensCount >= 2 && ninesCount <= 1;
      if (!meetsAce10) {
        aceOverall = 9;
      }
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

    const generatePsaNote = (): string => {
      const lowestArea = (() => {
        const areas = [
          { name: "centering", grade: psaCenteringGrade },
          { name: "corners", grade: prevResult.beckett.corners.grade },
          { name: "edges", grade: prevResult.beckett.edges.grade },
          { name: "surface", grade: prevResult.beckett.surface.grade },
        ];
        return areas.reduce((a, b) => a.grade <= b.grade ? a : b);
      })();
      if (psaGrade === 10) return "All areas meet PSA Gem Mint 10 standards.";
      if (psaGrade === 9) return `PSA 9 (Mint). ${lowestArea.name === "centering" ? "Centering is the primary limiting factor." : `${lowestArea.name.charAt(0).toUpperCase() + lowestArea.name.slice(1)} is the primary limiting factor.`}`;
      return `Grade is primarily determined by ${lowestArea.name}; overall PSA ${psaGrade}.`;
    };

    const generateBgsNote = (): string => {
      const bgsOv = roundHalf(bgsAvg);
      const subs = [
        { name: "centering", grade: bgsCenteringGrade },
        { name: "corners", grade: prevResult.beckett.corners.grade },
        { name: "edges", grade: prevResult.beckett.edges.grade },
        { name: "surface", grade: prevResult.beckett.surface.grade },
      ];
      const lowest = subs.reduce((a, b) => a.grade <= b.grade ? a : b);
      if (bgsOv >= 10) return "All sub-grades meet BGS Pristine 10 standards.";
      if (bgsOv >= 9.5) return "BGS 9.5 Gem Mint — all sub-grades are strong.";
      return `BGS ${bgsOv}; ${lowest.name} at ${lowest.grade} is the primary limiting factor.`;
    };

    const generateAceNote = (): string => {
      const subs = [
        { name: "centering", grade: aceCenteringGrade },
        { name: "corners", grade: prevResult.ace.corners.grade },
        { name: "edges", grade: prevResult.ace.edges.grade },
        { name: "surface", grade: prevResult.ace.surface.grade },
      ];
      const lowest = subs.reduce((a, b) => a.grade <= b.grade ? a : b);
      if (aceOverall === 10) return "All sub-grades meet Ace Gem Mint 10 standards.";
      if (aceOverall < 10 && aceCenteringGrade < 10) {
        return `Ace 10 is not possible because centering is ${aceCenteringGrade}; with other sub-grades considered, overall projects as Ace ${aceOverall}.`;
      }
      if (aceOverall < 10 && aceCenteringGrade === 10) {
        const otherGrades = [prevResult.ace.corners.grade, prevResult.ace.edges.grade, prevResult.ace.surface.grade];
        const tensCount = otherGrades.filter(g => g === 10).length;
        if (tensCount < 2) {
          return `Centering is a 10, but Ace 10 requires at least 2 other sub-grades at 10; overall projects as Ace ${aceOverall}.`;
        }
      }
      return `${lowest.name.charAt(0).toUpperCase() + lowest.name.slice(1)} at ${lowest.grade} limits the overall to Ace ${aceOverall}.`;
    };

    const generateTagNote = (): string => {
      if (!prevResult.tag) return "";
      const subs = [
        { name: "centering", grade: tagCenteringGrade },
        { name: "corners", grade: prevResult.tag.corners.grade },
        { name: "edges", grade: prevResult.tag.edges.grade },
        { name: "surface", grade: prevResult.tag.surface.grade },
      ];
      const lowest = subs.reduce((a, b) => a.grade <= b.grade ? a : b);
      if (tagOverall >= 10) return "All sub-grades meet TAG Pristine 10 standards.";
      return `TAG ${tagOverall}; ${lowest.name} at ${lowest.grade} is the primary limiting factor.`;
    };

    const generateCgcNote = (): string => {
      if (!prevResult.cgc) return "";
      if (cgcGrade >= 10) return "All areas meet CGC Pristine 10 standards.";
      if (cgcGrade >= 9.5) return "CGC 9.5 Gem Mint — strong across all categories.";
      return `CGC ${cgcGrade}; centering at ${cgcCenteringGrade} is a factor in the overall grade.`;
    };

    const updatedResult: GradingResult = {
      ...prevResult,
      centering: newCentering,
      psa: {
        ...prevResult.psa,
        grade: psaGrade,
        centeringGrade: psaCenteringGrade,
        centering: centeringNote,
        notes: generatePsaNote(),
      },
      beckett: {
        ...prevResult.beckett,
        centering: { grade: bgsCenteringGrade, notes: centeringNote },
        overallGrade: roundHalf(bgsAvg),
        notes: generateBgsNote(),
      },
      ace: {
        ...prevResult.ace,
        centering: { grade: aceCenteringGrade, notes: centeringNote },
        overallGrade: aceOverall,
        notes: generateAceNote(),
      },
      ...(prevResult.tag ? {
        tag: {
          ...prevResult.tag,
          centering: { grade: tagCenteringGrade, notes: centeringNote },
          overallGrade: tagOverall,
          notes: generateTagNote(),
        },
      } : {}),
      ...(prevResult.cgc ? {
        cgc: {
          ...prevResult.cgc,
          grade: cgcGrade,
          centering: centeringNote,
          notes: generateCgcNote(),
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
        <View style={styles.headerRight}>
          <Pressable
            onPress={handleDelete}
            style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="trash-outline" size={20} color={Colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => router.replace("/")}
            style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="home" size={22} color={Colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + webBottomInset + 30 }]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        keyboardShouldPersistTaps="handled"
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
              <DefectOverlay
                defects={result.defects}
                side={showFront ? "front" : "back"}
                cardBounds={showFront ? result.frontCardBounds : result.backCardBounds}
              />
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
            <Pressable
              onPress={openCorrectionModal}
              style={({ pressed }) => [styles.wrongCardBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Ionicons name="create-outline" size={13} color={Colors.primary} />
              <Text style={styles.wrongCardText}>Wrong card? Correct it</Text>
            </Pressable>
          </View>
        </View>

        {result.currentGrade && (
          <View style={styles.currentGradeBanner}>
            <View style={styles.currentGradeBannerHeader}>
              <Ionicons name="git-compare-outline" size={16} color="#8B5CF6" />
              <Text style={styles.currentGradeBannerTitle}>Crossover Analysis</Text>
              {result.currentGrade.certNumber ? (
                <Text style={styles.currentGradeBannerCert}>Cert #{result.currentGrade.certNumber}</Text>
              ) : null}
            </View>
            <View style={styles.currentGradeBannerBody}>
              <View>
                <Text style={styles.currentGradeBannerSublabel}>Currently in</Text>
                <View style={styles.currentGradePill}>
                  <Text style={styles.currentGradePillCompany}>{result.currentGrade.company}</Text>
                  <Text style={styles.currentGradePillGrade}>{result.currentGrade.grade}</Text>
                </View>
              </View>
              <Ionicons name="arrow-forward" size={20} color="rgba(139,92,246,0.4)" style={{ marginTop: 18 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.currentGradeBannerSublabel}>Predicted crossover grades</Text>
                <View style={styles.crossoverChipRow}>
                  {enabledCompanies.includes("PSA") && (
                    <View style={styles.crossoverMiniChip}>
                      <Text style={styles.crossoverMiniChipLabel}>PSA</Text>
                      <Text style={styles.crossoverMiniChipGrade}>{result.psa.grade % 1 === 0 ? result.psa.grade : result.psa.grade.toFixed(1)}</Text>
                    </View>
                  )}
                  {enabledCompanies.includes("Beckett") && (
                    <View style={styles.crossoverMiniChip}>
                      <Text style={styles.crossoverMiniChipLabel}>BGS</Text>
                      <Text style={styles.crossoverMiniChipGrade}>{result.beckett.overallGrade % 1 === 0 ? result.beckett.overallGrade : result.beckett.overallGrade.toFixed(1)}</Text>
                    </View>
                  )}
                  {enabledCompanies.includes("Ace") && (
                    <View style={styles.crossoverMiniChip}>
                      <Text style={styles.crossoverMiniChipLabel}>ACE</Text>
                      <Text style={styles.crossoverMiniChipGrade}>{result.ace.overallGrade}</Text>
                    </View>
                  )}
                  {enabledCompanies.includes("CGC") && (
                    <View style={styles.crossoverMiniChip}>
                      <Text style={styles.crossoverMiniChipLabel}>CGC</Text>
                      <Text style={styles.crossoverMiniChipGrade}>{result.cgc.grade % 1 === 0 ? result.cgc.grade : result.cgc.grade.toFixed(1)}</Text>
                    </View>
                  )}
                  {enabledCompanies.includes("TAG") && (
                    <View style={styles.crossoverMiniChip}>
                      <Text style={styles.crossoverMiniChipLabel}>TAG</Text>
                      <Text style={styles.crossoverMiniChipGrade}>{result.tag.overallGrade % 1 === 0 ? result.tag.overallGrade : result.tag.overallGrade.toFixed(1)}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>
        )}

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

        {/* ── Market Prices (eBay primary, TCGPlayer raw fallback) ── */}
        <View style={styles.ebayCard}>
          <View style={styles.ebayCardHeader}>
            <View style={styles.ebayLogoRow}>
              <Text style={styles.ebayLogoText}>
                <Text style={{ color: "#E53238" }}>e</Text>
                <Text style={{ color: "#0064D2" }}>b</Text>
                <Text style={{ color: "#F5AF02" }}>a</Text>
                <Text style={{ color: "#86B817" }}>y</Text>
              </Text>
              <Text style={styles.ebayCardTitle}>Market Prices</Text>
            </View>
            {ebayLoading && <ActivityIndicator size="small" color={Colors.textMuted} style={{ transform: [{ scale: 0.75 }] }} />}
          </View>

          {(() => {
            // Build the per-company rows (only enabled companies)
            const marketRows = [
              enabledCompanies.includes("PSA")     && { key: "psa", label: "PSA",     grade: result.psa.grade,           color: "#F59E0B" },
              enabledCompanies.includes("Beckett") && { key: "bgs", label: "BGS",     grade: result.beckett.overallGrade, color: "#60a5fa" },
              enabledCompanies.includes("Ace")     && { key: "ace", label: "ACE",     grade: result.ace.overallGrade,     color: "#f59e0b" },
              enabledCompanies.includes("TAG")     && { key: "tag", label: "TAG",     grade: result.tag.overallGrade,     color: "#c084fc" },
              enabledCompanies.includes("CGC")     && { key: "cgc", label: "CGC",     grade: result.cgc.grade,            color: "#fb7185" },
            ].filter(Boolean) as { key: string; label: string; grade: number; color: string }[];

            if (isGateEnabled && !isSubscribed && !isAdminMode) {
              // Blurred placeholder — shows same shape as the real content
              return (
                <View style={{ overflow: "hidden" as const, borderRadius: 12 }}>
                  {/* Column headers */}
                  <View style={styles.ebayColHeader}>
                    <View style={{ flex: 1 }} />
                    <Text style={[styles.ebayColHeaderText, { width: 80 }]}>Your Grade</Text>
                    <Text style={[styles.ebayColHeaderText, { width: 80, textAlign: "right" as const }]}>Grade 10</Text>
                  </View>
                  {marketRows.map(co => (
                    <View key={co.key} style={styles.ebayGradeRow}>
                      <View style={{ width: 36 }}>
                        <CompanyLabel company={co.label} fontSize={13} fontFamily="Inter_700Bold" />
                      </View>
                      <View style={styles.ebayGradeRowCell}>
                        <View style={styles.ebayGradePill}><Text style={styles.ebayGradePillText}>{co.grade}</Text></View>
                        <Text style={[styles.ebayGradePrice, { color: co.color }]}>£---</Text>
                      </View>
                      <View style={styles.ebayGradeRowCell}>
                        {co.grade < 10 ? <Text style={styles.ebayGradePrice}>£---</Text> : <Text style={styles.ebayGradePriceMuted}>—</Text>}
                      </View>
                    </View>
                  ))}
                  <View style={[styles.ebayPriceRow, { marginTop: 4, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", paddingTop: 10 }]}>
                    <Text style={styles.ebayPriceLabel}>Raw (Ungraded)</Text>
                    <Text style={[styles.ebayPriceValue, { color: Colors.text }]}>£---</Text>
                  </View>
                  <Pressable style={StyleSheet.absoluteFill} onPress={() => router.push("/paywall")}>
                    <BlurView intensity={40} tint="dark" style={styles.proBlurOverlay}>
                      <View style={styles.proBlurContent}>
                        <Ionicons name="lock-closed" size={20} color="#F59E0B" />
                        <Text style={styles.proBlurTitle}>Pro Feature</Text>
                        <Text style={styles.proBlurSubtitle}>Upgrade to see last sold prices</Text>
                      </View>
                    </BlurView>
                  </Pressable>
                </View>
              );
            }

            if (ebayLoading && !ebayPrices) {
              return (
                <View style={styles.ebayLoadingRow}>
                  <Text style={styles.ebayLoadingText}>Fetching sold prices…</Text>
                </View>
              );
            }

            if (!ebayPrices) {
              return (
                <View style={styles.ebayLoadingRow}>
                  <Text style={styles.ebayPriceMuted}>No price data available</Text>
                </View>
              );
            }

            return (
              <View>
                {/* Column headers */}
                <View style={styles.ebayColHeader}>
                  <View style={{ flex: 1 }} />
                  <Text style={[styles.ebayColHeaderText, { width: 80 }]}>Your Grade</Text>
                  <Text style={[styles.ebayColHeaderText, { width: 80, textAlign: "right" as const }]}>Grade 10</Text>
                </View>

                {marketRows.map(co => {
                  const actualPrice = getEbayGradePrice(ebayPrices as any, co.key, co.grade);
                  const grade10Price = co.grade < 10
                    ? getEbayGradePrice(ebayPrices as any, co.key, 10)
                    : null;
                  return (
                    <View key={co.key} style={styles.ebayGradeRow}>
                      <View style={{ width: 36 }}>
                        <CompanyLabel company={co.label} fontSize={13} fontFamily="Inter_700Bold" />
                      </View>
                      {/* Your grade column */}
                      <View style={styles.ebayGradeRowCell}>
                        <View style={styles.ebayGradePill}>
                          <Text style={styles.ebayGradePillText}>
                            {co.grade % 1 === 0 ? co.grade : co.grade.toFixed(1)}
                          </Text>
                        </View>
                        {actualPrice != null ? (
                          <Text style={[styles.ebayGradePrice, { color: co.color }]}>£{toGBP(actualPrice)}</Text>
                        ) : (
                          <Text style={styles.ebayGradePriceMuted}>—</Text>
                        )}
                      </View>
                      {/* Grade 10 column */}
                      <View style={[styles.ebayGradeRowCell, { justifyContent: "flex-end" as const }]}>
                        {co.grade < 10 ? (
                          grade10Price != null ? (
                            <Text style={[styles.ebayGradePrice, { color: "#22c55e" }]}>£{toGBP(grade10Price)}</Text>
                          ) : (
                            <Text style={styles.ebayGradePriceMuted}>—</Text>
                          )
                        ) : (
                          <Text style={styles.ebayGradePriceMuted}>✓ 10</Text>
                        )}
                      </View>
                    </View>
                  );
                })}

                {/* Raw (ungraded) — eBay primary, TCGPlayer fallback */}
                <View style={[styles.ebayPriceRow, { marginTop: 4, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", paddingTop: 10 }]}>
                  <Text style={styles.ebayPriceLabel}>Raw (Ungraded)</Text>
                  {ebayPrices.raw > 0 ? (
                    <View style={styles.ebayValueWithBadge}>
                      <Text style={[styles.ebayPriceValue, { color: Colors.text }]}>£{toGBP(ebayPrices.raw)}</Text>
                      <View style={styles.ebaySourceBadge}>
                        <Text style={styles.ebaySourceBadgeText}>eBay</Text>
                      </View>
                    </View>
                  ) : cardValue?.rawValue && !cardValue.rawValue.includes("No value") ? (
                    <View style={styles.ebayValueWithBadge}>
                      <Text style={[styles.ebayPriceValue, { color: Colors.text }]}>{cardValue.rawValue}</Text>
                      <View style={[styles.ebaySourceBadge, { backgroundColor: "#f97316" }]}>
                        <Text style={styles.ebaySourceBadgeText}>TCGPlayer</Text>
                      </View>
                    </View>
                  ) : loadingValue ? (
                    <ActivityIndicator size="small" color={Colors.textMuted} style={{ transform: [{ scale: 0.7 }] }} />
                  ) : (
                    <Text style={styles.ebayPriceMuted}>No price data</Text>
                  )}
                </View>

                <Text style={styles.ebayDisclaimer}>
                  Last qualifying eBay sale · excl. Best Offer · Raw = TCGPlayer if no eBay data
                </Text>
              </View>
            );
          })()}
        </View>

        {result.isCrossover && result.currentGrade && (() => {
          const currentCompanyRaw = result.currentGrade!.company.toLowerCase();
          // Normalise company key for eBay lookup ("beckett" → "bgs")
          const currentEbayKey = (currentCompanyRaw === "beckett" || currentCompanyRaw === "beckett grading") ? "bgs" : currentCompanyRaw;
          const currentGradeNum = parseGradeNum(result.currentGrade!.grade);

          // Prefer real eBay prices; fall back to TCGPlayer cardValue if eBay unavailable
          const resolveGBP = (ebayKey: string, grade: number, fallbackStr?: string | null): number | null => {
            const usd = getEbayGradePrice(ebayPrices as any, ebayKey, grade);
            if (usd != null) return toGBP(usd);
            return parsePrice(fallbackStr);
          };

          const currSym = ebayPrices ? "£" : getCurrencySymbol(
            cardValue?.psaValue || cardValue?.aceValue || cardValue?.bgsValue
          );

          const currentSlabNum = resolveGBP(
            currentEbayKey,
            currentGradeNum,
            currentCompanyRaw === "psa"     ? cardValue?.psaValue :
            currentCompanyRaw === "bgs" || currentCompanyRaw === "beckett" ? cardValue?.bgsValue :
            currentCompanyRaw === "ace"     ? cardValue?.aceValue :
            currentCompanyRaw === "tag"     ? cardValue?.tagValue :
            currentCompanyRaw === "cgc"     ? cardValue?.cgcValue : null
          );

          const allCos = [
            { company: "PSA", label: "PSA", enabled: enabledCompanies.includes("PSA"),     ebayKey: "psa", grade: result.psa.grade,           val: resolveGBP("psa", result.psa.grade,           cardValue?.psaValue), val10: resolveGBP("psa", 10, cardValue?.psa10Value) },
            { company: "BGS", label: "BGS", enabled: enabledCompanies.includes("Beckett"), ebayKey: "bgs", grade: result.beckett.overallGrade, val: resolveGBP("bgs", result.beckett.overallGrade, cardValue?.bgsValue), val10: resolveGBP("bgs", 10, cardValue?.bgs10Value) },
            { company: "ACE", label: "ACE", enabled: enabledCompanies.includes("Ace"),     ebayKey: "ace", grade: result.ace.overallGrade,     val: resolveGBP("ace", result.ace.overallGrade,     cardValue?.aceValue), val10: resolveGBP("ace", 10, cardValue?.ace10Value) },
            { company: "TAG", label: "TAG", enabled: enabledCompanies.includes("TAG"),     ebayKey: "tag", grade: result.tag.overallGrade,     val: resolveGBP("tag", result.tag.overallGrade,     cardValue?.tagValue), val10: resolveGBP("tag", 10, cardValue?.tag10Value) },
            { company: "CGC", label: "CGC", enabled: enabledCompanies.includes("CGC"),     ebayKey: "cgc", grade: result.cgc.grade,            val: resolveGBP("cgc", result.cgc.grade,            cardValue?.cgcValue), val10: resolveGBP("cgc", 10, cardValue?.cgc10Value) },
          ].filter(c => c.enabled && c.company !== result.currentGrade!.company);

          const maxBarVal = Math.max(
            currentSlabNum || 0,
            ...allCos.map(c => c.val10 ?? c.val ?? 0),
          );

          const formatAmt = (n: number) => `${currSym}${Math.round(n).toLocaleString()}`;
          const formatProfit = (n: number) =>
            n >= 0 ? `+${currSym}${Math.round(n).toLocaleString()}` : `-${currSym}${Math.round(Math.abs(n)).toLocaleString()}`;

          return (
            <View style={styles.profitCard}>
              <View style={styles.profitHeader}>
                <Ionicons name="trending-up-outline" size={16} color="#10B981" />
                <Text style={styles.profitTitle}>Profit Potential</Text>
              </View>

              {/* Current slab */}
              <View style={styles.profitCurrentRow}>
                <View style={styles.profitCurrentLeft}>
                  <Text style={styles.profitCurrentLabel}>Current slab value</Text>
                  <View style={styles.profitCurrentPill}>
                    <Text style={styles.profitCurrentCompany}>{result.currentGrade!.company}</Text>
                    <Text style={styles.profitCurrentGrade}>{result.currentGrade!.grade}</Text>
                  </View>
                </View>
                <Text style={styles.profitCurrentValue}>
                  {currentSlabNum !== null ? formatAmt(currentSlabNum) : "No data"}
                </Text>
              </View>

              {/* Bar showing current value */}
              {currentSlabNum !== null && maxBarVal > 0 && (
                <View style={styles.profitBarTrack}>
                  <View style={[styles.profitBarFillCurrent, { width: `${Math.min(100, (currentSlabNum / maxBarVal) * 100)}%` }]} />
                </View>
              )}

              <View style={styles.profitDivider}>
                <View style={styles.profitDividerLine} />
                <Text style={styles.profitDividerText}>If you crossover to...</Text>
                <View style={styles.profitDividerLine} />
              </View>

              {allCos.map((co, idx) => {
                const profit = co.val !== null && currentSlabNum !== null ? co.val - currentSlabNum : null;
                const maxPotential = co.val10 !== null && currentSlabNum !== null && co.grade < 10 ? co.val10 - currentSlabNum : null;
                const profitPositive = profit !== null && profit > 0;
                const profitNegative = profit !== null && profit < 0;
                const profitColor = profitPositive ? "#10B981" : profitNegative ? "#EF4444" : Colors.textMuted;
                const gradeUp = co.grade > currentGradeNum;
                const gradeDown = co.grade < currentGradeNum;
                const barPct = maxBarVal > 0 && co.val !== null ? Math.min(100, (co.val / maxBarVal) * 100) : 0;
                const bar10Pct = maxBarVal > 0 && co.val10 !== null && co.grade < 10 ? Math.min(100, (co.val10 / maxBarVal) * 100) : 0;

                return (
                  <View key={co.company} style={[styles.profitCoRow, idx === allCos.length - 1 && styles.profitCoRowLast]}>
                    <View style={styles.profitCoHeader}>
                      <CompanyLabel company={co.company as any} fontSize={12} />
                      <View style={styles.profitCoGradePill}>
                        <Text style={styles.profitCoGradeText}>
                          {co.grade % 1 === 0 ? co.grade : co.grade.toFixed(1)}
                        </Text>
                        {gradeUp && <Ionicons name="arrow-up" size={10} color="#10B981" />}
                        {gradeDown && <Ionicons name="arrow-down" size={10} color="#EF4444" />}
                      </View>
                      <View style={{ flex: 1 }} />
                      {co.val !== null ? (
                        <Text style={styles.profitCoValue}>{formatAmt(co.val)}</Text>
                      ) : (
                        <Text style={styles.profitCoValueNA}>No data</Text>
                      )}
                      {profit !== null && (
                        <View style={[styles.profitBadge, { backgroundColor: profitPositive ? "rgba(16,185,129,0.15)" : profitNegative ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)" }]}>
                          <Text style={[styles.profitBadgeText, { color: profitColor }]}>
                            {formatProfit(profit)}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Value bar */}
                    <View style={styles.profitBarTrack}>
                      {bar10Pct > 0 && (
                        <View style={[styles.profitBarFillPotential, { width: `${bar10Pct}%` }]} />
                      )}
                      {barPct > 0 && (
                        <View style={[styles.profitBarFillCo, {
                          width: `${barPct}%`,
                          backgroundColor: profitPositive ? "rgba(16,185,129,0.55)" : profitNegative ? "rgba(239,68,68,0.45)" : "rgba(139,92,246,0.4)",
                        }]} />
                      )}
                    </View>

                    {maxPotential !== null && co.val10 !== null && (
                      <Text style={styles.profitMaxLine}>
                        Max at {co.label} 10: {formatAmt(co.val10)}
                        {"  "}
                        <Text style={{ color: maxPotential >= 0 ? "#10B981" : "#EF4444" }}>
                          ({formatProfit(maxPotential)} potential)
                        </Text>
                      </Text>
                    )}
                  </View>
                );
              })}

              <Text style={styles.profitDisclaimer}>
                Profit estimates are based on TCG market prices and are indicative only. Crossover outcomes and grades may vary.
              </Text>
            </View>
          );
        })()}

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

        <ShareButton grading={grading} enabledCompanies={enabledCompanies} cardValue={cardValue} showMarketData={isSubscribed || isAdminMode} />
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
                <DefectOverlay
                  defects={result.defects}
                  side={viewerShowFront ? "front" : "back"}
                  cardBounds={viewerShowFront ? result.frontCardBounds : result.backCardBounds}
                />
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
        {centeringToolVisible && <CenteringTool
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
        />}
      </Modal>

      <Modal
        visible={correctionVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCorrectionVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.correctionOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setCorrectionVisible(false)} />
          <View style={[styles.correctionSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.correctionHandle} />
            <View style={styles.correctionHeader}>
              <View style={styles.correctionHeaderLeft}>
                <Ionicons name="search-outline" size={20} color={Colors.primary} />
                <Text style={styles.correctionTitle}>Correct Card Details</Text>
              </View>
              <Pressable
                onPress={() => setCorrectionVisible(false)}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              >
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.correctionSubtitle}>
              Update the card name, set, or number below to fix identification and refresh market values.
            </Text>

            <Pressable
              onPress={handleRescan}
              disabled={rescanning}
              style={({ pressed }) => [
                styles.rescanBtn,
                { opacity: pressed || rescanning ? 0.7 : 1 },
              ]}
            >
              {rescanning ? (
                <>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.rescanBtnText}>Re-scanning card...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="refresh" size={18} color={Colors.primary} />
                  <Text style={styles.rescanBtnText}>Don't know the name? Re-scan</Text>
                </>
              )}
            </Pressable>

            <View style={styles.correctionField}>
              <Text style={styles.correctionLabel}>Card Name</Text>
              <TextInput
                style={styles.correctionInput}
                value={correctionName}
                onChangeText={setCorrectionName}
                placeholder="e.g. Charizard ex"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.correctionField}>
              <Text style={styles.correctionLabel}>Set Name</Text>
              <TextInput
                style={styles.correctionInput}
                value={correctionSet}
                onChangeText={setCorrectionSet}
                placeholder="e.g. Obsidian Flames"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.correctionField}>
              <Text style={styles.correctionLabel}>Card Number</Text>
              <TextInput
                style={styles.correctionInput}
                value={correctionNumber}
                onChangeText={setCorrectionNumber}
                placeholder="e.g. 006/197"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
              />
            </View>

            <Pressable
              onPress={applyCorrection}
              disabled={correcting}
              style={({ pressed }) => [
                styles.correctionSaveBtn,
                { opacity: pressed || correcting ? 0.7 : 1 },
              ]}
            >
              {correcting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.correctionSaveBtnText}>Update & Refresh Prices</Text>
                </>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
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
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
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
  currentGradeBanner: {
    backgroundColor: "rgba(139, 92, 246, 0.08)",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.25)",
    gap: 12,
  },
  currentGradeBannerHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  currentGradeBannerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#8B5CF6",
    flex: 1,
  },
  currentGradeBannerCert: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  currentGradeBannerBody: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  currentGradePill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    backgroundColor: "rgba(139, 92, 246, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  currentGradePillCompany: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: "#8B5CF6",
  },
  currentGradePillGrade: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: "#8B5CF6",
  },
  currentGradeBannerNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
    flex: 1,
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
  ebayCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  ebayCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  ebayLogoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ebayLogoText: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    letterSpacing: -0.5,
  },
  ebayCardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  ebayLoadingRow: {
    paddingVertical: 12,
    alignItems: "center",
  },
  ebayLoadingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  ebayPriceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  ebayPriceLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  ebayPriceValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  ebayPriceMuted: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  ebayValueWithBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ebaySourceBadge: {
    backgroundColor: "#0064D2",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  ebaySourceBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: "#fff",
  },
  ebayDisclaimer: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 10,
    lineHeight: 16,
  },
  // Two-column Market Prices layout (Your Grade | Grade 10)
  ebayColHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 6,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  ebayColHeaderText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
  },
  ebayGradeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  ebayGradeRowLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    width: 36,
  },
  ebayGradeRowCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ebayGradePill: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: "center",
  },
  ebayGradePillText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: Colors.text,
  },
  ebayGradePrice: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: Colors.text,
  },
  ebayGradePriceMuted: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
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
  wrongCardBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingVertical: 4,
    marginTop: 2,
  },
  wrongCardText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.primary,
  },
  correctionOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  correctionSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 14,
  },
  correctionHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceBorder,
    alignSelf: "center",
    marginBottom: 4,
  },
  correctionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  correctionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  correctionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  correctionSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  rescanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: "dashed",
    marginTop: 4,
  },
  rescanBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.primary,
  },
  correctionField: {
    gap: 6,
  },
  correctionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  correctionInput: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.text,
  },
  correctionSaveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  correctionSaveBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#fff",
  },

  currentGradeBannerSublabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  crossoverChipRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
  },
  crossoverMiniChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
    backgroundColor: "rgba(139,92,246,0.12)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.2)",
  },
  crossoverMiniChipLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: "rgba(139,92,246,0.8)",
  },
  crossoverMiniChipGrade: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: "#8B5CF6",
  },

  profitCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.2)",
    gap: 12,
  },
  profitHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  profitTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  profitCurrentRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  profitCurrentLeft: {
    gap: 4,
  },
  profitCurrentLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
  },
  profitCurrentPill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
  },
  profitCurrentCompany: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: "#8B5CF6",
    backgroundColor: "rgba(139,92,246,0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  profitCurrentGrade: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
  },
  profitCurrentValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.text,
  },
  profitBarTrack: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 3,
    overflow: "hidden" as const,
    position: "relative" as const,
  },
  profitBarFillCurrent: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: "rgba(139,92,246,0.5)",
    borderRadius: 3,
  },
  profitBarFillPotential: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 3,
  },
  profitBarFillCo: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 3,
  },
  profitDivider: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginVertical: 2,
  },
  profitDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.surfaceBorder,
  },
  profitDividerText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textMuted,
  },
  profitCoRow: {
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  profitCoRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  profitCoHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  profitCoGradePill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  profitCoGradeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.text,
  },
  profitCoValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  profitCoValueNA: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  profitBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  profitBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  profitMaxLine: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  profitDisclaimer: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 16,
    marginTop: 4,
  },
});
