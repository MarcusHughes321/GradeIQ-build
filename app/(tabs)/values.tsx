import React, { useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Platform,
  Keyboard,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

const RECENT_SEARCHES_KEY = "gradeiq_values_recent_searches";
const MAX_RECENT = 8;

// PSA estimated multipliers & GBP conversion
const GBP_RATE = 0.79; // approximate USD→GBP
const PSA_FEE_GBP = 18;
const PSA10_MULT = 5.5;
const PSA9_MULT = 2.2;

function calcProfitGBP(rawUSD: number, mult: number): number {
  const rawGBP = rawUSD * GBP_RATE;
  return rawGBP * mult - rawGBP - PSA_FEE_GBP;
}

function fmtGBP(n: number): string {
  const abs = Math.abs(n);
  return (n >= 0 ? "+" : "-") + "£" + (abs >= 10 ? Math.round(abs) : abs.toFixed(0));
}

// Profit tier filter thresholds (PSA 10 GBP profit)
const PROFIT_TIERS = [
  { label: "£50+", min: 50 },
  { label: "£100+", min: 100 },
  { label: "£200+", min: 200 },
  { label: "£500+", min: 500 },
  { label: "£1k+", min: 1000 },
] as const;
type ProfitTierMin = typeof PROFIT_TIERS[number]["min"];

interface SearchResult {
  id: string;
  name: string;
  setName: string;
  setId: string;
  number: string;
  imageUrl: string | null;
}

interface BrowseSet {
  id: string;
  name: string;
  nameEn?: string | null;
  series?: string;
  cardCount: number;
  releaseDate?: string;
  logo: string | null;
  symbol?: string | null;
  hasPrices?: boolean;
}

interface TopPick {
  id: string;
  name: string;
  setName: string;
  setId: string;
  number: string;
  imageUrl: string | null;
  rawPriceUSD: number;
}

async function loadRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

async function saveRecentSearches(searches: string[]): Promise<void> {
  await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
}

export default function ValuesScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentLoaded, setRecentLoaded] = useState(false);
  const [profitTier, setProfitTier] = useState<ProfitTierMin>(50);
  const inputRef = useRef<TextInput>(null);

  // Browse sets
  const { data: setsData, isLoading: setsLoading, error: setsError, refetch: setsRefetch } = useQuery<{ sets: BrowseSet[] }>({
    queryKey: ["/api/sets/english"],
    staleTime: 60 * 60 * 1000,
    retry: 2,
    retryDelay: 1500,
  });
  const sets = useMemo(() => setsData?.sets || [], [setsData]);

  // Global Top Grading Picks — explicit queryFn to avoid URL join issues
  const { data: picksData, isLoading: picksLoading, error: picksError, refetch: refetchPicks } = useQuery<{ cards: TopPick[] }>({
    queryKey: ["top-grading-picks"],
    queryFn: async () => {
      const resp = await apiRequest("GET", "/api/cards/top-grading-picks");
      return resp.json();
    },
    staleTime: 2 * 60 * 60 * 1000,
    retry: 1,
    retryDelay: 2000,
  });
  const allPicks = picksData?.cards || [];

  // Filter to cards where estimated PSA10 GBP profit meets the tier, sorted best first
  const tieredPicks = useMemo(() => {
    if (allPicks.length === 0) return [];
    return allPicks
      .filter(c => calcProfitGBP(c.rawPriceUSD, PSA10_MULT) >= profitTier)
      .sort((a, b) => calcProfitGBP(b.rawPriceUSD, PSA10_MULT) - calcProfitGBP(a.rawPriceUSD, PSA10_MULT))
      .slice(0, 10);
  }, [allPicks, profitTier]);

  const loadRecent = useCallback(async () => {
    if (recentLoaded) return;
    const recent = await loadRecentSearches();
    setRecentSearches(recent);
    setRecentLoaded(true);
  }, [recentLoaded]);

  React.useEffect(() => { loadRecent(); }, [loadRecent]);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setLoading(true);
    setSearchError(null);
    setHasSearched(true);
    setResults([]);
    try {
      const resp = await apiRequest("GET", `/api/cards/search?q=${encodeURIComponent(trimmed)}`);
      const data = await resp.json();
      setResults(data.results || []);
      const updated = [trimmed, ...recentSearches.filter(s => s !== trimmed)].slice(0, MAX_RECENT);
      setRecentSearches(updated);
      await saveRecentSearches(updated);
    } catch {
      setSearchError("Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [recentSearches]);

  const handleClear = useCallback(() => {
    setQuery("");
    setResults([]);
    setHasSearched(false);
    setSearchError(null);
    inputRef.current?.focus();
  }, []);

  const handleRemoveRecent = useCallback(async (item: string) => {
    const updated = recentSearches.filter(s => s !== item);
    setRecentSearches(updated);
    await saveRecentSearches(updated);
  }, [recentSearches]);

  const handleTapCard = useCallback((cardId: string, cardName: string, setName: string) => {
    router.push({ pathname: "/card-profit", params: { cardId, cardName, setName } });
  }, []);

  const handleSetPress = useCallback((set: BrowseSet) => {
    router.push({ pathname: "/set-cards", params: { lang: "english", setId: set.id, setName: set.name } });
  }, []);

  const renderTopCard = (item: TopPick, index: number) => {
    const rawGBP = item.rawPriceUSD * GBP_RATE;
    const profit10 = calcProfitGBP(item.rawPriceUSD, PSA10_MULT);
    const profit9 = calcProfitGBP(item.rawPriceUSD, PSA9_MULT);

    return (
      <Pressable
        key={item.id}
        style={({ pressed }) => [styles.topCard, { opacity: pressed ? 0.8 : 1 }]}
        onPress={() => handleTapCard(item.id, item.name, item.setName)}
      >
        <View style={styles.topCardRank}>
          <Text style={styles.topCardRankText}>#{index + 1}</Text>
        </View>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.topCardImg} contentFit="contain" />
        ) : (
          <View style={[styles.topCardImg, styles.topCardImgPlaceholder]}>
            <Ionicons name="image-outline" size={20} color={Colors.textMuted} />
          </View>
        )}
        <Text style={styles.topCardName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.topCardSet} numberOfLines={1}>{item.setName}</Text>
        <View style={styles.topCardDivider} />
        <View style={styles.topCardRow}>
          <Text style={styles.topCardLabel}>Raw</Text>
          <Text style={styles.topCardValue}>£{Math.round(rawGBP)}</Text>
        </View>
        <View style={styles.topCardRow}>
          <Text style={styles.topCardLabel}>PSA 10</Text>
          <Text style={[styles.topCardProfit, { color: profit10 >= 0 ? "#22c55e" : Colors.error }]}>
            {fmtGBP(profit10)}
          </Text>
        </View>
        <View style={styles.topCardRow}>
          <Text style={styles.topCardLabel}>PSA 9</Text>
          <Text style={[styles.topCardProfit, { color: profit9 >= 0 ? "#f59e0b" : Colors.error }]}>
            {fmtGBP(profit9)}
          </Text>
        </View>
        <Text style={styles.topCardHint}>Tap for full breakdown</Text>
      </Pressable>
    );
  };

  const listHeader = (
    <View>
      {/* Title */}
      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 14 }]}>
        <Text style={styles.headerTitle}>Values</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={styles.searchIcon} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="e.g. 151 Charizard ex"
            placeholderTextColor={Colors.textMuted}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => doSearch(query)}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
          />
          {query.length > 0 && (
            <Pressable onPress={handleClear} hitSlop={12}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable
          style={({ pressed }) => [styles.searchBtn, { opacity: pressed ? 0.8 : 1 }]}
          onPress={() => doSearch(query)}
        >
          <Text style={styles.searchBtnText}>Search</Text>
        </Pressable>
      </View>

      {/* Search feedback */}
      {loading && (
        <View style={styles.inlineFeedback}>
          <ActivityIndicator color={Colors.primary} size="small" />
          <Text style={styles.feedbackText}>Searching…</Text>
        </View>
      )}
      {!loading && searchError && (
        <View style={styles.inlineFeedback}>
          <Ionicons name="alert-circle-outline" size={16} color={Colors.error} />
          <Text style={[styles.feedbackText, { color: Colors.error }]}>{searchError}</Text>
        </View>
      )}
      {!loading && !searchError && hasSearched && results.length === 0 && (
        <View style={styles.inlineFeedback}>
          <Text style={styles.feedbackText}>No cards found for "{query}"</Text>
        </View>
      )}

      {/* Search results */}
      {!loading && results.length > 0 && (
        <View style={styles.searchResults}>
          <Text style={styles.sectionLabel}>Search Results</Text>
          {results.map(card => (
            <View key={card.id}>
              <CardResultRow card={card} onPress={() => handleTapCard(card.id, card.name, card.setName)} />
              <View style={styles.separator} />
            </View>
          ))}
        </View>
      )}

      {/* Recent searches */}
      {!hasSearched && recentSearches.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.sectionLabel}>Recent Searches</Text>
          {recentSearches.map(item => (
            <View key={item} style={styles.recentRow}>
              <Pressable style={styles.recentTerm} onPress={() => { setQuery(item); doSearch(item); }}>
                <Ionicons name="time-outline" size={16} color={Colors.textMuted} />
                <Text style={styles.recentText}>{item}</Text>
              </Pressable>
              <Pressable onPress={() => handleRemoveRecent(item)} hitSlop={12}>
                <Ionicons name="close" size={16} color={Colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* ── Top Grading Picks ── */}
      <View style={styles.topPicksSection}>
        <View style={styles.topPicksHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.topPicksTitle}>Top Grading Picks</Text>
            <Text style={styles.topPicksSubtitle}>Est. PSA 10 profit across all English sets</Text>
          </View>
        </View>

        {/* Profit tier tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tierTabsScroll}
        >
          {PROFIT_TIERS.map(tier => (
            <Pressable
              key={tier.min}
              style={[styles.tierTab, profitTier === tier.min && styles.tierTabActive]}
              onPress={() => setProfitTier(tier.min)}
            >
              <Text style={[styles.tierTabText, profitTier === tier.min && styles.tierTabTextActive]}>
                {tier.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {picksLoading && (
          <View style={styles.inlineFeedback}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={styles.feedbackText}>Loading picks…</Text>
          </View>
        )}

        {!picksLoading && !!picksError && (
          <View style={styles.inlineFeedback}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.error} />
            <Text style={[styles.feedbackText, { color: Colors.error, flex: 1 }]}>
              Couldn't load picks
            </Text>
            <Pressable onPress={() => refetchPicks()} hitSlop={8}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {!picksLoading && !picksError && tieredPicks.length === 0 && allPicks.length > 0 && (
          <View style={styles.inlineFeedback}>
            <Text style={styles.feedbackText}>No cards found at this profit tier</Text>
          </View>
        )}

        {!picksLoading && !picksError && tieredPicks.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.topPicksScroll}
          >
            {tieredPicks.map((card, i) => renderTopCard(card, i))}
          </ScrollView>
        )}

        {!picksLoading && !picksError && tieredPicks.length > 0 && (
          <View style={styles.disclaimer}>
            <Ionicons name="information-circle-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.disclaimerText}>
              Estimated using PSA multipliers (×5.5 for PSA 10, ×2.2 for PSA 9) at ~£0.79/$ · −£18 grading fee. Verify prices before submitting.
            </Text>
          </View>
        )}
      </View>

      {/* ── Browse Sets header ── */}
      <View style={styles.browseSectionHeader}>
        <Text style={styles.browseSectionTitle}>Browse Sets</Text>
        <View style={styles.langPill}>
          <Text style={styles.langPillText}>🇬🇧 English only · more coming soon</Text>
        </View>
      </View>

      {setsLoading && (
        <View style={styles.inlineFeedback}>
          <ActivityIndicator color={Colors.primary} size="small" />
          <Text style={styles.feedbackText}>Loading sets…</Text>
        </View>
      )}
      {!setsLoading && !!setsError && (
        <View style={styles.inlineFeedback}>
          <Ionicons name="alert-circle-outline" size={16} color={Colors.error} />
          <Text style={[styles.feedbackText, { color: Colors.error, flex: 1 }]}>Couldn't load sets</Text>
          <Pressable onPress={() => setsRefetch()} hitSlop={8}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <FlatList
      style={styles.container}
      data={sets}
      keyExtractor={item => item.id}
      ListHeaderComponent={listHeader}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      contentContainerStyle={{ paddingBottom: insets.bottom + webBottomInset + 100 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => <SetRow set={item} onPress={() => handleSetPress(item)} />}
    />
  );
}

// ─── Set Row ──────────────────────────────────────────────────────────────────

function SetRow({ set, onPress }: { set: BrowseSet; onPress: () => void }) {
  const hasPrices = set.hasPrices !== false;
  return (
    <Pressable style={({ pressed }) => [styles.setRow, { opacity: pressed ? 0.8 : 1 }]} onPress={onPress}>
      <View style={styles.setLogoContainer}>
        {set.logo ? (
          <Image source={{ uri: set.logo }} style={styles.setLogo} contentFit="contain" />
        ) : (
          <View style={styles.setLogoPlaceholder}>
            <Ionicons name="albums-outline" size={20} color={Colors.textMuted} />
          </View>
        )}
      </View>
      <View style={styles.setInfo}>
        <Text style={styles.setName} numberOfLines={2}>{set.nameEn || set.name}</Text>
        {set.series ? <Text style={styles.setSeries} numberOfLines={1}>{set.series}</Text> : null}
        <View style={styles.setMeta}>
          <Text style={styles.setCardCount}>{set.cardCount} cards</Text>
          {hasPrices && (
            <View style={styles.pricesBadge}>
              <Ionicons name="pricetag-outline" size={10} color="#22c55e" />
              <Text style={styles.pricesBadgeText}>TCGplayer prices</Text>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

// ─── Card Result Row ──────────────────────────────────────────────────────────

function CardResultRow({ card, onPress }: { card: SearchResult; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.cardRow, { opacity: pressed ? 0.8 : 1 }]} onPress={onPress}>
      <View style={styles.cardImageContainer}>
        {card.imageUrl ? (
          <Image source={{ uri: card.imageUrl }} style={styles.cardImage} contentFit="contain" />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Ionicons name="image-outline" size={24} color={Colors.textMuted} />
          </View>
        )}
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={2}>{card.name}</Text>
        <Text style={styles.cardSet} numberOfLines={1}>{card.setName}</Text>
        {card.number ? <Text style={styles.cardNumber}>#{card.number}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 16, paddingBottom: 10 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 26, color: Colors.text },

  // Search
  searchRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    alignItems: "center",
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 8,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.text, paddingVertical: 0 },
  searchBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },

  inlineFeedback: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  feedbackText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary },
  retryText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.primary },

  searchResults: { paddingHorizontal: 16, paddingBottom: 4 },
  recentSection: { paddingHorizontal: 16, paddingBottom: 4 },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  recentTerm: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  recentText: { fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.text },

  // Top Grading Picks
  topPicksSection: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
    paddingTop: 14,
    paddingBottom: 12,
  },
  topPicksHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 12,
  },
  topPicksTitle: { fontFamily: "Inter_700Bold", fontSize: 17, color: Colors.text },
  topPicksSubtitle: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  tierTabsScroll: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  tierTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  tierTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tierTabText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textMuted,
  },
  tierTabTextActive: {
    color: "#fff",
  },
  topPicksScroll: { paddingHorizontal: 16, gap: 10 },

  topCard: {
    width: 145,
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    position: "relative",
  },
  topCardRank: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    zIndex: 1,
  },
  topCardRankText: { fontFamily: "Inter_700Bold", fontSize: 11, color: Colors.textMuted },
  topCardImg: { width: "100%" as any, height: 95, borderRadius: 6, backgroundColor: Colors.surface, marginBottom: 6 },
  topCardImgPlaceholder: { alignItems: "center", justifyContent: "center" },
  topCardName: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.text, lineHeight: 16, minHeight: 32 },
  topCardSet: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, marginBottom: 6, marginTop: 1 },
  topCardDivider: { height: 1, backgroundColor: Colors.surfaceBorder, marginBottom: 6 },
  topCardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  topCardLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted },
  topCardValue: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textSecondary },
  topCardProfit: { fontFamily: "Inter_700Bold", fontSize: 11 },
  topCardHint: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "center", marginTop: 6 },

  disclaimer: { flexDirection: "row", alignItems: "flex-start", gap: 5, paddingHorizontal: 16, marginTop: 8 },
  disclaimerText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, flex: 1, lineHeight: 15 },

  // Browse section
  browseSectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    gap: 6,
  },
  browseSectionTitle: { fontFamily: "Inter_700Bold", fontSize: 17, color: Colors.text },
  langPill: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  langPillText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },

  // Set row
  setRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  setLogoContainer: { width: 72, height: 40, justifyContent: "center", alignItems: "center" },
  setLogo: { width: 72, height: 40 },
  setLogoPlaceholder: {
    width: 72,
    height: 40,
    backgroundColor: Colors.surface,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  setInfo: { flex: 1, gap: 2 },
  setName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text, lineHeight: 20 },
  setSeries: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  setMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  setCardCount: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textMuted },
  pricesBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(34,197,94,0.1)",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pricesBadgeText: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#22c55e" },

  // Card result row
  cardRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  cardImageContainer: { width: 52, height: 72, borderRadius: 6, overflow: "hidden", backgroundColor: Colors.surface },
  cardImage: { width: 52, height: 72 },
  cardImagePlaceholder: { alignItems: "center", justifyContent: "center" },
  cardInfo: { flex: 1, gap: 3 },
  cardName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text, lineHeight: 20 },
  cardSet: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  cardNumber: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textMuted },

  separator: { height: 1, backgroundColor: Colors.surfaceBorder },
});
