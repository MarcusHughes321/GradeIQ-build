import React, { useState, useCallback, useRef, useMemo, memo } from "react";
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
import { useSettings } from "@/lib/settings-context";
import { ALL_COMPANIES, CURRENCIES } from "@/lib/settings";
import type { CompanyId } from "@/lib/settings";

interface EbayAllGrades {
  psa10: number; psa9: number; psa8: number; psa7: number;
  bgs10: number; bgs95: number; bgs9: number; bgs85: number; bgs8: number;
  ace10: number; ace9: number; ace8: number;
  fetchedAt?: number;
  isStale?: boolean;
  tag10: number; tag9: number; tag8: number;
  cgc10: number; cgc95: number; cgc9: number; cgc8: number;
  raw: number;
}

const RECENT_SEARCHES_KEY = "gradeiq_values_recent_searches";
const MAX_RECENT = 8;

// Fallback exchange rates (used if the live API hasn't loaded yet)
const FALLBACK_RATES: Record<string, number> = { USD: 1, GBP: 0.79, EUR: 0.92, AUD: 1.55, CAD: 1.38, JPY: 150 };

interface ExchangeRateData {
  rates: Record<string, number>;
  updatedAt: string;
}

function fmtPrice(usd: number, rate: number, symbol: string, round = true): string {
  const v = usd * rate;
  if (symbol === "¥") return `¥${Math.round(v)}`;
  return round ? `${symbol}${Math.round(v)}` : `${symbol}${v.toFixed(2)}`;
}

// Price tiers — "Under £X" buckets based on raw TCGPlayer market price in GBP
const PRICE_TIERS = [
  { label: "Under £5",    maxGBP: 5    },
  { label: "Under £10",   maxGBP: 10   },
  { label: "Under £20",   maxGBP: 20   },
  { label: "Under £50",   maxGBP: 50   },
  { label: "Under £100",  maxGBP: 100  },
  { label: "Under £200",  maxGBP: 200  },
  { label: "Under £500",  maxGBP: 500  },
  { label: "Under £1000", maxGBP: 1000 },
] as const;
type PriceTierMax = typeof PRICE_TIERS[number]["maxGBP"];

interface SearchResult {
  id: string;
  name: string;
  setName: string;
  setId: string;
  number: string;
  imageUrl: string | null;
}

// WOTC-era sets that were printed in both 1st Edition and Unlimited runs
const WOTC_1ST_EDITION_SETS: Record<string, string> = {
  "base1": "Base Set",
  "base2": "Jungle",
  "base3": "Fossil",
  "base5": "Team Rocket",
  "gym1":  "Gym Heroes",
  "gym2":  "Gym Challenge",
  "neo1":  "Neo Genesis",
  "neo2":  "Neo Discovery",
  "neo3":  "Neo Revelation",
  "neo4":  "Neo Destiny",
};

interface BrowseSet {
  id: string;
  name: string;
  nameEn?: string | null;
  series?: string;
  cardCount: number;
  releaseDate?: string;
  logo: string | null;
  symbol?: string | null;
  hasCardData?: boolean | null;
  hasPrices?: boolean | null;
  edition?: "1st" | "unlimited"; // only set for WOTC split entries
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

// Server-side pre-computed pick returned by /api/top-picks-precomputed
interface PrecomputedPick {
  cardId: string;
  cardName: string;
  setName: string;
  setId: string;
  number: string;
  imageUrl: string | null;
  rawPriceUSD: number;
  ebay: {
    psa10: number; psa9: number;
    bgs95: number; bgs9: number;
    ace10: number; tag10: number; cgc10: number;
    raw: number;
    fetchedAt: string | null;
    isStale: boolean;
  };
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

// Per-company config for Top Picks ranking
const PICKS_COMPANY_CONFIG: Record<CompanyId, {
  topEbayKey: keyof EbayAllGrades;
  topGradeLabel: string;
  gradesAsc: { key: keyof EbayAllGrades; label: number }[];
}> = {
  PSA:     { topEbayKey: "psa10",  topGradeLabel: "PSA 10",  gradesAsc: [{ key: "psa7", label: 7 }, { key: "psa8", label: 8 }, { key: "psa9", label: 9 }, { key: "psa10", label: 10 }] },
  Beckett: { topEbayKey: "bgs95",  topGradeLabel: "BGS 9.5", gradesAsc: [{ key: "bgs8", label: 8 }, { key: "bgs85", label: 8.5 }, { key: "bgs9", label: 9 }, { key: "bgs95", label: 9.5 }, { key: "bgs10", label: 10 }] },
  Ace:     { topEbayKey: "ace10",  topGradeLabel: "ACE 10",  gradesAsc: [{ key: "ace8", label: 8 }, { key: "ace9", label: 9 }, { key: "ace10", label: 10 }] },
  TAG:     { topEbayKey: "tag10",  topGradeLabel: "TAG 10",  gradesAsc: [{ key: "tag8", label: 8 }, { key: "tag9", label: 9 }, { key: "tag10", label: 10 }] },
  CGC:     { topEbayKey: "cgc10",  topGradeLabel: "CGC 10",  gradesAsc: [{ key: "cgc8", label: 8 }, { key: "cgc9", label: 9 }, { key: "cgc95", label: 9.5 }, { key: "cgc10", label: 10 }] },
};

// Presentational card — all eBay metrics precomputed by parent
const TopPickCard = memo(({ item, index, onPress, topGradeLocal, topGradeProfit, topGradeLabel, minProfitGrade, minProfitLabel, ebayLoading, currencySymbol, currencyRate, isStale }: {
  item: TopPick;
  index: number;
  onPress: () => void;
  topGradeLocal: number | null;
  topGradeProfit: number | null;
  topGradeLabel: string;
  minProfitGrade: number | null;
  minProfitLabel: string | null;
  ebayLoading: boolean;
  currencySymbol: string;
  currencyRate: number;
  isStale?: boolean;
}) => {
  const rawLocal = Math.round(item.rawPriceUSD * currencyRate);
  const sym = currencySymbol;

  return (
    <Pressable
      style={({ pressed }) => [cardStyles.card, { opacity: pressed ? 0.8 : 1 }]}
      onPress={onPress}
    >
      <View style={cardStyles.rank}>
        <Text style={cardStyles.rankText}>#{index + 1}</Text>
      </View>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={cardStyles.img} contentFit="contain" />
      ) : (
        <View style={[cardStyles.img, cardStyles.imgPlaceholder]}>
          <Ionicons name="image-outline" size={20} color={Colors.textMuted} />
        </View>
      )}
      <Text style={cardStyles.name} numberOfLines={2}>{item.name}</Text>
      <Text style={cardStyles.set}  numberOfLines={1}>{item.setName}</Text>
      <View style={cardStyles.divider} />

      {/* Raw TCGPlayer price */}
      <View style={cardStyles.row}>
        <Text style={cardStyles.label}>Raw</Text>
        <Text style={cardStyles.value}>{sym}{rawLocal}</Text>
      </View>

      {/* Top grade eBay last sold */}
      <View style={cardStyles.row}>
        <Text style={cardStyles.label}>{topGradeLabel}</Text>
        {ebayLoading ? (
          <ActivityIndicator size="small" color={Colors.textMuted} style={{ transform: [{ scale: 0.65 }] }} />
        ) : topGradeLocal !== null ? (
          <Text style={[cardStyles.graded, { color: "#22c55e" }]}>{sym}{topGradeLocal}</Text>
        ) : (
          <Text style={cardStyles.muted}>—</Text>
        )}
      </View>

      {/* Top grade net profit */}
      <View style={cardStyles.row}>
        <Text style={cardStyles.label}>Profit</Text>
        {ebayLoading ? (
          <ActivityIndicator size="small" color={Colors.textMuted} style={{ transform: [{ scale: 0.65 }] }} />
        ) : topGradeProfit !== null ? (
          <Text style={[cardStyles.graded, { color: topGradeProfit >= 0 ? "#22c55e" : "#ef4444" }]}>
            {topGradeProfit >= 0 ? "+" : ""}{sym}{Math.abs(topGradeProfit)}
          </Text>
        ) : (
          <Text style={cardStyles.muted}>—</Text>
        )}
      </View>

      {isStale && (
        <Text style={[cardStyles.hint, { color: "#f59e0b", fontSize: 9 }]}>⏱ Archived prices</Text>
      )}
      <Text style={cardStyles.hint}>Tap for full breakdown</Text>
    </Pressable>
  );
});

const cardStyles = StyleSheet.create({
  card:         { width: 150, backgroundColor: Colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  rank:         { position: "absolute", top: 8, right: 8, backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  rankText:     { fontFamily: "Inter_700Bold", fontSize: 10, color: "#fff" },
  img:          { width: "100%", height: 100, marginBottom: 8, borderRadius: 6 },
  imgPlaceholder: { backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" },
  name:         { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.text, marginBottom: 2 },
  set:          { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textMuted, marginBottom: 8 },
  divider:      { height: 1, backgroundColor: Colors.surfaceBorder, marginBottom: 8 },
  row:          { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  label:        { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted },
  value:        { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.text },
  graded:       { fontFamily: "Inter_700Bold", fontSize: 12 },
  muted:        { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textMuted },
  samples:      { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted, marginTop: 2, textAlign: "right" },
  hint:         { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.primary, marginTop: 6, textAlign: "center" },
});

export default function ValuesScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const { settings } = useSettings();

  // Live exchange rates — refreshed daily from server
  const { data: ratesData } = useQuery<ExchangeRateData>({
    queryKey: ["/api/exchange-rates"],
    staleTime: 22 * 60 * 60 * 1000,
  });
  const currency = settings.currency ?? "GBP";
  const currencyInfo = CURRENCIES.find(c => c.code === currency) ?? CURRENCIES[0];
  const currencySymbol = currencyInfo.symbol;
  const currencyRate = ratesData?.rates?.[currency] ?? FALLBACK_RATES[currency] ?? 1;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentLoaded, setRecentLoaded] = useState(false);
  const [priceTier, setPriceTier] = useState<PriceTierMax>(50);
  const inputRef = useRef<TextInput>(null);

  // Browse sets
  const { data: setsData, isLoading: setsLoading, error: setsError, refetch: setsRefetch } = useQuery<{ sets: BrowseSet[] }>({
    queryKey: ["/api/sets/english"],
    staleTime: 60 * 60 * 1000,
    retry: 2,
    retryDelay: 1500,
    // Poll every 6s while the server is still computing price status in the background
    refetchInterval: (query) => {
      const sets = (query.state.data as any)?.sets as BrowseSet[] | undefined;
      if (!sets) return false;
      return sets.some(s => s.hasPrices === null) ? 6000 : false;
    },
  });
  const sets = useMemo(() => setsData?.sets || [], [setsData]);

  const [setSearch, setSetSearch] = useState("");
  const setSearchRef = useRef<TextInput>(null);

  // Expand WOTC sets into two entries (1st Edition + Unlimited) before filtering
  const expandedSets = useMemo<BrowseSet[]>(() => {
    const result: BrowseSet[] = [];
    for (const s of sets) {
      if (WOTC_1ST_EDITION_SETS[s.id]) {
        result.push({ ...s, name: s.name + " · 1st Edition", edition: "1st" });
        result.push({ ...s, name: s.name + " · Unlimited",   edition: "unlimited" });
      } else {
        result.push(s);
      }
    }
    return result;
  }, [sets]);

  const filteredSets = useMemo(() => {
    const q = setSearch.trim().toLowerCase();
    if (!q) return expandedSets;
    return expandedSets.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.nameEn && s.nameEn.toLowerCase().includes(q)) ||
      (s.series && s.series.toLowerCase().includes(q))
    );
  }, [expandedSets, setSearch]);

  // Pre-computed top grading picks — single fast DB read per tier, no live eBay calls
  const { data: precomputedData, isLoading: picksLoading, error: picksError, refetch: refetchPicks } = useQuery<{
    picks: PrecomputedPick[];
    hasData: boolean;
    lastJobRun: string | null;
  }>({
    queryKey: ["top-picks-precomputed", priceTier],
    queryFn: async () => {
      const resp = await apiRequest("GET", `/api/top-picks-precomputed?tierMaxGbp=${priceTier}`);
      return resp.json();
    },
    staleTime: 30 * 60 * 1000, // 30 min — re-check mid-day but not on every mount
    retry: 1,
    retryDelay: 2000,
  });
  const precomputedPicks: PrecomputedPick[] = precomputedData?.picks ?? [];

  // Preferred picks company — fall back to first enabled if the saved preference isn't enabled
  const effectivePicksCompany: CompanyId = useMemo(() => {
    const preferred = settings.preferredPicksCompany;
    if (settings.enabledCompanies.includes(preferred)) return preferred;
    return (settings.enabledCompanies[0] as CompanyId) ?? "PSA";
  }, [settings.preferredPicksCompany, settings.enabledCompanies]);

  const picksConfig = PICKS_COMPANY_CONFIG[effectivePicksCompany];

  // Enrich each pre-computed pick with the preferred company's profit.
  // All monetary values are in the user's selected currency.
  const enrichedTopPicks = useMemo(() => {
    const cfg = picksConfig;

    const enriched = precomputedPicks.map(pick => {
      const ebay = pick.ebay as any as EbayAllGrades;
      const rawLocal  = pick.rawPriceUSD * currencyRate;
      const topEbayUSD = (ebay[cfg.topEbayKey] as number) ?? 0;
      const topGradeLocal  = topEbayUSD > 0 ? Math.round(topEbayUSD * currencyRate) : null;
      const topGradeProfit = topGradeLocal !== null ? Math.round(topGradeLocal - rawLocal) : null;

      // Min break-even grade (uses full JSONB grades stored by the job)
      let minProfitGrade: number | null = null;
      let minProfitLabel: string | null = null;
      if (rawLocal > 0) {
        for (const g of cfg.gradesAsc) {
          const ebayUSD = (ebay[g.key] as number) ?? 0;
          if (ebayUSD > 0 && (ebayUSD * currencyRate - rawLocal) >= 0) {
            minProfitGrade = g.label;
            minProfitLabel = `${effectivePicksCompany === "Beckett" ? "BGS" : effectivePicksCompany} ${g.label}`;
            break;
          }
        }
      }

      // Adapt PrecomputedPick to the shape TopPickCard expects
      const pickAsTopPick: TopPick = {
        id: pick.cardId, name: pick.cardName, setName: pick.setName,
        setId: pick.setId, number: pick.number, imageUrl: pick.imageUrl,
        rawPriceUSD: pick.rawPriceUSD,
      };

      return {
        pick: pickAsTopPick,
        topGradeLocal, topGradeProfit, minProfitGrade, minProfitLabel,
        isLoading: false,
        isStale: pick.ebay.isStale,
        ebayFetchedAt: pick.ebay.fetchedAt,
      };
    });

    // Sort by top-grade profit descending
    enriched.sort((a, b) => (b.topGradeProfit ?? -9999) - (a.topGradeProfit ?? -9999));
    return enriched.slice(0, 10);
  }, [precomputedPicks, picksConfig, effectivePicksCompany, currencyRate]);

  // Alias for template clarity
  const tieredPicks = enrichedTopPicks;

  // Loading state — just the single query
  const tierEbayLoading = picksLoading;

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

  const handleTapCard = useCallback((
    cardId: string,
    cardName: string,
    setName: string,
    imageUrl?: string | null,
    rawPriceUSD?: number,
    cardNumber?: string | null,
  ) => {
    router.push({
      pathname: "/card-profit",
      params: {
        cardId,
        cardName,
        setName,
        imageUrl: imageUrl || "",
        rawPriceUSD: rawPriceUSD ? String(rawPriceUSD) : "0",
        ...(cardNumber ? { cardNumber } : {}),
      },
    });
  }, []);

  const handleSetPress = useCallback((set: BrowseSet) => {
    router.push({
      pathname: "/set-cards",
      params: {
        lang: "english",
        setId: set.id,
        setName: set.name,
        setTotal: String(set.cardCount),
        ...(set.edition ? { edition: set.edition } : {}),
      },
    });
  }, []);

  const renderTopCard = useCallback((entry: typeof tieredPicks[0], index: number) => (
    <TopPickCard
      key={entry.pick.id}
      item={entry.pick}
      index={index}
      onPress={() => handleTapCard(entry.pick.id, entry.pick.name, entry.pick.setName, entry.pick.imageUrl, entry.pick.rawPriceUSD, entry.pick.number)}
      topGradeLocal={entry.topGradeLocal}
      topGradeProfit={entry.topGradeProfit}
      topGradeLabel={picksConfig.topGradeLabel}
      minProfitGrade={entry.minProfitGrade}
      minProfitLabel={entry.minProfitLabel}
      ebayLoading={entry.isLoading}
      currencySymbol={currencySymbol}
      currencyRate={currencyRate}
      isStale={entry.isStale}
    />
  ), [handleTapCard, tieredPicks, picksConfig, currencySymbol, currencyRate]);

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
              <CardResultRow card={card} onPress={() => handleTapCard(card.id, card.name, card.setName, card.imageUrl, undefined, card.number)} />
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
            <Text style={styles.topPicksSubtitle}>Live raw market prices from TCGPlayer</Text>
          </View>
        </View>

        {/* Price tier tabs — based on actual raw TCGPlayer market price in GBP */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tierTabsScroll}
        >
          {PRICE_TIERS.map(tier => (
            <Pressable
              key={tier.maxGBP}
              style={[styles.tierTab, priceTier === tier.maxGBP && styles.tierTabActive]}
              onPress={() => setPriceTier(tier.maxGBP)}
            >
              <Text style={[styles.tierTabText, priceTier === tier.maxGBP && styles.tierTabTextActive]}>
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

        {!picksLoading && !picksError && tieredPicks.length === 0 && (
          <View style={styles.inlineFeedback}>
            <Text style={styles.feedbackText}>
              {(() => {
                const now = new Date();
                const next = new Date();
                next.setUTCHours(9, 0, 0, 0);
                if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
                const localTime = next.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const minsUntil = (next.getTime() - now.getTime()) / 60000;
                const when = minsUntil < 60
                  ? `in ${Math.round(minsUntil)} min`
                  : minsUntil < 1440
                  ? `today at ${localTime}`
                  : `tomorrow at ${localTime}`;
                return `Picks refresh daily — next update ${when}`;
              })()}
            </Text>
          </View>
        )}

        {!picksLoading && !picksError && tieredPicks.length > 0 && (
          <View style={styles.rankingStatus}>
            <Ionicons name="trending-up-outline" size={11} color={Colors.textMuted} />
            <Text style={styles.rankingStatusText}>
              Ranked by estimated {picksConfig.topGradeLabel} profit
            </Text>
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
              Raw: TCGPlayer market price · eBay: last sold price (excl. Best Offer) · All prices in {currency}{ratesData?.updatedAt ? ` · Rates: ${ratesData.updatedAt}` : ""}
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

      {/* Set search bar */}
      {!setsLoading && sets.length > 0 && (
        <View style={styles.setSearchWrap}>
          <Ionicons name="search" size={15} color={Colors.textMuted} style={{ marginRight: 6 }} />
          <TextInput
            ref={setSearchRef}
            value={setSearch}
            onChangeText={setSetSearch}
            placeholder="Search sets or series…"
            placeholderTextColor={Colors.textMuted}
            style={styles.setSearchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {setSearch.length > 0 && (
            <Pressable onPress={() => { setSetSearch(""); setSearchRef.current?.focus(); }} hitSlop={10}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
      )}

      {/* No results message */}
      {!setsLoading && sets.length > 0 && filteredSets.length === 0 && (
        <View style={styles.inlineFeedback}>
          <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.feedbackText}>No sets match "{setSearch}"</Text>
        </View>
      )}

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
      data={filteredSets}
      keyExtractor={item => item.edition ? `${item.id}_${item.edition}` : item.id}
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
  // hasCardData is always true for English sets (server confirms via Pokemon TCG API card count)
  const hasCards = set.hasCardData !== false && set.cardCount > 0;
  // hasPrices: null = background check still in progress; true/false = determined
  const pricesKnown = set.hasPrices !== null && set.hasPrices !== undefined;

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
        {/* Edition badge — only for WOTC split entries */}
        {set.edition && (
          <View style={set.edition === "1st" ? styles.editionBadge1st : styles.editionBadgeUnlimited}>
            <Text style={set.edition === "1st" ? styles.editionBadge1stText : styles.editionBadgeUnlimitedText}>
              {set.edition === "1st" ? "1st Edition" : "Unlimited"}
            </Text>
          </View>
        )}
        <Text style={styles.setName} numberOfLines={2}>
          {/* Strip the edition suffix from the display name — it's shown as a badge */}
          {(set.nameEn || set.name).replace(/ · (1st Edition|Unlimited)$/, "")}
        </Text>
        {set.series ? <Text style={styles.setSeries} numberOfLines={1}>{set.series}</Text> : null}
        <View style={styles.setMeta}>
          <Text style={styles.setCardCount}>{set.cardCount} cards</Text>
        </View>
        <View style={[styles.setMeta, { marginTop: 4, gap: 6 }]}>
          {/* Card data badge — always shown for English sets */}
          {hasCards ? (
            <View style={styles.statusBadgeGreen}>
              <Ionicons name="checkmark-circle" size={10} color="#22c55e" />
              <Text style={styles.statusBadgeGreenText}>Card data</Text>
            </View>
          ) : (
            <View style={styles.statusBadgeAmber}>
              <Ionicons name="time-outline" size={10} color="#f59e0b" />
              <Text style={styles.statusBadgeAmberText}>No card data</Text>
            </View>
          )}
          {/* Price data badge — appears once background check completes */}
          {pricesKnown ? (
            set.hasPrices ? (
              <View style={styles.statusBadgeGreen}>
                <Ionicons name="pricetag-outline" size={10} color="#22c55e" />
                <Text style={styles.statusBadgeGreenText}>Card Prices</Text>
              </View>
            ) : (
              <View style={styles.statusBadgeAmber}>
                <Ionicons name="time-outline" size={10} color="#f59e0b" />
                <Text style={styles.statusBadgeAmberText}>No price data</Text>
              </View>
            )
          ) : (
            <View style={styles.statusBadgeAmber}>
              <Ionicons name="ellipsis-horizontal" size={10} color="#f59e0b" />
              <Text style={styles.statusBadgeAmberText}>Checking prices…</Text>
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

  rankingStatus: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 16, marginBottom: 6 },
  rankingStatusText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted },
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

  // Edition badges (1st Edition / Unlimited)
  editionBadge1st: {
    alignSelf: "flex-start",
    backgroundColor: "#7c3aed",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
  },
  editionBadge1stText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: "#fff",
    letterSpacing: 0.4,
  },
  editionBadgeUnlimited: {
    alignSelf: "flex-start",
    backgroundColor: Colors.surface,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  editionBadgeUnlimitedText: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textSecondary,
    letterSpacing: 0.4,
  },

  // Set search bar
  setSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  setSearchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    padding: 0,
  },

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
  statusBadgeGreen: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
    backgroundColor: "rgba(34,197,94,0.1)",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusBadgeGreenText: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#22c55e" },
  statusBadgeAmber: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusBadgeAmberText: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#f59e0b" },

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
