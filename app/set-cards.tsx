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
  Linking,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useSettings } from "@/lib/settings-context";
import { CURRENCIES } from "@/lib/settings";
import type { CompanyId } from "@/lib/settings";
import CompanyLabel from "@/components/CompanyLabel";
import { useSubscription } from "@/lib/subscription";
import ValuesUpgradeSheet from "@/components/ValuesUpgradeSheet";
import { BlurredValue } from "@/components/BlurredValue";

// Mirrors the config in values.tsx — top grade key and display label per company
const PICKS_COMPANY_CONFIG: Record<CompanyId, { topEbayKey: string; topGradeLabel: string }> = {
  PSA:     { topEbayKey: "psa10",  topGradeLabel: "PSA 10"  },
  Beckett: { topEbayKey: "bgs95",  topGradeLabel: "BGS 9.5" },
  Ace:     { topEbayKey: "ace10",  topGradeLabel: "ACE 10"  },
  TAG:     { topEbayKey: "tag10",  topGradeLabel: "TAG 10"  },
  CGC:     { topEbayKey: "cgc10",  topGradeLabel: "CGC 10"  },
};

const COLUMNS = 3;
const SCREEN_WIDTH = Dimensions.get("window").width;
const GUTTER = 12;
const CARD_WIDTH = (SCREEN_WIDTH - GUTTER * (COLUMNS + 1)) / COLUMNS;
const CARD_HEIGHT = CARD_WIDTH * 1.4;

const FALLBACK_RATES: Record<string, number> = { USD: 1, GBP: 0.79, EUR: 0.92, AUD: 1.55, CAD: 1.38, JPY: 150 };

interface ExchangeRateData { rates: Record<string, number>; updatedAt: string; }

type SortBy = "number" | "value";

interface CardPrices {
  holofoil?: number | null;
  reverseHolofoil?: number | null;
  normal?: number | null;
}

interface SetCard {
  id: string;
  name: string;
  nameEn?: string | null;
  number: string;
  imageUrl: string | null;
  price?: number | null;
  prices?: CardPrices | null;
  priceEUR?: number | null;
  setNameEn?: string | null;
}

const SetPickCard = memo(({ item, index, setName, onPress, currencySymbol, currencyRate, ebayPrices, ebayLoading, topEbayKey, topGradeLabel, picksCompany, profitDisplay, isSubscribed }: {
  item: SetCard;
  index: number;
  setName: string;
  onPress: () => void;
  currencySymbol: string;
  currencyRate: number;
  ebayPrices?: Record<string, number>;
  ebayLoading?: boolean;
  topEbayKey: string;
  topGradeLabel: string;
  picksCompany: CompanyId;
  profitDisplay: "value" | "percentage" | "both";
  isSubscribed: boolean;
}) => {
  const rawLocal = item.price != null && item.price > 0
    ? Math.round(item.price * currencyRate)
    : null;
  const topUSD = ebayPrices ? (ebayPrices as Record<string, number>)[topEbayKey] : undefined;
  const topLocal = topUSD != null && topUSD > 0 ? Math.round(topUSD * currencyRate) : null;
  const profitLocal = topLocal != null && rawLocal != null ? topLocal - rawLocal : null;
  const fmtProfit = (abs: number): string => {
    const val = `${currencySymbol}${abs}`;
    const pct = rawLocal != null && rawLocal > 0 ? `${Math.round((abs / rawLocal) * 100)}%` : null;
    if (profitDisplay === "percentage" && pct) return pct;
    if (profitDisplay === "both" && pct) return `${val} (${pct})`;
    return val;
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.topCard, { opacity: pressed ? 0.8 : 1 }]}
      onPress={onPress}
    >
      <View style={styles.topCardRank}>
        <Text style={styles.topCardRankText}>#{index + 1}</Text>
      </View>

      {/* Card image — blurred for free users */}
      <View style={{ position: "relative" }}>
        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.topCardImg}
            contentFit="contain"
            blurRadius={isSubscribed ? 0 : 18}
          />
        ) : (
          <View style={[styles.topCardImg, styles.cardImagePlaceholder]}>
            <Ionicons name="image-outline" size={20} color={Colors.textMuted} />
          </View>
        )}
        {!isSubscribed && (
          <View style={styles.topCardLockOverlay}>
            <Ionicons name="lock-closed" size={18} color="#fff" />
          </View>
        )}
      </View>

      <View style={{ position: "relative" }}>
        <Text style={styles.topCardName} numberOfLines={2}>{item.name}</Text>
        {!isSubscribed && (
          <BlurView intensity={28} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: 4 }]} />
        )}
      </View>
      <View style={styles.topCardDivider} />

      {/* Graded price + profit — all users see data, blurred for free */}
      {ebayLoading ? (
        <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 10 }} />
      ) : (
        <>
          <View style={styles.topCardRow}>
            <CompanyLabel company={picksCompany} fontSize={11} />
            {topLocal != null ? (
              <BlurredValue blurred={!isSubscribed}>
                <Text style={styles.topCardValue}>{currencySymbol}{topLocal}</Text>
              </BlurredValue>
            ) : (
              <Text style={styles.topCardMuted}>—</Text>
            )}
          </View>
          <View style={styles.topCardRow}>
            <Text style={styles.topCardLabel}>Raw</Text>
            {rawLocal != null ? (
              <BlurredValue blurred={!isSubscribed}>
                <Text style={styles.topCardMuted}>{currencySymbol}{rawLocal}</Text>
              </BlurredValue>
            ) : (
              <Text style={styles.topCardMuted}>—</Text>
            )}
          </View>
          <View style={styles.topCardDivider} />
          <View style={styles.topCardRow}>
            <Text style={styles.topCardLabel}>Profit</Text>
            {profitLocal != null ? (
              <BlurredValue blurred={!isSubscribed}>
                <Text style={[styles.topCardProfit, { color: profitLocal >= 0 ? "#22c55e" : Colors.error }]}>
                  {profitLocal >= 0 ? "+" : "-"}{fmtProfit(Math.abs(profitLocal))}
                </Text>
              </BlurredValue>
            ) : (
              <Text style={styles.topCardMuted}>—</Text>
            )}
          </View>
        </>
      )}
      <View style={styles.topCardFooter}>
        <Text style={styles.topCardHint}>Tap for breakdown</Text>
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            const q = [item.name, item.number || null, setName, "Pokemon"].filter(Boolean).join(" ");
            Linking.openURL(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`);
          }}
          hitSlop={6}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, flexDirection: "row", alignItems: "center", gap: 2 })}
        >
          <Text style={styles.topCardEbayLink}>Find on eBay</Text>
          <Ionicons name="open-outline" size={10} color={Colors.textMuted} />
        </Pressable>
      </View>
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

  const [sortBy, setSortBy] = useState<SortBy>("value");

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

  const { data, isLoading, error, refetch, isRefetching } = useQuery<{ cards: SetCard[] }>({
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
  const isJapanese = lang === "japanese";

  // EUR rate (rates are relative to USD — EUR: 0.92 means 1 USD = 0.92 EUR, so 1 EUR = 1/0.92 USD)
  const eurRate = rates["EUR"] ?? 0.92;

  // Preferred picks company — mirrors the logic in values.tsx
  const effectivePicksCompany: CompanyId = useMemo(() => {
    const preferred = settings.preferredPicksCompany;
    if (settings.enabledCompanies.includes(preferred)) return preferred as CompanyId;
    return (settings.enabledCompanies[0] as CompanyId) ?? "PSA";
  }, [settings.preferredPicksCompany, settings.enabledCompanies]);
  const picksConfig = PICKS_COMPANY_CONFIG[effectivePicksCompany];

  const allCards = data?.cards ?? [];
  const hasAnyPrice = isEnglish && allCards.some(c => c.price != null);
  const hasAnyEurPrice = isJapanese && allCards.some(c => c.priceEUR != null && c.priceEUR > 0);
  const canSortByValue = hasAnyPrice || hasAnyEurPrice;

  const cards = useMemo(() => {
    if (sortBy === "value" && canSortByValue) {
      if (isJapanese && hasAnyEurPrice) {
        return [...allCards].sort((a, b) => (b.priceEUR ?? -1) - (a.priceEUR ?? -1));
      }
      return [...allCards].sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
    }
    return [...allCards].sort((a, b) => parseCardNumber(a.number) - parseCardNumber(b.number));
  }, [allCards, sortBy, isEnglish, isJapanese, hasAnyPrice, hasAnyEurPrice, canSortByValue]);

  // Top 15 by raw TCGPlayer price (English) — candidates for profit analysis
  const top15 = useMemo(() => {
    if (!hasAnyPrice) return [];
    return [...allCards]
      .filter(c => c.price != null && c.price > 0)
      .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
      .slice(0, 15);
  }, [allCards, hasAnyPrice]);

  // Japanese top picks — fetched from /api/jp-set-picks (PokeTrace EU top cards by NM price)
  interface JpPick {
    id: string; name: string; number: string;
    imageUrl: string | null; nmEUR: number; avg7dEUR: number | null;
  }
  const [jpTopPicks, setJpTopPicks] = useState<JpPick[]>([]);
  const [jpTopPicksLoading, setJpTopPicksLoading] = useState(false);

  useEffect(() => {
    if (!isJapanese || !setName) return;
    let cancelled = false;
    setJpTopPicksLoading(true);
    (async () => {
      try {
        const { getApiUrl } = await import("@/lib/query-client");
        const slug = setName.toLowerCase().replace(/['\u2019]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        const url = new URL(`/api/jp-set-picks?setSlug=${encodeURIComponent(slug)}&setNameEn=${encodeURIComponent(setName)}&limit=15`, getApiUrl());
        const resp = await fetch(url.toString());
        if (resp.ok && !cancelled) {
          const d = await resp.json();
          setJpTopPicks(d.picks || []);
        }
      } catch (_) {}
      if (!cancelled) setJpTopPicksLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isJapanese, setName]);

  const [ebayPricesMap, setEbayPricesMap] = useState<Record<string, Record<string, number>>>({});
  const [ebayPricesLoading, setEbayPricesLoading] = useState(false);
  const [showUpgradeSheet, setShowUpgradeSheet] = useState(false);
  const { isSubscribed, isAdminMode } = useSubscription();
  const hasAccess = isSubscribed || isAdminMode;

  // For English: fetch eBay prices for the top 15 by TCGPlayer price
  const top15Key = top15.map(c => c.id).join(",");
  useEffect(() => {
    if (!top15Key || isJapanese) return;
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
  }, [top15Key, setName, isJapanese]);

  // For Japanese: fetch eBay graded prices for each JP top pick (using English card name)
  const jpTopPicksKey = jpTopPicks.map(c => c.id).join(",");
  useEffect(() => {
    if (!isJapanese || !jpTopPicksKey) return;
    let cancelled = false;
    setEbayPricesLoading(true);
    setEbayPricesMap({});
    (async () => {
      const { getApiUrl } = await import("@/lib/query-client");
      const map: Record<string, Record<string, number>> = {};
      for (const card of jpTopPicks) {
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
        await new Promise(r => setTimeout(r, 250));
      }
      if (!cancelled) {
        setEbayPricesMap(map);
        setEbayPricesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [jpTopPicksKey, setName, isJapanese]);

  // Sort top15 by preferred company's top grade profit, take top 10 (English)
  const topByProfit = useMemo(() => {
    if (top15.length === 0 || isJapanese) return [];
    const key = picksConfig.topEbayKey;
    return [...top15]
      .sort((a, b) => {
        const aTop = (ebayPricesMap[a.id] as Record<string, number> | undefined)?.[key] ?? 0;
        const bTop = (ebayPricesMap[b.id] as Record<string, number> | undefined)?.[key] ?? 0;
        const aProfit = aTop > 0 ? aTop - (a.price ?? 0) : -999999;
        const bProfit = bTop > 0 ? bTop - (b.price ?? 0) : -999999;
        return bProfit - aProfit;
      })
      .slice(0, 10);
  }, [top15, ebayPricesMap, picksConfig.topEbayKey, isJapanese]);

  // Japanese top picks sorted by company's top grade profit
  const jpTopByProfit = useMemo(() => {
    if (!isJapanese || jpTopPicks.length === 0) return [];
    const key = picksConfig.topEbayKey;
    return [...jpTopPicks]
      .sort((a, b) => {
        const aTop = (ebayPricesMap[a.id] as Record<string, number> | undefined)?.[key] ?? 0;
        const bTop = (ebayPricesMap[b.id] as Record<string, number> | undefined)?.[key] ?? 0;
        const aRawUSD = a.nmEUR / eurRate;
        const bRawUSD = b.nmEUR / eurRate;
        const aProfit = aTop > 0 ? aTop - aRawUSD : -999999;
        const bProfit = bTop > 0 ? bTop - bRawUSD : -999999;
        return bProfit - aProfit;
      })
      .slice(0, 10);
  }, [jpTopPicks, ebayPricesMap, picksConfig.topEbayKey, isJapanese, eurRate]);

  // The active top picks list (English or Japanese)
  const activeTopPicks = isJapanese ? jpTopByProfit : topByProfit;

  // Derive set total: prefer the param passed from the set list, fall back to card count
  const resolvedSetTotal = setTotal || (allCards.length > 0 ? String(allCards.length) : "");

  const handleCardPress = (card: SetCard) => {
    const cardName = (isJapanese && card.nameEn) ? card.nameEn : card.name;
    const rawSetName = (isJapanese && card.setNameEn) ? card.setNameEn : (setName || "");
    router.push({
      pathname: "/card-profit",
      params: {
        cardId: card.id,
        cardName,
        setName: rawSetName,
        cardNumber: card.number || "",
        setTotal: resolvedSetTotal,
        imageUrl: card.imageUrl || "",
        rawPriceUSD: card.price ? String(card.price) : "0",
        company: effectivePicksCompany,
        ...(isJapanese && card.priceEUR ? { rawPriceEUR: String(card.priceEUR), lang: "ja" } : {}),
        ...(editionParam ? { edition: editionParam } : {}),
        ...(card.prices?.holofoil != null ? { holoPrice: String(card.prices.holofoil) } : {}),
        ...(card.prices?.reverseHolofoil != null ? { reverseHoloPrice: String(card.prices.reverseHolofoil) } : {}),
        ...(card.prices?.normal != null ? { normalPrice: String(card.prices.normal) } : {}),
      },
    });
  };

  // Navigate to card-profit from the Japanese top picks list
  const handleJpPickPress = (pick: JpPick) => {
    router.push({
      pathname: "/card-profit",
      params: {
        cardId: pick.id,
        cardName: pick.name,
        setName: setName || "",
        cardNumber: pick.number || "",
        setTotal: resolvedSetTotal,
        imageUrl: pick.imageUrl || "",
        rawPriceUSD: String(pick.nmEUR / eurRate), // approximate USD for eBay profit calcs
        rawPriceEUR: String(pick.nmEUR),
        lang: "ja",
        company: effectivePicksCompany,
      },
    });
  };

  const fmtPrice = (usd: number) => {
    const local = usd * currencyRate;
    return currencySymbol === "¥" ? `${currencySymbol}${Math.round(local)}` : `${currencySymbol}${local.toFixed(2)}`;
  };

  const fmtEurPrice = (eur: number) => {
    // Convert EUR → user currency
    const local = eur * (currencyRate / eurRate);
    return currencySymbol === "¥" ? `${currencySymbol}${Math.round(local)}` : `${currencySymbol}${local.toFixed(2)}`;
  };

  const renderGridCard = ({ item }: { item: SetCard }) => {
    const hasMultipleVariants = item.prices != null &&
      [item.prices.holofoil, item.prices.reverseHolofoil, item.prices.normal].filter(v => v != null).length > 1;

    const jpPriceEUR = isJapanese ? item.priceEUR : null;

    return (
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
        {(item.nameEn || item.name) ? (
          <Text style={styles.cardName} numberOfLines={1}>{item.nameEn || item.name}</Text>
        ) : null}
        {item.number ? (
          <Text style={styles.cardNumber} numberOfLines={1}>#{item.number}</Text>
        ) : null}
        {isJapanese && jpPriceEUR != null ? (
          <BlurredValue blurred={!hasAccess}>
            <Text style={styles.cardPrice} numberOfLines={1}>{fmtEurPrice(jpPriceEUR)}</Text>
          </BlurredValue>
        ) : item.price != null ? (
          <BlurredValue blurred={!hasAccess}>
            <View style={styles.gridPriceRow}>
              <Text style={styles.cardPrice} numberOfLines={1}>{fmtPrice(item.price)}</Text>
              {hasMultipleVariants && isEnglish && (
                <View style={styles.variantHint}>
                  <Ionicons name="layers-outline" size={10} color={Colors.textMuted} />
                </View>
              )}
            </View>
          </BlurredValue>
        ) : null}
      </Pressable>
    );
  };

  const showTopPicks = !isLoading && !error && (
    (isEnglish && hasAnyPrice && top15.length > 0) ||
    (isJapanese && (jpTopPicks.length > 0 || jpTopPicksLoading))
  );

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
          {canSortByValue && (
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
                {!hasAccess
                  ? "Subscribe to unlock graded prices & profit data"
                  : (ebayPricesLoading || (isJapanese && jpTopPicksLoading))
                    ? "Loading graded prices…"
                    : `Highest ${picksConfig.topGradeLabel} profit first`}
              </Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.topPicksScroll}
          >
            {isJapanese ? (
              jpTopPicksLoading && jpTopPicks.length === 0 ? (
                <ActivityIndicator color={Colors.primary} style={{ marginLeft: 16 }} />
              ) : jpTopByProfit.map((pick, i) => (
                <SetPickCard
                  key={pick.id}
                  item={{ ...pick, price: pick.nmEUR / eurRate } as unknown as SetCard}
                  index={i}
                  setName={setName || ""}
                  onPress={() => handleJpPickPress(pick)}
                  currencySymbol={currencySymbol}
                  currencyRate={currencyRate}
                  ebayPrices={ebayPricesMap[pick.id]}
                  ebayLoading={ebayPricesLoading && !ebayPricesMap[pick.id]}
                  topEbayKey={picksConfig.topEbayKey}
                  topGradeLabel={picksConfig.topGradeLabel}
                  picksCompany={effectivePicksCompany}
                  profitDisplay={settings.profitDisplay ?? "value"}
                  isSubscribed={hasAccess}
                />
              ))
            ) : (
              topByProfit.map((card, i) => (
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
                  topEbayKey={picksConfig.topEbayKey}
                  topGradeLabel={picksConfig.topGradeLabel}
                  picksCompany={effectivePicksCompany}
                  profitDisplay={settings.profitDisplay ?? "value"}
                  isSubscribed={hasAccess}
                />
              ))
            )}
          </ScrollView>
          <View style={styles.topPicksDisclaimer}>
            <Ionicons name="information-circle-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.topPicksDisclaimerText}>
              {isJapanese
                ? `${picksConfig.topGradeLabel}: eBay last sold · Raw: Cardmarket price · All prices in ${currency}`
                : editionParam
                  ? `${picksConfig.topGradeLabel}: eBay last sold · Raw: TCGPlayer reference · Tap a card for full grade breakdown`
                  : `${picksConfig.topGradeLabel}: eBay last sold · Raw: TCGPlayer market price · All prices in ${currency}`}
            </Text>
          </View>
        </View>
      )}
    </>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <ValuesUpgradeSheet visible={showUpgradeSheet} onClose={() => setShowUpgradeSheet(false)} />
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
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                refetch();
                if (isJapanese && setName) {
                  const slug = setName.toLowerCase().replace(/['\u2019]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
                  import("@/lib/query-client").then(({ getApiUrl }) => {
                    fetch(new URL(`/api/jp-set-picks?setSlug=${encodeURIComponent(slug)}&setNameEn=${encodeURIComponent(setName)}&limit=15`, getApiUrl()).toString())
                      .then(r => r.json())
                      .then(d => { if (d.picks) setJpTopPicks(d.picks); })
                      .catch(() => {});
                  });
                }
              }}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
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
  proBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.primary,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  proBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    color: "#fff",
    letterSpacing: 0.5,
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
  topCardLockOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 6,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
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
  topCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    paddingHorizontal: 2,
  },
  topCardHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
  },
  topCardEbayLink: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
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
  cardName: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: "center",
    paddingHorizontal: 2,
  },
  cardNumber: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
    textAlign: "center",
  },
  cardPrice: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.primary,
    textAlign: "center",
  },
  gridPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    justifyContent: "center",
  },
  variantHint: {
    opacity: 0.6,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginLeft: 16,
  },
});
