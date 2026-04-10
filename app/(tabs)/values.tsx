import React, { useState, useCallback, useRef, useMemo, memo, useEffect } from "react";
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
  RefreshControl,
  Animated,
} from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
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
import { useSubscription } from "@/lib/subscription";
import ValuesUpgradeSheet from "@/components/ValuesUpgradeSheet";
import { BlurredValue } from "@/components/BlurredValue";

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
const EXPLAINER_DISMISSED_KEY = "gradeiq_values_explainer_v1";
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
  setTotal?: string;
  imageUrl: string | null;
  rawPriceUSD: number;
  rawPriceEUR?: number | null;
  lang?: string;
}

// Server-side pre-computed pick returned by /api/top-picks-precomputed
interface PrecomputedPick {
  cardId: string;
  cardName: string;
  setName: string;
  setId: string;
  number: string;
  setTotal?: string;
  imageUrl: string | null;
  rawPriceUSD: number;
  rawPriceEUR?: number | null;
  lang?: string;
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
const TopPickCard = memo(({ item, index, onPress, topGradeLocal, topGradeProfit, topGradeLabel, minProfitGrade, minProfitLabel, ebayLoading, currencySymbol, currencyRate, isStale, profitDisplay, isSubscribed }: {
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
  profitDisplay?: "value" | "percentage" | "both";
  isSubscribed: boolean;
}) => {
  const rawLocal = Math.round(item.rawPriceUSD * currencyRate);
  const sym = currencySymbol;
  const fmtProfit = (abs: number): string => {
    const val = `${sym}${abs}`;
    const pct = rawLocal > 0 ? `${Math.round((abs / rawLocal) * 100)}%` : null;
    if (profitDisplay === "percentage" && pct) return pct;
    if (profitDisplay === "both" && pct) return `${val} (${pct})`;
    return val;
  };

  return (
    <Pressable
      style={({ pressed }) => [cardStyles.card, { opacity: pressed ? 0.8 : 1 }]}
      onPress={onPress}
    >
      <View style={cardStyles.rank}>
        <Text style={cardStyles.rankText}>#{index + 1}</Text>
      </View>

      {/* Card image — blurred for free users */}
      <View style={{ position: "relative" }}>
        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={cardStyles.img}
            contentFit="contain"
            blurRadius={isSubscribed ? 0 : 18}
          />
        ) : (
          <View style={[cardStyles.img, cardStyles.imgPlaceholder]}>
            <Ionicons name="image-outline" size={20} color={Colors.textMuted} />
          </View>
        )}
        {!isSubscribed && (
          <View style={cardStyles.imgLockOverlay}>
            <Ionicons name="lock-closed" size={18} color="#fff" />
          </View>
        )}
      </View>

      <View style={{ position: "relative" }}>
        <Text style={cardStyles.name} numberOfLines={2}>{item.name}</Text>
        <Text style={cardStyles.set} numberOfLines={1}>{item.setName}</Text>
        {!isSubscribed && (
          <BlurView intensity={28} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: 4 }]} />
        )}
      </View>
      <View style={cardStyles.divider} />

      {/* Raw TCGPlayer price — blurred for free users */}
      <View style={cardStyles.row}>
        <Text style={cardStyles.label}>Raw</Text>
        <BlurredValue blurred={!isSubscribed}>
          <Text style={cardStyles.value}>{sym}{rawLocal}</Text>
        </BlurredValue>
      </View>

      {/* Top grade eBay last sold — blurred for free users */}
      <View style={cardStyles.row}>
        <Text style={cardStyles.label}>{topGradeLabel}</Text>
        {ebayLoading ? (
          <ActivityIndicator size="small" color={Colors.textMuted} style={{ transform: [{ scale: 0.65 }] }} />
        ) : topGradeLocal !== null ? (
          <BlurredValue blurred={!isSubscribed}>
            <Text style={[cardStyles.graded, { color: Colors.text }]}>{sym}{topGradeLocal}</Text>
          </BlurredValue>
        ) : (
          <Text style={cardStyles.muted}>—</Text>
        )}
      </View>

      {/* Top grade net profit — blurred for free users */}
      <View style={cardStyles.row}>
        <Text style={cardStyles.label}>Profit</Text>
        {ebayLoading ? (
          <ActivityIndicator size="small" color={Colors.textMuted} style={{ transform: [{ scale: 0.65 }] }} />
        ) : topGradeProfit !== null ? (
          <BlurredValue blurred={!isSubscribed}>
            <Text style={[cardStyles.graded, { color: topGradeProfit >= 0 ? "#22c55e" : "#ef4444" }]}>
              {topGradeProfit >= 0 ? "+" : "-"}{fmtProfit(Math.abs(topGradeProfit))}
            </Text>
          </BlurredValue>
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
  imgLockOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 8, borderRadius: 6, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
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
  const [selectedLang, setSelectedLang] = useState<"en" | "ja">("en");
  const [explainerDismissed, setExplainerDismissed] = useState(true); // default true = hidden until loaded
  const [showUpgradeSheet, setShowUpgradeSheet] = useState(false);
  const { isSubscribed, isAdminMode } = useSubscription();
  const hasAccess = isSubscribed || isAdminMode;
  const inputRef = useRef<TextInput>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll hint animation for tier tabs chevron
  const scrollHintX = useRef(new Animated.Value(0)).current;
  const scrollHintOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    // 3 quick bounces on mount, then a slow continuous pulse
    const bounce = Animated.sequence([
      Animated.timing(scrollHintX, { toValue: 5, duration: 160, useNativeDriver: true }),
      Animated.timing(scrollHintX, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(scrollHintX, { toValue: 5, duration: 160, useNativeDriver: true }),
      Animated.timing(scrollHintX, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(scrollHintX, { toValue: 5, duration: 160, useNativeDriver: true }),
      Animated.timing(scrollHintX, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]);
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scrollHintOpacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(scrollHintOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    bounce.start(() => pulse.start());
    return () => { bounce.stop(); pulse.stop(); };
  }, []);

  // Browse sets — English (with live price status polling) or Japanese
  const { data: enSetsData, isLoading: enSetsLoading, error: enSetsError, refetch: enSetsRefetch } = useQuery<{ sets: BrowseSet[] }>({
    queryKey: ["/api/sets/english"],
    staleTime: 60 * 60 * 1000,
    retry: 2,
    retryDelay: 1500,
    enabled: selectedLang === "en",
    refetchInterval: (query) => {
      const sets = (query.state.data as any)?.sets as BrowseSet[] | undefined;
      if (!sets) return false;
      return sets.some(s => s.hasPrices === null) ? 6000 : false;
    },
  });
  const { data: jaSetsData, isLoading: jaSetsLoading, isRefetching: jaSetsRefetching, error: jaSetsError, refetch: jaSetsRefetch } = useQuery<{ sets: BrowseSet[] }>({
    queryKey: ["/api/sets/japanese"],
    staleTime: 60 * 60 * 1000,
    retry: 2,
    retryDelay: 1500,
    enabled: selectedLang === "ja",
  });

  const setsData        = selectedLang === "ja" ? jaSetsData        : enSetsData;
  const setsLoading     = selectedLang === "ja" ? jaSetsLoading     : enSetsLoading;
  const setsRefetching  = selectedLang === "ja" ? jaSetsRefetching  : false;
  const setsError       = selectedLang === "ja" ? jaSetsError       : enSetsError;
  const setsRefetch     = selectedLang === "ja" ? jaSetsRefetch     : enSetsRefetch;
  const sets = useMemo(() => setsData?.sets || [], [setsData]);

  const [setSearch, setSetSearch] = useState("");
  const setSearchRef = useRef<TextInput>(null);

  // Expand WOTC sets into two entries (1st Edition + Unlimited) — English only
  const expandedSets = useMemo<BrowseSet[]>(() => {
    if (selectedLang === "ja") {
      // Deduplicate by ID — TCGdex sometimes returns the same set ID in multiple series
      const seen = new Set<string>();
      return sets.filter(s => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
    }
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
  }, [sets, selectedLang]);

  const filteredSets = useMemo(() => {
    const q = setSearch.trim().toLowerCase();
    if (!q) return expandedSets;
    return expandedSets.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.nameEn && s.nameEn.toLowerCase().includes(q)) ||
      (s.series && s.series.toLowerCase().includes(q))
    );
  }, [expandedSets, setSearch]);

  // Preferred picks company — fall back to first enabled if the saved preference isn't enabled
  const effectivePicksCompany: CompanyId = useMemo(() => {
    const preferred = settings.preferredPicksCompany;
    if (settings.enabledCompanies.includes(preferred)) return preferred;
    return (settings.enabledCompanies[0] as CompanyId) ?? "PSA";
  }, [settings.preferredPicksCompany, settings.enabledCompanies]);

  // Pre-computed top grading picks — single fast DB read per tier, no live eBay calls
  // Query key includes effectivePicksCompany so results refresh when company changes
  const { data: precomputedData, isLoading: picksLoading, error: picksError, refetch: refetchPicks } = useQuery<{
    picks: PrecomputedPick[];
    hasData: boolean;
    lastJobRun: string | null;
  }>({
    queryKey: ["top-picks-precomputed", priceTier, selectedLang, effectivePicksCompany],
    queryFn: async () => {
      const langQ = selectedLang === "ja" ? "&lang=ja" : "";
      const companyQ = `&company=${encodeURIComponent(effectivePicksCompany)}`;
      const resp = await apiRequest("GET", `/api/top-picks-precomputed?tierMaxGbp=${priceTier}${langQ}${companyQ}`);
      return resp.json();
    },
    staleTime: 30 * 60 * 1000,
    retry: 1,
    retryDelay: 2000,
  });
  const precomputedPicks: PrecomputedPick[] = precomputedData?.picks ?? [];

  const picksConfig = PICKS_COMPANY_CONFIG[effectivePicksCompany];

  // Enrich each pre-computed pick with the preferred company's profit.
  // All monetary values are in the user's selected currency.
  // For JP picks, rawPriceEUR is converted via EUR exchange rate instead of USD rate.
  const eurRate = ratesData?.rates?.["EUR"] ?? FALLBACK_RATES["EUR"] ?? 0.92;
  const enrichedTopPicks = useMemo(() => {
    const cfg = picksConfig;

    const enriched = precomputedPicks.map(pick => {
      const ebay = pick.ebay as any as EbayAllGrades;
      // For JP picks: convert EUR price → user currency; for EN picks: USD → user currency
      const isJp = pick.lang === "ja" || selectedLang === "ja";
      const rawLocal = isJp && pick.rawPriceEUR
        ? pick.rawPriceEUR * (currencyRate / eurRate)
        : pick.rawPriceUSD * currencyRate;
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
        setId: pick.setId, number: pick.number, setTotal: pick.setTotal,
        imageUrl: pick.imageUrl, rawPriceUSD: pick.rawPriceUSD,
        rawPriceEUR: pick.rawPriceEUR, lang: pick.lang,
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
  }, [precomputedPicks, picksConfig, effectivePicksCompany, currencyRate, eurRate, selectedLang]);

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

  // Load explainer dismissed state
  React.useEffect(() => {
    AsyncStorage.getItem(EXPLAINER_DISMISSED_KEY).then(val => {
      setExplainerDismissed(val === "1");
    });
  }, []);

  const dismissExplainer = useCallback(() => {
    setExplainerDismissed(true);
    AsyncStorage.setItem(EXPLAINER_DISMISSED_KEY, "1");
  }, []);

  const doSearch = useCallback(async (q: string, dismissKb = true) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    if (dismissKb) Keyboard.dismiss();
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

  // Live search — fires 400ms after the user stops typing
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    if (trimmed.length < 2) return;
    searchDebounceRef.current = setTimeout(() => {
      doSearch(query, false);
    }, 400);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [query]);

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

  const handleClearAllRecent = useCallback(async () => {
    setRecentSearches([]);
    await saveRecentSearches([]);
  }, []);

  const handleTapCard = useCallback((
    cardId: string,
    cardName: string,
    setName: string,
    imageUrl?: string | null,
    rawPriceUSD?: number,
    cardNumber?: string | null,
    setTotal?: string | null,
    rawPriceEUR?: number | null,
    lang?: string | null,
  ) => {
    router.push({
      pathname: "/card-profit",
      params: {
        cardId,
        cardName,
        setName,
        imageUrl: imageUrl || "",
        rawPriceUSD: rawPriceUSD ? String(rawPriceUSD) : "0",
        company: effectivePicksCompany,
        ...(cardNumber ? { cardNumber } : {}),
        ...(setTotal ? { setTotal } : {}),
        ...(rawPriceEUR ? { rawPriceEUR: String(rawPriceEUR) } : {}),
        ...(lang ? { lang } : {}),
      },
    });
  }, [effectivePicksCompany]);

  const handleSetPress = useCallback((set: BrowseSet) => {
    router.push({
      pathname: "/set-cards",
      params: {
        lang: selectedLang === "ja" ? "japanese" : "english",
        setId: set.id,
        setName: (set.nameEn || set.name).replace(/ · (1st Edition|Unlimited)$/, ""),
        setTotal: String(set.cardCount),
        ...(set.edition ? { edition: set.edition } : {}),
      },
    });
  }, [selectedLang]);

  const renderTopCard = useCallback((entry: typeof tieredPicks[0], index: number) => (
    <TopPickCard
      key={entry.pick.id}
      item={entry.pick}
      index={index}
      onPress={() => handleTapCard(entry.pick.id, entry.pick.name, entry.pick.setName, entry.pick.imageUrl, entry.pick.rawPriceUSD, entry.pick.number, entry.pick.setTotal, entry.pick.rawPriceEUR, entry.pick.lang)}
      topGradeLocal={entry.topGradeLocal}
      topGradeProfit={entry.topGradeProfit}
      topGradeLabel={picksConfig.topGradeLabel}
      minProfitGrade={entry.minProfitGrade}
      minProfitLabel={entry.minProfitLabel}
      ebayLoading={entry.isLoading}
      currencySymbol={currencySymbol}
      currencyRate={currencyRate}
      isStale={entry.isStale}
      profitDisplay={settings.profitDisplay ?? "value"}
      isSubscribed={hasAccess}
    />
  ), [handleTapCard, tieredPicks, picksConfig, currencySymbol, currencyRate, settings.profitDisplay, hasAccess]);

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

      {/* ── Explainer card (first-time only) ─────────────────────── */}
      {!explainerDismissed && (
        <View style={styles.explainerCard}>
          <View style={styles.explainerHeader}>
            <View style={styles.explainerTitleRow}>
              <Ionicons name="sparkles" size={15} color={Colors.primary} />
              <Text style={styles.explainerTitle}>How Values works</Text>
            </View>
            <Pressable onPress={dismissExplainer} hitSlop={12}>
              <Ionicons name="close" size={18} color={Colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.explainerRows}>
            <View style={styles.explainerRow}>
              <View style={styles.explainerIconWrap}>
                <Ionicons name="search-outline" size={16} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.explainerRowTitle}>Search any card</Text>
                <Text style={styles.explainerRowBody}>Find real eBay last-sold prices for graded copies — PSA, BGS, ACE, TAG & CGC.</Text>
              </View>
            </View>

            <View style={styles.explainerRow}>
              <View style={styles.explainerIconWrap}>
                <Ionicons name="albums-outline" size={16} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.explainerRowTitle}>Browse sets</Text>
                <Text style={styles.explainerRowBody}>Scroll through every English set to compare cards and spot hidden value.</Text>
              </View>
            </View>

            <View style={styles.explainerRow}>
              <View style={styles.explainerIconWrap}>
                <Ionicons name="trending-up-outline" size={16} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.explainerRowTitle}>Profit Analysis</Text>
                <Text style={styles.explainerRowBody}>Tap any card to see exactly how much profit each grade would make after fees, plus a Liquidity score so you know how quickly it sells.</Text>
              </View>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.explainerBtn, { opacity: pressed ? 0.8 : 1 }]}
            onPress={dismissExplainer}
          >
            <Text style={styles.explainerBtnText}>Got it</Text>
          </Pressable>
        </View>
      )}

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
          <View style={styles.recentHeader}>
            <Text style={styles.sectionLabel}>Recent Searches</Text>
            <Pressable onPress={handleClearAllRecent} hitSlop={12}>
              <Text style={styles.clearAllText}>Clear all</Text>
            </Pressable>
          </View>
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.topPicksTitle}>Top Grading Picks</Text>
              {!hasAccess && (
                <View style={styles.proBadge}>
                  <Ionicons name="lock-closed" size={9} color="#fff" />
                  <Text style={styles.proBadgeText}>PRO</Text>
                </View>
              )}
            </View>
            <Text style={styles.topPicksSubtitle}>
              {selectedLang === "ja" ? "Cardmarket EUR raw prices · eBay graded" : "Live raw market prices from TCGPlayer"}
            </Text>
          </View>
        </View>

        {/* Price tier tabs — based on actual raw TCGPlayer market price in GBP */}
        <View style={styles.tierTabsWrapper}>
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
          {/* Fade gradient + bouncing chevron — signals more tabs exist to swipe */}
          <LinearGradient
            colors={["transparent", Colors.surface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            pointerEvents="none"
            style={styles.tierTabsFade}
          >
            <Animated.View
              style={[
                styles.tierTabsChevron,
                { transform: [{ translateX: scrollHintX }], opacity: scrollHintOpacity },
              ]}
            >
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </Animated.View>
          </LinearGradient>
        </View>

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
              {selectedLang === "ja"
                ? `Raw: Cardmarket EUR · eBay: last sold price (excl. Best Offer) · All prices in ${currency}${ratesData?.updatedAt ? ` · Rates: ${ratesData.updatedAt}` : ""}`
                : `Raw: TCGPlayer market price · eBay: last sold price (excl. Best Offer) · All prices in ${currency}${ratesData?.updatedAt ? ` · Rates: ${ratesData.updatedAt}` : ""}`}
            </Text>
          </View>
        )}
      </View>

      {/* ── Browse Sets header + language toggle ── */}
      <View style={styles.browseSectionHeader}>
        <Text style={styles.browseSectionTitle}>Browse Sets</Text>
        <View style={styles.langToggleRow}>
          <Pressable
            style={[styles.langToggleBtn, selectedLang === "en" && styles.langToggleBtnActive]}
            onPress={() => { setSelectedLang("en"); setSetSearch(""); }}
          >
            <Text style={[styles.langToggleBtnText, selectedLang === "en" && styles.langToggleBtnTextActive]}>🇬🇧 EN</Text>
          </Pressable>
          <Pressable
            style={[styles.langToggleBtn, selectedLang === "ja" && styles.langToggleBtnActive]}
            onPress={() => { setSelectedLang("ja"); setSetSearch(""); }}
          >
            <Text style={[styles.langToggleBtnText, selectedLang === "ja" && styles.langToggleBtnTextActive]}>🇯🇵 JP</Text>
          </Pressable>
          <Pressable
            onPress={() => { setsRefetch(); refetchPicks(); }}
            hitSlop={10}
            style={{ marginLeft: 6, padding: 4 }}
          >
            {setsRefetching
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name="refresh-outline" size={18} color={Colors.textMuted} />
            }
          </Pressable>
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
    <>
    <ValuesUpgradeSheet visible={showUpgradeSheet} onClose={() => setShowUpgradeSheet(false)} />
    <FlatList
      style={styles.container}
      data={filteredSets}
      keyExtractor={item => item.edition ? `${selectedLang}_${item.id}_${item.edition}` : `${selectedLang}_${item.id}`}
      ListHeaderComponent={listHeader}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      contentContainerStyle={{ paddingBottom: insets.bottom + webBottomInset + 100 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={setsRefetching}
          onRefresh={() => { setsRefetch(); refetchPicks(); }}
          tintColor="#FF3C31"
        />
      }
      renderItem={({ item }) => <SetRow set={item} onPress={() => handleSetPress(item)} isJapanese={selectedLang === "ja"} />}
    />
    </>
  );
}

// ─── JP Set Code Badge Helpers ────────────────────────────────────────────────

function formatSetCode(id: string): string {
  return id.replace(/^([a-zA-Z]+)(\d.*)$/, (_, prefix, rest) => prefix.toUpperCase() + rest);
}

function getSetEraColor(id: string): string {
  const lower = id.toLowerCase();
  if (lower.startsWith("sv")) return "#7c3aed";
  if (lower.startsWith("sm")) return "#d97706";
  if (lower.startsWith("s"))  return "#2563eb";
  if (lower.startsWith("xy")) return "#0369a1";
  if (lower.startsWith("bw")) return "#7c3aed";
  if (lower.startsWith("m"))  return "#dc2626";
  if (lower.startsWith("dp")) return "#059669";
  return "#6b7280";
}

// ─── Set Row ──────────────────────────────────────────────────────────────────

function SetRow({ set, onPress, isJapanese }: { set: BrowseSet; onPress: () => void; isJapanese?: boolean }) {
  // JP/Korean: only show badge when confirmed via actual fetch (hasCardData === true).
  // null = never opened, false = opened and confirmed empty.
  // EN: optimistic — badge shows unless explicitly confirmed empty.
  const hasCards = isJapanese
    ? set.hasCardData === true
    : (set.hasCardData !== false && set.cardCount > 0);
  const pricesKnown = set.hasPrices !== null && set.hasPrices !== undefined;

  // For JP sets: when price status is unknown (null/undefined), assume Cardmarket prices are
  // available (they're fetched on demand). Once a set has been opened, the real status is cached.
  const renderPriceBadge = () => {
    if (pricesKnown) {
      return set.hasPrices ? (
        <View style={styles.statusBadgeGreen}>
          <Ionicons name="pricetag-outline" size={10} color="#22c55e" />
          <Text style={styles.statusBadgeGreenText}>{isJapanese ? "EUR Prices" : "Card Prices"}</Text>
        </View>
      ) : (
        <View style={styles.statusBadgeAmber}>
          <Ionicons name="time-outline" size={10} color="#f59e0b" />
          <Text style={styles.statusBadgeAmberText}>No price data</Text>
        </View>
      );
    }
    // Unknown status
    if (isJapanese) {
      // JP prices are loaded on demand — show a neutral "Cardmarket" badge rather than "Checking..."
      return hasCards ? (
        <View style={styles.statusBadgeBlue}>
          <Ionicons name="globe-outline" size={10} color="#60a5fa" />
          <Text style={styles.statusBadgeBlueText}>Cardmarket</Text>
        </View>
      ) : null;
    }
    // EN: genuinely checking in background
    return (
      <View style={styles.statusBadgeAmber}>
        <Ionicons name="ellipsis-horizontal" size={10} color="#f59e0b" />
        <Text style={styles.statusBadgeAmberText}>Checking prices…</Text>
      </View>
    );
  };

  return (
    <Pressable style={({ pressed }) => [styles.setRow, { opacity: pressed ? 0.8 : 1 }]} onPress={onPress}>
      <View style={styles.setLogoContainer}>
        {set.logo ? (
          <Image source={{ uri: set.logo }} style={styles.setLogo} contentFit="contain" />
        ) : isJapanese ? (
          <View style={[styles.setLogoPlaceholder, { backgroundColor: getSetEraColor(set.id), borderColor: "transparent" }]}>
            <Text style={styles.setCodeBadgeText}>{formatSetCode(set.id)}</Text>
          </View>
        ) : (
          <View style={styles.setLogoPlaceholder}>
            <Ionicons name="albums-outline" size={20} color={Colors.textMuted} />
          </View>
        )}
      </View>
      <View style={styles.setInfo}>
        {set.edition && (
          <View style={set.edition === "1st" ? styles.editionBadge1st : styles.editionBadgeUnlimited}>
            <Text style={set.edition === "1st" ? styles.editionBadge1stText : styles.editionBadgeUnlimitedText}>
              {set.edition === "1st" ? "1st Edition" : "Unlimited"}
            </Text>
          </View>
        )}
        <Text style={styles.setName} numberOfLines={2}>
          {(set.nameEn || set.name).replace(/ · (1st Edition|Unlimited)$/, "")}
        </Text>
        {set.series ? <Text style={styles.setSeries} numberOfLines={1}>{set.series}</Text> : null}
        <View style={styles.setMeta}>
          <Text style={styles.setCardCount}>{set.cardCount} cards</Text>
        </View>
        <View style={[styles.setMeta, { marginTop: 4, gap: 6 }]}>
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
          {renderPriceBadge()}
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
  // Explainer card
  explainerCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FF3C3130",
    overflow: "hidden",
  },
  explainerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  explainerTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  explainerTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  explainerRows: { paddingHorizontal: 16, paddingTop: 12, gap: 14 },
  explainerRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  explainerIconWrap: {
    width: 30, height: 30,
    borderRadius: 8,
    backgroundColor: "#FF3C3115",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  explainerRowTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 2 },
  explainerRowBody: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  explainerBtn: {
    margin: 16,
    marginTop: 14,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  explainerBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },

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
  recentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  clearAllText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.primary,
  },
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
  proBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: Colors.primary, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  proBadgeText: { fontFamily: "Inter_700Bold", fontSize: 9, color: "#fff", letterSpacing: 0.5 },
  tierTabsWrapper: {
    position: "relative",
  },
  tierTabsFade: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 56,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: 6,
  },
  tierTabsChevron: {
    paddingBottom: 12,
  },
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  browseSectionTitle: { fontFamily: "Inter_700Bold", fontSize: 17, color: Colors.text },
  langToggleRow: {
    flexDirection: "row",
    gap: 6,
  },
  langToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  langToggleBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  langToggleBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  langToggleBtnTextActive: {
    color: "#fff",
  },

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
  setCodeBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: "#fff",
    letterSpacing: -0.3,
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
  statusBadgeBlue: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
    backgroundColor: "rgba(96,165,250,0.1)",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusBadgeBlueText: { fontFamily: "Inter_400Regular", fontSize: 10, color: "#60a5fa" },

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
