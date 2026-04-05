import React, { useState, useMemo, useEffect, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
  Dimensions,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useSettings } from "@/lib/settings-context";
import { CURRENCIES } from "@/lib/settings";

const COLUMNS = 3;
const SCREEN_WIDTH = Dimensions.get("window").width;
const GUTTER = 12;
const CARD_WIDTH = (SCREEN_WIDTH - GUTTER * (COLUMNS + 1)) / COLUMNS;
const CARD_HEIGHT = CARD_WIDTH * 1.4;

const FALLBACK_RATES: Record<string, number> = { USD: 1, GBP: 0.79, EUR: 0.92, AUD: 1.55, CAD: 1.38, JPY: 150 };

interface ExchangeRateData { rates: Record<string, number>; updatedAt: string; }

type SortBy = "number" | "value";

interface SetCard {
  id: string;
  name: string;
  number: string;
  imageUrl: string | null;
  price?: number | null;
}

const SetPickCard = memo(({ item, index, onPress, currencySymbol, currencyRate, ebayPrices, ebayLoading }: {
  item: SetCard;
  index: number;
  setName: string;
  onPress: () => void;
  currencySymbol: string;
  currencyRate: number;
  ebayPrices?: Record<string, number>;
  ebayLoading?: boolean;
}) => {
  const rawLocal = item.price != null && item.price > 0
    ? Math.round(item.price * currencyRate)
    : null;
  const psa10USD = ebayPrices?.psa10;
  const psa10Local = psa10USD != null && psa10USD > 0 ? Math.round(psa10USD * currencyRate) : null;
  const profitLocal = psa10Local != null && rawLocal != null ? psa10Local - rawLocal : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.topCard, { opacity: pressed ? 0.8 : 1 }]}
      onPress={onPress}
    >
      <View style={styles.topCardRank}>
        <Text style={styles.topCardRankText}>#{index + 1}</Text>
      </View>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.topCardImg} contentFit="contain" />
      ) : (
        <View style={[styles.topCardImg, styles.cardImagePlaceholder]}>
          <Ionicons name="image-outline" size={20} color={Colors.textMuted} />
        </View>
      )}
      <Text style={styles.topCardName} numberOfLines={2}>{item.name}</Text>
      <View style={styles.topCardDivider} />
      {ebayLoading ? (
        <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 10 }} />
      ) : (
        <>
          <View style={styles.topCardRow}>
            <Text style={styles.topCardLabel}>PSA 10</Text>
            {psa10Local != null ? (
              <Text style={styles.topCardValue}>{currencySymbol}{psa10Local}</Text>
            ) : (
              <Text style={styles.topCardMuted}>—</Text>
            )}
          </View>
          <View style={styles.topCardRow}>
            <Text style={styles.topCardLabel}>Raw</Text>
            {rawLocal != null ? (
              <Text style={styles.topCardMuted}>{currencySymbol}{rawLocal}</Text>
            ) : (
              <Text style={styles.topCardMuted}>—</Text>
            )}
          </View>
          <View style={styles.topCardDivider} />
          <View style={styles.topCardRow}>
            <Text style={styles.topCardLabel}>Profit</Text>
            {profitLocal != null ? (
              <Text style={[styles.topCardProfit, { color: profitLocal >= 0 ? "#22c55e" : Colors.error }]}>
                {profitLocal >= 0 ? "+" : ""}{currencySymbol}{profitLocal}
              </Text>
            ) : (
              <Text style={styles.topCardMuted}>—</Text>
            )}
          </View>
        </>
      )}
      <Text style={styles.topCardHint}>Tap for full breakdown</Text>
    </Pressable>
  );
});

function parseCardNumber(n: string): number {
  const m = n.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : 9999;
}

export default function SetCardsScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const { lang, setId, setName, setTotal, edition } = useLocalSearchParams<{
    lang: string;
    setId: string;
    setName: string;
    setTotal?: string;
    edition?: string;
  }>();

  const editionParam = edition === "1st" || edition === "unlimited" ? edition : null;

  const [sortBy, setSortBy] = useState<SortBy>("number");

  const { settings } = useSettings();
  const currency = settings.currency || "GBP";
  const { data: ratesData } = useQuery<ExchangeRateData>({
    queryKey: ["/api/exchange-rates"],
    staleTime: 22 * 60 * 60 * 1000,
  });
  const rates = ratesData?.rates || FALLBACK_RATES;
  const currencyDef = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0];
  const currencySymbol = currencyDef.symbol;
  // All TCGPlayer prices are in USD; eBay prices are nominally in USD too
  const currencyRate = currency === "USD" ? 1 : (rates[currency] ?? FALLBACK_RATES[currency] ?? 1) / (rates["USD"] ?? 1);

  const cardsUrl = editionParam
    ? `/api/sets/${lang}/${setId}/cards?edition=${editionParam}`
    : `/api/sets/${lang}/${setId}/cards`;

  const { data, isLoading, error } = useQuery<{ cards: SetCard[] }>({
    queryKey: ["/api/sets", lang, setId, "cards", editionParam ?? "any"],
    queryFn: async () => {
      const { getApiUrl } = await import("@/lib/query-client");
      const url = new URL(cardsUrl, getApiUrl());
      const resp = await fetch(url.toString());
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    },
    enabled: !!lang && !!setId,
    staleTime: 6 * 60 * 60 * 1000,
  });

  const isEnglish = lang === "english";

  const allCards = data?.cards ?? [];
  const hasAnyPrice = isEnglish && allCards.some(c => c.price != null);

  const cards = useMemo(() => {
    if (sortBy === "value" && isEnglish) {
      return [...allCards].sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
    }
    return [...allCards].sort((a, b) => parseCardNumber(a.number) - parseCardNumber(b.number));
  }, [allCards, sortBy, isEnglish]);

  // Top 15 by raw TCGPlayer price — candidates for profit analysis
  const top15 = useMemo(() => {
    if (!hasAnyPrice) return [];
    return [...allCards]
      .filter(c => c.price != null && c.price > 0)
      .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
      .slice(0, 15);
  }, [allCards, hasAnyPrice]);

  const [ebayPricesMap, setEbayPricesMap] = useState<Record<string, Record<string, number>>>({});
  const [ebayPricesLoading, setEbayPricesLoading] = useState(false);

  const top15Key = top15.map(c => c.id).join(",");

  useEffect(() => {
    if (!top15Key) return;
    let cancelled = false;
    setEbayPricesLoading(true);
    setEbayPricesMap({});
    (async () => {
      const { getApiUrl } = await import("@/lib/query-client");
      const map: Record<string, Record<string, number>> = {};
      for (const card of top15) {
        if (cancelled) break;
        try {
          const params = new URLSearchParams({ name: card.name, setName: setName || "" });
          if (card.number) params.set("cardNumber", card.number);
          const url = new URL(`/api/ebay-all-grades?${params}`, getApiUrl());
          const resp = await fetch(url.toString());
          if (resp.ok) {
            const d = await resp.json();
            if (!d.error) map[card.id] = d;
          }
        } catch (_) {}
        if (!cancelled) setEbayPricesMap(prev => ({ ...prev, ...map }));
        await new Promise(r => setTimeout(r, 200));
      }
      if (!cancelled) {
        setEbayPricesMap(map);
        setEbayPricesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [top15Key, setName]);

  // Sort top15 by PSA 10 profit (eBay PSA10 USD - raw USD), take top 10
  const topByProfit = useMemo(() => {
    if (top15.length === 0) return [];
    return [...top15]
      .sort((a, b) => {
        const aP10 = ebayPricesMap[a.id]?.psa10 ?? 0;
        const bP10 = ebayPricesMap[b.id]?.psa10 ?? 0;
        const aProfit = aP10 > 0 ? aP10 - (a.price ?? 0) : -999999;
        const bProfit = bP10 > 0 ? bP10 - (b.price ?? 0) : -999999;
        return bProfit - aProfit;
      })
      .slice(0, 10);
  }, [top15, ebayPricesMap]);

  // Derive set total: prefer the param passed from the set list, fall back to card count
  const resolvedSetTotal = setTotal || (allCards.length > 0 ? String(allCards.length) : "");

  const handleCardPress = (card: SetCard) => {
    router.push({
      pathname: "/card-profit",
      params: {
        cardId: card.id,
        cardName: card.name,
        setName: setName || "",
        cardNumber: card.number || "",
        setTotal: resolvedSetTotal,
        imageUrl: card.imageUrl || "",
        rawPriceUSD: card.price ? String(card.price) : "0",
        ...(editionParam ? { edition: editionParam } : {}),
      },
    });
  };

  const renderGridCard = ({ item }: { item: SetCard }) => (
    <Pressable
      style={({ pressed }) => [styles.gridItem, { opacity: pressed ? 0.75 : 1 }]}
      onPress={() => handleCardPress(item)}
    >
      {item.imageUrl ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.cardImage}
          contentFit="contain"
          transition={150}
        />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Ionicons name="image-outline" size={24} color={Colors.textMuted} />
        </View>
      )}
      {item.number ? (
        <Text style={styles.cardNumber} numberOfLines={1}>#{item.number}</Text>
      ) : null}
      {item.price != null ? (
        <Text style={styles.cardPrice} numberOfLines={1}>{currencySymbol}{currencySymbol === "¥" ? Math.round(item.price * currencyRate) : (item.price * currencyRate).toFixed(2)}</Text>
      ) : null}
    </Pressable>
  );

  const showTopPicks = isEnglish && hasAnyPrice && top15.length > 0 && !isLoading && !error;

  const listHeader = (
    <>
      {/* Edition banner — shown for WOTC 1st Edition / Unlimited sets */}
      {editionParam && (
        <View style={editionParam === "1st" ? styles.editionBanner1st : styles.editionBannerUnlimited}>
          <Ionicons
            name={editionParam === "1st" ? "star" : "layers-outline"}
            size={14}
            color={editionParam === "1st" ? "#fff" : Colors.textSecondary}
          />
          <Text style={editionParam === "1st" ? styles.editionBanner1stText : styles.editionBannerUnlimitedText}>
            {editionParam === "1st"
              ? "1st Edition · TCGPlayer doesn't separate editions — tap any card for real 1st Edition last-sold prices"
              : "Unlimited · TCGPlayer doesn't separate editions — tap any card for real Unlimited last-sold prices"}
          </Text>
        </View>
      )}

      {/* No price data notice */}
      {isEnglish && !hasAnyPrice && !isLoading && !error && allCards.length > 0 && (
        <View style={styles.noPriceNotice}>
          <Ionicons name="time-outline" size={16} color="#f59e0b" />
          <View style={{ flex: 1 }}>
            <Text style={styles.noPriceNoticeTitle}>No TCGPlayer prices available yet</Text>
            <Text style={styles.noPriceNoticeBody}>
              This is likely a new or regional set that hasn't been indexed by our data provider. Raw prices and profit estimates aren't available, but you can still grade individual cards.
            </Text>
          </View>
        </View>
      )}

      {/* Sort controls — always shown once cards load */}
      {!isLoading && !error && cards.length > 0 && (
        <View style={styles.sortBar}>
          <Pressable
            style={[styles.sortBtn, sortBy === "number" && styles.sortBtnActive]}
            onPress={() => setSortBy("number")}
          >
            <Ionicons name="list-outline" size={14} color={sortBy === "number" ? Colors.text : Colors.textMuted} />
            <Text style={[styles.sortBtnText, sortBy === "number" && styles.sortBtnTextActive]}>Card #</Text>
          </Pressable>
          {isEnglish && hasAnyPrice && (
            <Pressable
              style={[styles.sortBtn, sortBy === "value" && styles.sortBtnActive]}
              onPress={() => setSortBy("value")}
            >
              <Ionicons name="arrow-down-outline" size={14} color={sortBy === "value" ? Colors.text : Colors.textMuted} />
              <Text style={[styles.sortBtnText, sortBy === "value" && styles.sortBtnTextActive]}>Highest Value</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* ── Top Grading Picks ── */}
      {showTopPicks && (
        <View style={styles.topPicksSection}>
          <View style={styles.topPicksHeader}>
            <View>
              <Text style={styles.topPicksTitle}>Top Grading Picks</Text>
              <Text style={styles.topPicksSubtitle}>
                {ebayPricesLoading ? "Loading graded prices…" : "Highest PSA 10 profit first"}
              </Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.topPicksScroll}
          >
            {topByProfit.map((card, i) => (
              <SetPickCard
                key={card.id}
                item={card}
                index={i}
                setName={setName || ""}
                onPress={() => handleCardPress(card)}
                currencySymbol={currencySymbol}
                currencyRate={currencyRate}
                ebayPrices={ebayPricesMap[card.id]}
                ebayLoading={ebayPricesLoading && !ebayPricesMap[card.id]}
              />
            ))}
          </ScrollView>
          <View style={styles.topPicksDisclaimer}>
            <Ionicons name="information-circle-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.topPicksDisclaimerText}>
              {editionParam
                ? `PSA 10: eBay last sold · Raw: TCGPlayer reference · Tap a card for full grade breakdown`
                : `PSA 10: eBay last sold · Raw: TCGPlayer market price · All prices in ${currency}`}
            </Text>
          </View>
        </View>
      )}
    </>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1 }]}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.navTitle} numberOfLines={1}>{setName || "Set"}</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading cards…</Text>
        </View>
      )}

      {!isLoading && error && (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={36} color={Colors.error} />
          <Text style={styles.errorText}>Card data unavailable</Text>
          <Text style={styles.emptySubtitle}>This set's card data couldn't be loaded. It may not be available from our data provider.</Text>
          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go back</Text>
          </Pressable>
        </View>
      )}

      {!isLoading && !error && cards.length === 0 && (
        <View style={styles.centered}>
          <Ionicons name="albums-outline" size={36} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No card data available</Text>
          <Text style={styles.emptySubtitle}>Card data for this set isn't available yet.</Text>
        </View>
      )}

      {!isLoading && cards.length > 0 && (
        <FlatList
          data={cards}
          keyExtractor={(item) => item.id}
          numColumns={COLUMNS}
          ListHeaderComponent={listHeader}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + webBottomInset + 24 }]}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
          renderItem={renderGridCard}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    flex: 1,
    textAlign: "center",
  },
  sortBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  sortBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  sortBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textMuted,
  },
  sortBtnTextActive: {
    color: Colors.text,
  },
  // ── Top Grading Picks ────────────────────────────────────
  topPicksSection: {
    marginTop: 4,
    marginBottom: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
  },
  topPicksHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    marginBottom: 12,
    gap: 12,
  },
  topPicksTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  topPicksSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  gradeSelector: {
    flexDirection: "row",
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  gradeSelectorBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  gradeSelectorBtnActive: {
    backgroundColor: Colors.primary,
  },
  gradeSelectorText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textMuted,
  },
  gradeSelectorTextActive: {
    color: "#fff",
  },
  topPicksScroll: {
    paddingHorizontal: 14,
    gap: 10,
  },
  topCard: {
    width: 140,
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
  },
  topCardRankText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: Colors.textMuted,
  },
  topCardImg: {
    width: "100%" as any,
    height: 90,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    marginBottom: 6,
  },
  topCardName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.text,
    lineHeight: 16,
    marginBottom: 6,
    minHeight: 32,
  },
  topCardDivider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginBottom: 6,
  },
  topCardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
  },
  topCardLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  topCardValue: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  topCardProfit: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  topCardMuted: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  topCardHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 6,
  },
  topPicksDisclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  topPicksDisclaimerText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    flex: 1,
    lineHeight: 15,
  },
  // ── Centered states ──────────────────────────────────────
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
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
  },
  backLink: {
    marginTop: 4,
  },
  backLinkText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: Colors.primary,
  },
  emptyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
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
  // Edition banners
  editionBanner1st: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: "#7c3aed",
    borderRadius: 10,
    padding: 10,
  },
  editionBanner1stText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#fff",
    flex: 1,
  },
  editionBannerUnlimited: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 10,
  },
  editionBannerUnlimitedText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
  },
  noPriceNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.2)",
    padding: 12,
  },
  noPriceNoticeTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#f59e0b",
    marginBottom: 3,
  },
  noPriceNoticeBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  // ── Grid layout ──────────────────────────────────────────
  grid: {
    paddingTop: GUTTER,
    paddingHorizontal: GUTTER,
  },
  gridRow: {
    gap: GUTTER,
    marginBottom: GUTTER,
  },
  gridItem: {
    width: CARD_WIDTH,
    alignItems: "center",
  },
  cardImage: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 6,
    backgroundColor: Colors.surface,
  },
  cardImagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  cardNumber: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
    textAlign: "center",
  },
  cardPrice: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.primary,
    textAlign: "center",
  },
  separator: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginLeft: 16,
  },
});
