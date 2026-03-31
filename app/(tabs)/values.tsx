import React, { useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
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
  const inputRef = useRef<TextInput>(null);

  // Browse sets data (always loaded)
  const { data: setsData, isLoading: setsLoading, error: setsError, refetch: setsRefetch } = useQuery<{ sets: BrowseSet[] }>({
    queryKey: ["/api/sets/english"],
    staleTime: 60 * 60 * 1000,
    retry: 2,
    retryDelay: 1500,
  });
  const sets = useMemo(() => setsData?.sets || [], [setsData]);

  const loadRecent = useCallback(async () => {
    if (recentLoaded) return;
    const recent = await loadRecentSearches();
    setRecentSearches(recent);
    setRecentLoaded(true);
  }, [recentLoaded]);

  React.useEffect(() => {
    loadRecent();
  }, [loadRecent]);

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

      const updated = [trimmed, ...recentSearches.filter((s) => s !== trimmed)].slice(0, MAX_RECENT);
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
    const updated = recentSearches.filter((s) => s !== item);
    setRecentSearches(updated);
    await saveRecentSearches(updated);
  }, [recentSearches]);

  const handleTapCard = useCallback((card: SearchResult) => {
    router.push({
      pathname: "/card-profit",
      params: { cardId: card.id, cardName: card.name, setName: card.setName },
    });
  }, []);

  const handleSetPress = useCallback((set: BrowseSet) => {
    router.push({
      pathname: "/set-cards",
      params: { lang: "english", setId: set.id, setName: set.name },
    });
  }, []);

  const showRecent = !hasSearched && recentSearches.length > 0;

  const listHeader = (
    <View>
      {/* Screen title + search bar */}
      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 14 }]}>
        <Text style={styles.headerTitle}>Values</Text>
      </View>

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

      {/* Search loading */}
      {loading && (
        <View style={styles.searchFeedback}>
          <ActivityIndicator color={Colors.primary} size="small" />
          <Text style={styles.loadingText}>Searching…</Text>
        </View>
      )}

      {/* Search error */}
      {!loading && searchError && (
        <View style={styles.searchFeedback}>
          <Ionicons name="alert-circle-outline" size={18} color={Colors.error} />
          <Text style={styles.searchErrorText}>{searchError}</Text>
        </View>
      )}

      {/* No results */}
      {!loading && !searchError && hasSearched && results.length === 0 && (
        <View style={styles.searchFeedback}>
          <Text style={styles.noResultsText}>No cards found for "{query}"</Text>
        </View>
      )}

      {/* Search results */}
      {!loading && results.length > 0 && (
        <View style={styles.resultsSection}>
          <Text style={styles.sectionLabel}>Search Results</Text>
          {results.map((card) => (
            <View key={card.id}>
              <CardResultRow card={card} onPress={() => handleTapCard(card)} />
              <View style={styles.separator} />
            </View>
          ))}
        </View>
      )}

      {/* Recent searches (only when not searched) */}
      {!hasSearched && showRecent && (
        <View style={styles.recentSection}>
          <Text style={styles.sectionLabel}>Recent Searches</Text>
          {recentSearches.map((item) => (
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

      {/* Browse section header */}
      <View style={styles.browseSectionHeader}>
        <Text style={styles.sectionTitle}>Browse Sets</Text>
        <View style={styles.langPill}>
          <Text style={styles.langPillText}>🇬🇧 English only · more coming soon</Text>
        </View>
      </View>

      {/* Browse loading / error */}
      {setsLoading && (
        <View style={styles.searchFeedback}>
          <ActivityIndicator color={Colors.primary} size="small" />
          <Text style={styles.loadingText}>Loading sets…</Text>
        </View>
      )}
      {!setsLoading && !!setsError && (
        <View style={styles.searchFeedback}>
          <Ionicons name="alert-circle-outline" size={18} color={Colors.error} />
          <Text style={styles.searchErrorText}>Couldn't load sets</Text>
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
      keyExtractor={(item) => item.id}
      ListHeaderComponent={listHeader}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      contentContainerStyle={{ paddingBottom: insets.bottom + webBottomInset + 100 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => (
        <SetRow set={item} onPress={() => handleSetPress(item)} />
      )}
    />
  );
}

// ─── Set Row ──────────────────────────────────────────────────────────────────

function SetRow({ set, onPress }: { set: BrowseSet; onPress: () => void }) {
  const displayName = set.nameEn || set.name;
  const hasPrices = set.hasPrices !== false; // default true for english sets
  return (
    <Pressable
      style={({ pressed }) => [styles.setRow, { opacity: pressed ? 0.8 : 1 }]}
      onPress={onPress}
    >
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
        <Text style={styles.setName} numberOfLines={2}>{displayName}</Text>
        {set.series ? (
          <Text style={styles.setSeries} numberOfLines={1}>{set.series}</Text>
        ) : null}
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
    <Pressable
      style={({ pressed }) => [styles.cardRow, { opacity: pressed ? 0.8 : 1 }]}
      onPress={onPress}
    >
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
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    color: Colors.text,
  },
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
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.text,
    paddingVertical: 0,
  },
  searchBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
  searchFeedback: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  loadingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  searchErrorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.error,
    flex: 1,
  },
  noResultsText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.primary,
  },
  resultsSection: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  recentSection: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  recentTerm: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recentText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.text,
  },
  browseSectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  langPill: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  langPillText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  setLogoContainer: {
    width: 72,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  setLogo: {
    width: 72,
    height: 40,
  },
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
  setInfo: {
    flex: 1,
    gap: 2,
  },
  setName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
    lineHeight: 20,
  },
  setSeries: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  setMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  setCardCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  pricesBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(34,197,94,0.1)",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pricesBadgeText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#22c55e",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  cardImageContainer: {
    width: 52,
    height: 72,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: Colors.surface,
  },
  cardImage: {
    width: 52,
    height: 72,
  },
  cardImagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  cardName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
    lineHeight: 20,
  },
  cardSet: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  cardNumber: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
  },
});
