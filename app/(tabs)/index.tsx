import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Alert,
  Platform,
  Dimensions,
  TextInput,
  RefreshControl,
  Modal,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeOut, SlideInUp } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import Colors from "@/constants/colors";
import { getGradings, deleteGrading, clearAllGradings, updateGrading } from "@/lib/storage";
import { apiRequest } from "@/lib/query-client";
import type { SavedGrading } from "@/lib/types";
import GradeCircle from "@/components/GradeCircle";
import CompanyLabel from "@/components/CompanyLabel";
import { useSettings } from "@/lib/settings-context";
import { useSubscription } from "@/lib/subscription";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const BUBBLE_GAP = 12;
const BUBBLE_PAD = 20;
const BUBBLE_WIDTH = (SCREEN_WIDTH - BUBBLE_PAD * 2 - BUBBLE_GAP) / 2;

function HistoryItem({ item, onDelete, enabledCompanies }: { item: SavedGrading; onDelete: (id: string) => void; enabledCompanies: string[] }) {
  const date = new Date(item.timestamp);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const avgValue = useMemo(() => {
    const cv = item.result.cardValue;
    if (!cv) return null;
    const vals: number[] = [];
    if (enabledCompanies.includes("PSA")) { const v = parseGBP(cv.psaValue); if (v !== null) vals.push(v); }
    if (enabledCompanies.includes("Beckett")) { const v = parseGBP(cv.bgsValue); if (v !== null) vals.push(v); }
    if (enabledCompanies.includes("Ace")) { const v = parseGBP(cv.aceValue); if (v !== null) vals.push(v); }
    if (enabledCompanies.includes("TAG")) { const v = parseGBP(cv.tagValue); if (v !== null) vals.push(v); }
    if (enabledCompanies.includes("CGC")) { const v = parseGBP(cv.cgcValue); if (v !== null) vals.push(v); }
    if (vals.length === 0) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return avg;
  }, [item.result.cardValue, enabledCompanies]);

  const handleLongPress = () => {
    if (Platform.OS === "web") {
      if (confirm("Delete this grading?")) {
        onDelete(item.id);
      }
    } else {
      Alert.alert("Delete Grading", "Are you sure you want to delete this grading?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onDelete(item.id) },
      ]);
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.historyItem, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
      onPress={() =>
        router.push({
          pathname: "/results",
          params: { gradingId: item.id },
        })
      }
      onLongPress={handleLongPress}
    >
      <View style={styles.histTopRow}>
        <Text style={styles.histCardName} numberOfLines={1}>
          {item.result.cardName || "Unknown Card"}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </View>
      <View style={styles.histBottomRow}>
        <Image source={{ uri: item.frontImage }} style={styles.thumbnail} contentFit="cover" />
        <View style={styles.historyInfo}>
          <Text style={styles.histSetInfo} numberOfLines={1}>
            {[item.result.setName || item.result.setInfo, item.result.setNumber].filter(Boolean).join(" - ") || "Pokemon Card"}
          </Text>
          <Text style={styles.histDate}>{dateStr}</Text>
          {avgValue !== null && (
            <Text style={styles.histValue}>Est. £{avgValue < 1 ? avgValue.toFixed(2) : avgValue >= 1000 ? Math.round(avgValue).toLocaleString() : avgValue.toFixed(2)}</Text>
          )}
        </View>
      </View>
      <View style={styles.historyGrades}>
        {enabledCompanies.includes("PSA") && <GradeCircle grade={item.result.psa.grade} size={34} label="PSA" />}
        {enabledCompanies.includes("Beckett") && <GradeCircle grade={item.result.beckett.overallGrade} size={34} label="BGS" />}
        {enabledCompanies.includes("Ace") && <GradeCircle grade={item.result.ace.overallGrade} size={34} label="ACE" />}
        {enabledCompanies.includes("TAG") && item.result.tag && <GradeCircle grade={item.result.tag.overallGrade} size={34} label="TAG" />}
        {enabledCompanies.includes("CGC") && item.result.cgc && <GradeCircle grade={item.result.cgc.grade} size={34} label="CGC" />}
      </View>
    </Pressable>
  );
}

function parseGBP(val: string): number | null {
  const m = val.match(/[\u00a3]?\s*([\d,]+\.?\d*)/);
  if (!m) return null;
  return parseFloat(m[1].replace(/,/g, ""));
}

interface PortfolioStats {
  avgPSA: number;
  avgBGS: number;
  avgACE: number;
  avgTAG: number;
  avgCGC: number;
  totalPSA: number;
  totalBGS: number;
  totalACE: number;
  totalTAG: number;
  totalCGC: number;
  cardsWithValues: number;
  countTAG: number;
  countCGC: number;
}

function computeStats(gradings: SavedGrading[]): PortfolioStats | null {
  if (gradings.length === 0) return null;
  let sumPSA = 0, sumBGS = 0, sumACE = 0, sumTAG = 0, sumCGC = 0;
  let countTAG = 0, countCGC = 0;
  let totalPSA = 0, totalBGS = 0, totalACE = 0, totalTAG = 0, totalCGC = 0;
  let cardsWithValues = 0;
  for (const g of gradings) {
    sumPSA += g.result.psa.grade;
    sumBGS += g.result.beckett.overallGrade;
    sumACE += g.result.ace.overallGrade;
    if (g.result.tag) { sumTAG += g.result.tag.overallGrade; countTAG++; }
    if (g.result.cgc) { sumCGC += g.result.cgc.grade; countCGC++; }
    const cv = g.result.cardValue;
    if (cv) {
      const p = parseGBP(cv.psaValue);
      const b = parseGBP(cv.bgsValue);
      const a = parseGBP(cv.aceValue);
      const t = parseGBP(cv.tagValue);
      const c = parseGBP(cv.cgcValue);
      if (p !== null || b !== null || a !== null || t !== null || c !== null) cardsWithValues++;
      if (p !== null) totalPSA += p;
      if (b !== null) totalBGS += b;
      if (a !== null) totalACE += a;
      if (t !== null) totalTAG += t;
      if (c !== null) totalCGC += c;
    }
  }
  const n = gradings.length;
  return {
    avgPSA: Math.round((sumPSA / n) * 10) / 10,
    avgBGS: Math.round((sumBGS / n) * 10) / 10,
    avgACE: Math.round((sumACE / n) * 10) / 10,
    avgTAG: countTAG > 0 ? Math.round((sumTAG / countTAG) * 10) / 10 : 0,
    avgCGC: countCGC > 0 ? Math.round((sumCGC / countCGC) * 10) / 10 : 0,
    totalPSA, totalBGS, totalACE, totalTAG, totalCGC, cardsWithValues, countTAG, countCGC,
  };
}

function getGradientColor(grade: number): string {
  const ratio = Math.max(0, Math.min(1, (grade - 1) / 9));
  if (ratio <= 0.5) {
    const t = ratio * 2;
    const r = Math.round(239 + (245 - 239) * t);
    const g = Math.round(68 + (158 - 68) * t);
    const b = Math.round(68 + (11 - 68) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
  const t = (ratio - 0.5) * 2;
  const r = Math.round(245 + (16 - 245) * t);
  const g = Math.round(158 + (185 - 158) * t);
  const b = Math.round(11 + (129 - 11) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [gradings, setGradings] = useState<SavedGrading[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [sortMode, setSortMode] = useState<"recent" | "value-high" | "value-low" | "a-z" | "z-a">("recent");
  const [showProReminder, setShowProReminder] = useState(false);
  const { settings } = useSettings();
  const enabledCompanies = settings.enabledCompanies;
  const { isSubscribed, isGateEnabled, remainingFreeGrades, dailyLimit } = useSubscription();
  const proReminderShownRef = useRef(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const stats = computeStats(gradings);

  const getCardAvgValue = useCallback((g: SavedGrading): number => {
    const cv = g.result.cardValue;
    if (!cv) return 0;
    const vals: number[] = [];
    if (enabledCompanies.includes("PSA")) { const v = parseGBP(cv.psaValue); if (v !== null) vals.push(v); }
    if (enabledCompanies.includes("Beckett")) { const v = parseGBP(cv.bgsValue); if (v !== null) vals.push(v); }
    if (enabledCompanies.includes("Ace")) { const v = parseGBP(cv.aceValue); if (v !== null) vals.push(v); }
    if (enabledCompanies.includes("TAG")) { const v = parseGBP(cv.tagValue); if (v !== null) vals.push(v); }
    if (enabledCompanies.includes("CGC")) { const v = parseGBP(cv.cgcValue); if (v !== null) vals.push(v); }
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [enabledCompanies]);

  const filteredGradings = useMemo(() => {
    let list = searchQuery.trim()
      ? gradings.filter((g) => {
          const q = searchQuery.toLowerCase();
          const name = (g.result.cardName || "").toLowerCase();
          const setName = (g.result.setName || g.result.setInfo || "").toLowerCase();
          const setNum = (g.result.setNumber || "").toLowerCase();
          return name.includes(q) || setName.includes(q) || setNum.includes(q);
        })
      : [...gradings];
    switch (sortMode) {
      case "value-high":
        list.sort((a, b) => getCardAvgValue(b) - getCardAvgValue(a));
        break;
      case "value-low":
        list.sort((a, b) => getCardAvgValue(a) - getCardAvgValue(b));
        break;
      case "a-z":
        list.sort((a, b) => (a.result.cardName || "").localeCompare(b.result.cardName || ""));
        break;
      case "z-a":
        list.sort((a, b) => (b.result.cardName || "").localeCompare(a.result.cardName || ""));
        break;
      default:
        break;
    }
    return list;
  }, [gradings, searchQuery, sortMode, getCardAvgValue]);

  const fetchingValuesRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      loadGradings();
      if (isGateEnabled && !isSubscribed && !proReminderShownRef.current) {
        proReminderShownRef.current = true;
        setShowProReminder(true);
      }
    }, [isGateEnabled, isSubscribed])
  );

  const loadGradings = async () => {
    const data = await getGradings();
    setGradings(data);
    fetchMissingValues(data);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    fetchingValuesRef.current = false;
    const data = await getGradings();
    setGradings(data);
    await fetchMissingValues(data);
    setRefreshing(false);
  }, []);

  const fetchMissingValues = async (data: SavedGrading[]) => {
    if (fetchingValuesRef.current) return;
    const missing = data.filter((g) => !g.result.cardValue && g.result.cardName);
    if (missing.length === 0) return;
    fetchingValuesRef.current = true;
    try {
      for (const g of missing) {
        try {
          const resp = await apiRequest("POST", "/api/card-value", {
            cardName: g.result.cardName,
            setName: g.result.setName || g.result.setInfo,
            setNumber: g.result.setNumber,
            psaGrade: g.result.psa.grade,
            bgsGrade: g.result.beckett.overallGrade,
            aceGrade: g.result.ace.overallGrade,
            tagGrade: g.result.tag?.overallGrade,
            cgcGrade: g.result.cgc?.grade,
          });
          const valData = await resp.json();
          await updateGrading(g.id, { result: { ...g.result, cardValue: valData } });
        } catch {}
      }
      const refreshed = await getGradings();
      setGradings(refreshed);
    } finally {
      fetchingValuesRef.current = false;
    }
  };

  const handleDelete = async (id: string) => {
    await deleteGrading(id);
    loadGradings();
  };

  const handleClearAll = () => {
    if (Platform.OS === "web") {
      if (confirm("Clear all grading history? This cannot be undone.")) {
        clearAllGradings().then(() => {
          setGradings([]);
          setSearchQuery("");
        });
      }
    } else {
      Alert.alert("Clear All", "Clear all grading history? This cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: () => {
            clearAllGradings().then(() => {
              setGradings([]);
              setSearchQuery("");
            });
          },
        },
      ]);
    }
  };

  const renderHeader = () => (
    <>
      <View style={styles.heroSection}>
        <View style={styles.heroTitleRow}>
          <Text style={styles.heroTitle}>Grade.<Text style={{ color: Colors.primary }}>IQ</Text></Text>
          <Pressable
            onPress={() => router.push("/onboarding")}
            style={({ pressed }) => [styles.guideBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="help-circle-outline" size={24} color={Colors.textSecondary} />
          </Pressable>
        </View>
        <Text style={styles.heroSubtitle}>AI-Powered Pokemon Card Grading</Text>
      </View>

      {isGateEnabled && (
        <Pressable
          onPress={() => !isSubscribed && router.push("/paywall")}
          style={({ pressed }) => [styles.usageBadge, !isSubscribed && { opacity: pressed ? 0.8 : 1 }]}
        >
          <Ionicons
            name={isSubscribed ? "diamond" : "flame"}
            size={16}
            color={isSubscribed ? "#F59E0B" : (remainingFreeGrades > 0 ? "#10B981" : Colors.primary)}
          />
          {isSubscribed ? (
            <Text style={styles.usageBadgeText}>
              <Text style={{ color: "#F59E0B", fontFamily: "Inter_700Bold" }}>Pro</Text>
              {"  "}Unlimited Grades
            </Text>
          ) : (
            <Text style={styles.usageBadgeText}>
              <Text style={{ color: remainingFreeGrades > 0 ? "#10B981" : Colors.primary, fontFamily: "Inter_700Bold" }}>
                {remainingFreeGrades}
              </Text>
              {" "}/ {dailyLimit} free grades remaining today
            </Text>
          )}
          {!isSubscribed && (
            <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginLeft: "auto" }} />
          )}
        </Pressable>
      )}

      <View style={styles.bubblesRow}>
        <Pressable
          style={({ pressed }) => [styles.bubbleButton, styles.bubblePrimary, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}
          onPress={() => router.push("/grade")}
        >
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bubbleGradient}
          >
            <View style={styles.bubbleIconCircle}>
              <Ionicons name="camera" size={28} color="#fff" />
            </View>
            <Text style={styles.bubblePrimaryText}>Grade a Card</Text>
            <Text style={styles.bubbleSubtext}>Take photos to analyze</Text>
          </LinearGradient>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.bubbleStats, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
          onPress={() => router.push("/bulk")}
        >
          <View style={styles.statsIconCircle}>
            <Ionicons name="layers" size={22} color={Colors.primary} />
          </View>
          <Text style={styles.bubblePrimaryTextSmall}>Bulk Grade</Text>
          <Text style={styles.bubbleSubtext}>Up to 20 cards</Text>
        </Pressable>
      </View>

      {stats && (
        <>
          <View style={styles.statsRow}>
            <View style={styles.countCard}>
              <View style={styles.countCircle}>
                <Text style={styles.countCircleNumber}>{gradings.length}</Text>
              </View>
              <Text style={styles.countCircleLabel}>Cards{"\n"}Graded</Text>
            </View>

            <View style={styles.portfolioCard}>
              <View style={styles.portfolioHeader}>
                <Ionicons name="cash-outline" size={16} color={Colors.primary} />
                <Text style={styles.portfolioTitle}>Est. Portfolio Value</Text>
              </View>
              {(() => {
                const activeValues: { label: string; total: number }[] = [];
                if (enabledCompanies.includes("PSA") && stats.totalPSA > 0) activeValues.push({ label: "PSA", total: stats.totalPSA });
                if (enabledCompanies.includes("Beckett") && stats.totalBGS > 0) activeValues.push({ label: "BGS", total: stats.totalBGS });
                if (enabledCompanies.includes("Ace") && stats.totalACE > 0) activeValues.push({ label: "ACE", total: stats.totalACE });
                if (enabledCompanies.includes("TAG") && stats.totalTAG > 0) activeValues.push({ label: "TAG", total: stats.totalTAG });
                if (enabledCompanies.includes("CGC") && stats.totalCGC > 0) activeValues.push({ label: "CGC", total: stats.totalCGC });
                const avgTotal = activeValues.length > 0
                  ? activeValues.reduce((a, b) => a + b.total, 0) / activeValues.length
                  : 0;
                return (
                  <View style={styles.portfolioTotalSection}>
                    <Text style={styles.portfolioTotalAmount}>
                      {avgTotal > 0 ? `\u00a3${avgTotal.toFixed(2)}` : "No data yet"}
                    </Text>
                    {avgTotal > 0 ? (
                      <Text style={styles.portfolioTotalNote}>
                        Avg. across {activeValues.length} {activeValues.length === 1 ? "company" : "companies"}
                      </Text>
                    ) : (
                      <Text style={styles.portfolioTotalNote}>Fetching prices...</Text>
                    )}
                  </View>
                );
              })()}
              {stats.cardsWithValues > 0 && (
                <>
                  <View style={styles.portfolioDivider} />
                  <View style={styles.valueRows}>
                    {enabledCompanies.includes("PSA") && stats.totalPSA > 0 && (
                      <View style={styles.portfolioValueRow}>
                        <View style={[styles.companyDot, { backgroundColor: Colors.cardPSA }]} />
                        <View style={styles.portfolioLabelRow}><CompanyLabel company="PSA" fontSize={12} /></View>
                        <Text style={styles.portfolioValueAmount}>{"\u00a3"}{stats.totalPSA.toFixed(0)}</Text>
                      </View>
                    )}
                    {enabledCompanies.includes("Beckett") && stats.totalBGS > 0 && (
                      <View style={styles.portfolioValueRow}>
                        <View style={[styles.companyDot, { backgroundColor: Colors.cardBeckett }]} />
                        <View style={styles.portfolioLabelRow}><CompanyLabel company="BGS" fontSize={12} /></View>
                        <Text style={styles.portfolioValueAmount}>{"\u00a3"}{stats.totalBGS.toFixed(0)}</Text>
                      </View>
                    )}
                    {enabledCompanies.includes("Ace") && stats.totalACE > 0 && (
                      <View style={styles.portfolioValueRow}>
                        <View style={[styles.companyDot, { backgroundColor: Colors.cardAce }]} />
                        <View style={styles.portfolioLabelRow}><CompanyLabel company="ACE" fontSize={12} /></View>
                        <Text style={styles.portfolioValueAmount}>{"\u00a3"}{stats.totalACE.toFixed(0)}</Text>
                      </View>
                    )}
                    {enabledCompanies.includes("TAG") && stats.totalTAG > 0 && (
                      <View style={styles.portfolioValueRow}>
                        <View style={[styles.companyDot, { backgroundColor: Colors.cardTAG }]} />
                        <View style={styles.portfolioLabelRow}><CompanyLabel company="TAG" fontSize={12} /></View>
                        <Text style={styles.portfolioValueAmount}>{"\u00a3"}{stats.totalTAG.toFixed(0)}</Text>
                      </View>
                    )}
                    {enabledCompanies.includes("CGC") && stats.totalCGC > 0 && (
                      <View style={styles.portfolioValueRow}>
                        <View style={[styles.companyDot, { backgroundColor: Colors.cardCGC }]} />
                        <View style={styles.portfolioLabelRow}><CompanyLabel company="CGC" fontSize={12} /></View>
                        <Text style={styles.portfolioValueAmount}>{"\u00a3"}{stats.totalCGC.toFixed(0)}</Text>
                      </View>
                    )}
                  </View>
                </>
              )}
              {isGateEnabled && !isSubscribed && (
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={() => router.push("/paywall")}
                >
                  <BlurView intensity={40} tint="dark" style={styles.proBlurOverlay}>
                    <View style={styles.proBlurContent}>
                      <Ionicons name="lock-closed" size={20} color="#F59E0B" />
                      <Text style={styles.proBlurTitle}>Pro Feature</Text>
                      <Text style={styles.proBlurSubtitle}>Full portfolio tracking</Text>
                    </View>
                  </BlurView>
                </Pressable>
              )}
            </View>
          </View>

          <View style={[styles.avgGradesCard, isGateEnabled && !isSubscribed && { overflow: "hidden" as const }]}>
            <View style={styles.portfolioHeader}>
              <Ionicons name="analytics" size={16} color={Colors.textSecondary} />
              <Text style={styles.portfolioTitle}>Average Grades</Text>
            </View>
            <View style={styles.avgGradesRow}>
              {enabledCompanies.includes("PSA") && (
                <>
                  <View style={styles.avgGradeItem}>
                    <Text style={[styles.avgGradeValue, { color: getGradientColor(stats.avgPSA) }]}>{stats.avgPSA.toFixed(1)}</Text>
                    <CompanyLabel company="PSA" fontSize={11} fontFamily="Inter_500Medium" />
                  </View>
                  {(enabledCompanies.includes("Beckett") || enabledCompanies.includes("Ace") || (enabledCompanies.includes("TAG") && stats.countTAG > 0) || (enabledCompanies.includes("CGC") && stats.countCGC > 0)) && <View style={styles.avgDivider} />}
                </>
              )}
              {enabledCompanies.includes("Beckett") && (
                <>
                  <View style={styles.avgGradeItem}>
                    <Text style={[styles.avgGradeValue, { color: getGradientColor(stats.avgBGS) }]}>{stats.avgBGS.toFixed(1)}</Text>
                    <CompanyLabel company="BGS" fontSize={11} fontFamily="Inter_500Medium" />
                  </View>
                  {(enabledCompanies.includes("Ace") || (enabledCompanies.includes("TAG") && stats.countTAG > 0) || (enabledCompanies.includes("CGC") && stats.countCGC > 0)) && <View style={styles.avgDivider} />}
                </>
              )}
              {enabledCompanies.includes("Ace") && (
                <>
                  <View style={styles.avgGradeItem}>
                    <Text style={[styles.avgGradeValue, { color: getGradientColor(stats.avgACE) }]}>{stats.avgACE.toFixed(1)}</Text>
                    <CompanyLabel company="ACE" fontSize={11} fontFamily="Inter_500Medium" />
                  </View>
                  {((enabledCompanies.includes("TAG") && stats.countTAG > 0) || (enabledCompanies.includes("CGC") && stats.countCGC > 0)) && <View style={styles.avgDivider} />}
                </>
              )}
              {enabledCompanies.includes("TAG") && stats.countTAG > 0 && (
                <>
                  <View style={styles.avgGradeItem}>
                    <Text style={[styles.avgGradeValue, { color: getGradientColor(stats.avgTAG) }]}>{stats.avgTAG.toFixed(1)}</Text>
                    <CompanyLabel company="TAG" fontSize={11} fontFamily="Inter_500Medium" />
                  </View>
                  {(enabledCompanies.includes("CGC") && stats.countCGC > 0) && <View style={styles.avgDivider} />}
                </>
              )}
              {enabledCompanies.includes("CGC") && stats.countCGC > 0 && (
                <View style={styles.avgGradeItem}>
                  <Text style={[styles.avgGradeValue, { color: getGradientColor(stats.avgCGC) }]}>{stats.avgCGC.toFixed(1)}</Text>
                  <CompanyLabel company="CGC" fontSize={11} fontFamily="Inter_500Medium" />
                </View>
              )}
            </View>
            {isGateEnabled && !isSubscribed && (
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => router.push("/paywall")}
              >
                <BlurView intensity={40} tint="dark" style={styles.proBlurOverlay}>
                  <View style={styles.proBlurContent}>
                    <Ionicons name="lock-closed" size={18} color="#F59E0B" />
                    <Text style={styles.proBlurSubtitle}>Upgrade to view</Text>
                  </View>
                </BlurView>
              </Pressable>
            )}
          </View>
        </>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Grades</Text>
        <View style={styles.sectionHeaderRight}>
          {gradings.length > 0 && (
            <Text style={styles.sectionCount}>{searchQuery ? `${filteredGradings.length} of ${gradings.length}` : `${gradings.length} cards`}</Text>
          )}
          {gradings.length > 0 && (
            <Pressable onPress={handleClearAll} style={({ pressed }) => [styles.clearAllBtn, { opacity: pressed ? 0.6 : 1 }]}>
              <Ionicons name="trash-outline" size={14} color={Colors.primary} />
              <Text style={styles.clearAllText}>Clear All</Text>
            </Pressable>
          )}
        </View>
      </View>

      {gradings.length > 0 && (
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={16} color={Colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, set, or number..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && Platform.OS !== "ios" && (
            <Pressable onPress={() => setSearchQuery("")} style={styles.searchClear}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
      )}

      {gradings.length > 1 && (
        <View style={styles.sortRow}>
          {([
            { key: "recent" as const, label: "Recent", icon: "time-outline" as const },
            { key: "value-high" as const, label: "£ High", icon: "arrow-up" as const },
            { key: "value-low" as const, label: "£ Low", icon: "arrow-down" as const },
            { key: "a-z" as const, label: "A-Z", icon: "text-outline" as const },
            { key: "z-a" as const, label: "Z-A", icon: "text-outline" as const },
          ]).map((opt) => (
            <Pressable
              key={opt.key}
              style={[styles.sortChip, sortMode === opt.key && styles.sortChipActive]}
              onPress={() => setSortMode(opt.key)}
            >
              <Ionicons name={opt.icon} size={12} color={sortMode === opt.key ? "#fff" : Colors.textSecondary} />
              <Text style={[styles.sortChipText, sortMode === opt.key && styles.sortChipTextActive]}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <FlatList
        data={filteredGradings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.itemPad}>
            <HistoryItem item={item} onDelete={handleDelete} enabledCompanies={enabledCompanies} />
          </View>
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <MaterialCommunityIcons name="card-search" size={40} color={Colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No cards graded yet</Text>
            <Text style={styles.emptyText}>
              Take photos of your Pokemon card to get AI-powered grade estimates
            </Text>
          </View>
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + webBottomInset + 100 }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      />

      {showProReminder && (
        <Modal transparent animationType="fade" visible={showProReminder} onRequestClose={() => setShowProReminder(false)}>
          <View style={proStyles.overlay}>
            <Animated.View entering={SlideInUp.duration(400).springify()} style={proStyles.card}>
              <LinearGradient
                colors={["#1a1200", "#1a0a00", "#000000"]}
                style={proStyles.cardGradient}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
              >
                <View style={proStyles.iconWrap}>
                  <Ionicons name="diamond" size={40} color="#F59E0B" />
                </View>

                <Text style={proStyles.title}>Upgrade to Pro</Text>
                <Text style={proStyles.subtitle}>
                  Unlock unlimited card grading, bulk uploads, and full portfolio tracking for just £2.99/month.
                </Text>

                <View style={proStyles.features}>
                  {[
                    { icon: "checkmark-circle" as const, text: `${remainingFreeGrades} of ${dailyLimit} free grades remaining today` },
                    { icon: "infinite" as const, text: "Unlimited grades with Pro" },
                    { icon: "layers" as const, text: "Bulk grade up to 20 cards" },
                    { icon: "analytics" as const, text: "Full portfolio value tracking" },
                  ].map((f) => (
                    <View key={f.text} style={proStyles.featureRow}>
                      <Ionicons name={f.icon} size={18} color="#F59E0B" />
                      <Text style={proStyles.featureText}>{f.text}</Text>
                    </View>
                  ))}
                </View>

                <Pressable
                  onPress={() => { setShowProReminder(false); router.push("/paywall"); }}
                  style={({ pressed }) => [proStyles.upgradeBtn, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
                >
                  <Text style={proStyles.upgradeBtnText}>View Pro Plans</Text>
                  <Ionicons name="arrow-forward" size={18} color="#000" />
                </Pressable>

                <Pressable
                  onPress={() => setShowProReminder(false)}
                  style={({ pressed }) => [proStyles.dismissBtn, { opacity: pressed ? 0.5 : 0.7 }]}
                >
                  <Text style={proStyles.dismissText}>Continue with free plan</Text>
                </Pressable>
              </LinearGradient>
            </Animated.View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const proStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.25)",
  },
  cardGradient: {
    padding: 32,
    alignItems: "center",
    gap: 16,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(245,158,11,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    color: "#fff",
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
    lineHeight: 22,
  },
  features: {
    width: "100%",
    gap: 10,
    marginTop: 4,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.15)",
  },
  featureText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "#fff",
  },
  upgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#F59E0B",
    marginTop: 8,
  },
  upgradeBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: "#000",
  },
  dismissBtn: {
    paddingVertical: 8,
  },
  dismissText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  heroSection: {
    alignItems: "center",
    paddingTop: 20,
    paddingBottom: 24,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingHorizontal: 16,
  },
  heroSpacer: {
    width: 40,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  guideBtn: {
    padding: 4,
  },
  heroTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 32,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  usageBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  usageBadgeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
  },
  bubblesRow: {
    flexDirection: "row",
    paddingHorizontal: BUBBLE_PAD,
    gap: BUBBLE_GAP,
    marginBottom: 28,
  },
  bubbleButton: {
    width: BUBBLE_WIDTH,
    borderRadius: 20,
    overflow: "hidden",
  },
  bubblePrimary: {
    minHeight: 140,
  },
  bubbleGradient: {
    flex: 1,
    padding: 18,
    justifyContent: "space-between",
  },
  bubbleIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  bubblePrimaryText: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: "#fff",
  },
  bubbleSubtext: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },
  bubbleStats: {
    width: BUBBLE_WIDTH,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  statsIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,60,49,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  bubblePrimaryTextSmall: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: BUBBLE_PAD,
    marginBottom: 20,
    gap: 12,
  },
  countCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 8,
    width: 110,
  },
  countCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,60,49,0.08)",
  },
  countCircleNumber: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: Colors.text,
  },
  countCircleLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 14,
  },
  portfolioCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 10,
    overflow: "hidden" as const,
  },
  avgGradesCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    marginHorizontal: BUBBLE_PAD,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 10,
    overflow: "hidden" as const,
  },
  portfolioHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  portfolioTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  avgGradesRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avgGradeItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  avgGradeValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
  },
  avgGradeLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textMuted,
  },
  avgDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.surfaceBorder,
  },
  portfolioDivider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
  },
  valueRows: {
    gap: 6,
  },
  companyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  portfolioValueRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  portfolioLabelRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    flex: 1,
  },
  portfolioValueLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  portfolioValueAmount: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#10B981",
  },
  portfolioTotalSection: {
    alignItems: "center",
    paddingVertical: 4,
    gap: 2,
  },
  portfolioTotalAmount: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: "#10B981",
  },
  portfolioTotalNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: BUBBLE_PAD,
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  sectionHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sectionCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  sortRow: {
    flexDirection: "row",
    paddingHorizontal: BUBBLE_PAD,
    gap: 6,
    marginTop: 8,
  },
  sortChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  sortChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  sortChipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  sortChipTextActive: {
    color: "#fff",
  },
  clearAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255,60,49,0.1)",
  },
  clearAllText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.primary,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginHorizontal: BUBBLE_PAD,
    marginBottom: 14,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    height: 40,
    padding: 0,
  },
  searchClear: {
    padding: 4,
    marginLeft: 4,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingTop: 50,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  emptyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: Colors.textSecondary,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  listContent: {
    gap: 10,
  },
  itemPad: {
    paddingHorizontal: BUBBLE_PAD,
  },
  historyItem: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  histTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  histBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  thumbnail: {
    width: 48,
    height: 67,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
  },
  historyInfo: {
    flex: 1,
    gap: 2,
  },
  histCardName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
    flex: 1,
  },
  histSetInfo: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  histDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  histValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#4CAF50",
    marginTop: 1,
  },
  historyGrades: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    gap: 4,
  },
  proBlurOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 16,
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
