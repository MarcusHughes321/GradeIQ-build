import React, { useCallback, useState } from "react";
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
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { getGradings, deleteGrading, clearAllGradings } from "@/lib/storage";
import type { SavedGrading } from "@/lib/types";
import GradeCircle from "@/components/GradeCircle";
import { useSettings } from "@/lib/settings-context";

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
      <Image source={{ uri: item.frontImage }} style={styles.thumbnail} contentFit="cover" />
      <View style={styles.historyInfo}>
        <Text style={styles.histCardName} numberOfLines={1}>
          {item.result.cardName || "Unknown Card"}
        </Text>
        <Text style={styles.histSetInfo} numberOfLines={1}>
          {[item.result.setName || item.result.setInfo, item.result.setNumber].filter(Boolean).join(" - ") || "Pokemon Card"}
        </Text>
        <Text style={styles.histDate}>{dateStr}</Text>
      </View>
      <View style={styles.historyGrades}>
        {enabledCompanies.includes("PSA") && <GradeCircle grade={item.result.psa.grade} size={36} label="PSA" />}
        {enabledCompanies.includes("Beckett") && <GradeCircle grade={item.result.beckett.overallGrade} size={36} label="BGS" />}
        {enabledCompanies.includes("Ace") && <GradeCircle grade={item.result.ace.overallGrade} size={36} label="ACE" />}
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
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
  totalPSA: number;
  totalBGS: number;
  totalACE: number;
  cardsWithValues: number;
}

function computeStats(gradings: SavedGrading[]): PortfolioStats | null {
  if (gradings.length === 0) return null;
  let sumPSA = 0, sumBGS = 0, sumACE = 0;
  let totalPSA = 0, totalBGS = 0, totalACE = 0;
  let cardsWithValues = 0;
  for (const g of gradings) {
    sumPSA += g.result.psa.grade;
    sumBGS += g.result.beckett.overallGrade;
    sumACE += g.result.ace.overallGrade;
    const cv = g.result.cardValue;
    if (cv) {
      const p = parseGBP(cv.psaValue);
      const b = parseGBP(cv.bgsValue);
      const a = parseGBP(cv.aceValue);
      if (p !== null || b !== null || a !== null) cardsWithValues++;
      if (p !== null) totalPSA += p;
      if (b !== null) totalBGS += b;
      if (a !== null) totalACE += a;
    }
  }
  const n = gradings.length;
  return {
    avgPSA: Math.round((sumPSA / n) * 10) / 10,
    avgBGS: Math.round((sumBGS / n) * 10) / 10,
    avgACE: Math.round((sumACE / n) * 10) / 10,
    totalPSA, totalBGS, totalACE, cardsWithValues,
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
  const { settings } = useSettings();
  const enabledCompanies = settings.enabledCompanies;

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const stats = computeStats(gradings);

  const filteredGradings = searchQuery.trim()
    ? gradings.filter((g) => {
        const q = searchQuery.toLowerCase();
        const name = (g.result.cardName || "").toLowerCase();
        const setName = (g.result.setName || g.result.setInfo || "").toLowerCase();
        const setNum = (g.result.setNumber || "").toLowerCase();
        return name.includes(q) || setName.includes(q) || setNum.includes(q);
      })
    : gradings;

  useFocusEffect(
    useCallback(() => {
      loadGradings();
    }, [])
  );

  const loadGradings = async () => {
    const data = await getGradings();
    setGradings(data);
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
        <View style={styles.heroTopRow}>
          <View style={styles.heroSpacer} />
          <Text style={styles.heroTitle}>Grade.<Text style={{ color: Colors.primary }}>IQ</Text></Text>
          <Pressable
            onPress={() => router.push("/settings")}
            style={({ pressed }) => [styles.settingsBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="settings-outline" size={22} color={Colors.textSecondary} />
          </Pressable>
        </View>
        <Text style={styles.heroSubtitle}>AI-Powered Pokemon Card Grading</Text>
      </View>

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
          <Text style={styles.statsNumber}>{gradings.length}</Text>
          <Text style={styles.statsLabel}>Cards{"\n"}Graded</Text>
          <Text style={styles.bulkHint}>Tap to bulk grade</Text>
        </Pressable>
      </View>

      {stats && (
        <View style={styles.portfolioCard}>
          <View style={styles.portfolioHeader}>
            <Ionicons name="analytics" size={16} color={Colors.textSecondary} />
            <Text style={styles.portfolioTitle}>Average Grades</Text>
          </View>
          <View style={styles.avgGradesRow}>
            {enabledCompanies.includes("PSA") && (
              <>
                <View style={styles.avgGradeItem}>
                  <Text style={[styles.avgGradeValue, { color: getGradientColor(stats.avgPSA) }]}>{stats.avgPSA.toFixed(1)}</Text>
                  <Text style={[styles.avgGradeLabel, { color: Colors.cardPSA }]}>PSA</Text>
                </View>
                {(enabledCompanies.includes("Beckett") || enabledCompanies.includes("Ace")) && <View style={styles.avgDivider} />}
              </>
            )}
            {enabledCompanies.includes("Beckett") && (
              <>
                <View style={styles.avgGradeItem}>
                  <Text style={[styles.avgGradeValue, { color: getGradientColor(stats.avgBGS) }]}>{stats.avgBGS.toFixed(1)}</Text>
                  <Text style={styles.avgGradeLabel}>BGS</Text>
                </View>
                {enabledCompanies.includes("Ace") && <View style={styles.avgDivider} />}
              </>
            )}
            {enabledCompanies.includes("Ace") && (
              <View style={styles.avgGradeItem}>
                <Text style={[styles.avgGradeValue, { color: getGradientColor(stats.avgACE) }]}>{stats.avgACE.toFixed(1)}</Text>
                <Text style={styles.avgGradeLabel}>ACE</Text>
              </View>
            )}
          </View>

          {stats.cardsWithValues > 0 && (
            <>
              <View style={styles.portfolioDivider} />
              <View style={styles.portfolioHeader}>
                <Ionicons name="cash-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.portfolioTitle}>Estimated Portfolio Value</Text>
              </View>
              <View style={styles.valueRows}>
                {enabledCompanies.includes("PSA") && stats.totalPSA > 0 && (
                  <View style={styles.portfolioValueRow}>
                    <Text style={styles.portfolioValueLabel}>PSA Graded</Text>
                    <Text style={styles.portfolioValueAmount}>{"\u00a3"}{stats.totalPSA.toFixed(2)}</Text>
                  </View>
                )}
                {enabledCompanies.includes("Beckett") && stats.totalBGS > 0 && (
                  <View style={styles.portfolioValueRow}>
                    <Text style={styles.portfolioValueLabel}>BGS Graded</Text>
                    <Text style={styles.portfolioValueAmount}>{"\u00a3"}{stats.totalBGS.toFixed(2)}</Text>
                  </View>
                )}
                {enabledCompanies.includes("Ace") && stats.totalACE > 0 && (
                  <View style={styles.portfolioValueRow}>
                    <Text style={styles.portfolioValueLabel}>ACE Graded</Text>
                    <Text style={styles.portfolioValueAmount}>{"\u00a3"}{stats.totalACE.toFixed(2)}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.portfolioNote}>Based on {stats.cardsWithValues} of {gradings.length} cards with eBay data</Text>
            </>
          )}
        </View>
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
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + webBottomInset + 20 }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={true}
      />
    </View>
  );
}

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
  statsNumber: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: Colors.text,
  },
  statsLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 16,
  },
  bulkHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.primary,
    marginTop: 2,
  },
  portfolioCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: BUBBLE_PAD,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 12,
  },
  portfolioHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  portfolioValueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  portfolioNote: {
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
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 14,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  thumbnail: {
    width: 54,
    height: 75,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
  },
  historyInfo: {
    flex: 1,
    gap: 3,
  },
  histCardName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
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
    marginTop: 2,
  },
  historyGrades: {
    flexDirection: "row",
    gap: 6,
  },
});
