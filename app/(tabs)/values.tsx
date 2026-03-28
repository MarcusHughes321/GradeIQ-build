import React, { useState, useCallback, useRef } from "react";
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
  series?: string;
  cardCount: number;
  releaseDate?: string;
  logo: string | null;
  symbol?: string | null;
}

type BrowseLang = "english" | "japanese" | "korean";

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

  const [mode, setMode] = useState<"search" | "browse">("search");
  const [browseLang, setBrowseLang] = useState<BrowseLang>("english");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentLoaded, setRecentLoaded] = useState(false);
  const inputRef = useRef<TextInput>(null);

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
    setError(null);
    setHasSearched(true);
    setResults([]);

    try {
      const resp = await apiRequest("GET", `/api/cards/search?q=${encodeURIComponent(trimmed)}`);
      const data = await resp.json();
      setResults(data.results || []);

      const updated = [trimmed, ...recentSearches.filter((s) => s !== trimmed)].slice(0, MAX_RECENT);
      setRecentSearches(updated);
      await saveRecentSearches(updated);
    } catch (e: any) {
      setError("Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [recentSearches]);

  const handleClear = useCallback(() => {
    setQuery("");
    setResults([]);
    setHasSearched(false);
    setError(null);
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

  const showRecent = !hasSearched && recentSearches.length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Values</Text>

        {/* Search / Browse toggle */}
        <View style={styles.modeToggle}>
          <Pressable
            style={[styles.modeBtn, mode === "search" && styles.modeBtnActive]}
            onPress={() => setMode("search")}
          >
            <Text style={[styles.modeBtnText, mode === "search" && styles.modeBtnTextActive]}>
              Search
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, mode === "browse" && styles.modeBtnActive]}
            onPress={() => setMode("browse")}
          >
            <Text style={[styles.modeBtnText, mode === "browse" && styles.modeBtnTextActive]}>
              Browse
            </Text>
          </Pressable>
        </View>
      </View>

      {mode === "search" && (
        <>
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

          {loading && (
            <View style={styles.centered}>
              <ActivityIndicator color={Colors.primary} size="large" />
              <Text style={styles.loadingText}>Searching cards…</Text>
            </View>
          )}

          {!loading && error && (
            <View style={styles.centered}>
              <Ionicons name="alert-circle-outline" size={36} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {!loading && !error && hasSearched && results.length === 0 && (
            <View style={styles.centered}>
              <Ionicons name="search-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No cards found</Text>
              <Text style={styles.emptySubtitle}>Try a different search term</Text>
            </View>
          )}

          {!loading && !error && showRecent && (
            <View style={styles.recentSection}>
              <Text style={styles.recentTitle}>Recent Searches</Text>
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

          {!loading && !error && !showRecent && !hasSearched && (
            <View style={styles.centered}>
              <Ionicons name="bar-chart-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>Explore Card Values</Text>
              <Text style={styles.emptySubtitle}>Search for a Pokémon card to see how much you could make from grading it</Text>
            </View>
          )}

          {!loading && results.length > 0 && (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + webBottomInset + 100 }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => (
                <CardResultRow card={item} onPress={() => handleTapCard(item)} />
              )}
            />
          )}
        </>
      )}

      {mode === "browse" && (
        <BrowseMode
          lang={browseLang}
          onChangeLang={setBrowseLang}
          bottomInset={insets.bottom + webBottomInset}
        />
      )}
    </View>
  );
}

// ─── Browse Mode ─────────────────────────────────────────────────────────────

const LANG_TABS: { id: BrowseLang; label: string }[] = [
  { id: "english", label: "English" },
  { id: "japanese", label: "Japanese" },
  { id: "korean", label: "Korean" },
];

function BrowseMode({
  lang,
  onChangeLang,
  bottomInset,
}: {
  lang: BrowseLang;
  onChangeLang: (l: BrowseLang) => void;
  bottomInset: number;
}) {
  const { data, isLoading, error, refetch } = useQuery<{ sets: BrowseSet[] }>({
    queryKey: ["/api/sets", lang],
    staleTime: 60 * 60 * 1000,
    retry: 2,
    retryDelay: 1500,
  });

  const sets = data?.sets || [];

  const handleSetPress = (set: BrowseSet) => {
    router.push({
      pathname: "/set-cards",
      params: { lang, setId: set.id, setName: set.name },
    });
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Language tabs */}
      <View style={styles.langTabRow}>
        {LANG_TABS.map((tab) => (
          <Pressable
            key={tab.id}
            style={[styles.langTab, lang === tab.id && styles.langTabActive]}
            onPress={() => onChangeLang(tab.id)}
          >
            <Text style={[styles.langTabText, lang === tab.id && styles.langTabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
        <View style={styles.langTabLocked}>
          <Text style={styles.langTabLockedText}>Chinese</Text>
          <Text style={styles.langTabLockedBadge}>Soon</Text>
        </View>
      </View>

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading sets…</Text>
        </View>
      )}

      {!isLoading && error && (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={36} color={Colors.error} />
          <Text style={styles.errorText}>Failed to load sets</Text>
          <Text style={[styles.errorText, { fontSize: 11, opacity: 0.6, marginTop: 4 }]} numberOfLines={3}>
            {(error as Error)?.message || String(error)}
          </Text>
          <Pressable onPress={() => refetch()} style={{ marginTop: 8 }}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {!isLoading && !error && sets.length === 0 && (
        <View style={styles.centered}>
          <Ionicons name="albums-outline" size={36} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No sets found</Text>
        </View>
      )}

      {!isLoading && sets.length > 0 && (
        <FlatList
          data={sets}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: bottomInset + 100,
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <SetRow set={item} onPress={() => handleSetPress(item)} />
          )}
        />
      )}
    </View>
  );
}

function SetRow({ set, onPress }: { set: BrowseSet; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.setRow, { opacity: pressed ? 0.8 : 1 }]}
      onPress={onPress}
    >
      <View style={styles.setLogoContainer}>
        {set.logo ? (
          <Image
            source={{ uri: set.logo }}
            style={styles.setLogo}
            contentFit="contain"
          />
        ) : (
          <View style={styles.setLogoPlaceholder}>
            <Ionicons name="albums-outline" size={20} color={Colors.textMuted} />
          </View>
        )}
      </View>
      <View style={styles.setInfo}>
        <Text style={styles.setName} numberOfLines={2}>{set.name}</Text>
        {set.series ? (
          <Text style={styles.setSeries} numberOfLines={1}>{set.series}</Text>
        ) : null}
        <Text style={styles.setCardCount}>{set.cardCount} cards</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

// ─── Search Mode Components ───────────────────────────────────────────────────

function CardResultRow({ card, onPress }: { card: SearchResult; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.cardRow, { opacity: pressed ? 0.8 : 1 }]}
      onPress={onPress}
    >
      <View style={styles.cardImageContainer}>
        {card.imageUrl ? (
          <Image
            source={{ uri: card.imageUrl }}
            style={styles.cardImage}
            contentFit="contain"
          />
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
    paddingTop: 14,
    paddingBottom: 10,
    gap: 12,
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    color: Colors.text,
  },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignSelf: "flex-start",
  },
  modeBtn: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 8,
  },
  modeBtnActive: {
    backgroundColor: Colors.primary,
  },
  modeBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.textMuted,
  },
  modeBtnTextActive: {
    color: "#fff",
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
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  loadingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.error,
    textAlign: "center",
    marginTop: 8,
  },
  retryText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: Colors.primary,
  },
  emptyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: Colors.text,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  recentSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  recentTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
  langTabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    flexWrap: "wrap",
  },
  langTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  langTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  langTabText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  langTabTextActive: {
    color: "#fff",
  },
  langTabLocked: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    opacity: 0.5,
  },
  langTabLockedText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textMuted,
  },
  langTabLockedBadge: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    color: Colors.textMuted,
    backgroundColor: Colors.surfaceBorder,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: "hidden",
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
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
  setCardCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
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
