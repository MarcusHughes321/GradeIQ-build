import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Modal,
} from "react-native";
import { Image } from "expo-image";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useSettings } from "@/lib/settings-context";
import { CURRENCIES } from "@/lib/settings";
import { apiRequest } from "@/lib/query-client";
import type { CompanyId } from "@/lib/settings";

const FALLBACK_RATES: Record<string, number> = { USD: 1, GBP: 0.79, EUR: 0.92, AUD: 1.55, CAD: 1.38, JPY: 150 };
interface ExchangeRateData { rates: Record<string, number>; updatedAt: string; }

interface EbayAllGrades {
  psa10: number; psa9: number; psa8: number; psa7: number;
  bgs10: number; bgs95: number; bgs9: number; bgs85: number; bgs8: number;
  ace10: number; ace9: number; ace8: number;
  tag10: number; tag9: number; tag8: number;
  cgc10: number; cgc95: number; cgc9: number; cgc8: number;
  raw: number;
  fetchedAt?: number;
  isStale?: boolean;
}

interface GradeEntry {
  grade: number;
  ebayKey: keyof EbayAllGrades;
  label: string;
}

const COMPANY_CONFIG: Record<string, {
  fee: number;
  label: string;
  dotColor: string;
  grades: GradeEntry[];
}> = {
  PSA: {
    fee: 25, label: "PSA", dotColor: "#1E56A0",
    grades: [
      { grade: 10, ebayKey: "psa10", label: "PSA 10" },
      { grade: 9,  ebayKey: "psa9",  label: "PSA 9"  },
      { grade: 8,  ebayKey: "psa8",  label: "PSA 8"  },
      { grade: 7,  ebayKey: "psa7",  label: "PSA 7"  },
    ],
  },
  Beckett: {
    fee: 25, label: "BGS", dotColor: "#C0C0C0",
    grades: [
      { grade: 10,  ebayKey: "bgs10", label: "BGS 10"  },
      { grade: 9.5, ebayKey: "bgs95", label: "BGS 9.5" },
      { grade: 9,   ebayKey: "bgs9",  label: "BGS 9"   },
      { grade: 8.5, ebayKey: "bgs85", label: "BGS 8.5" },
      { grade: 8,   ebayKey: "bgs8",  label: "BGS 8"   },
    ],
  },
  Ace: {
    fee: 15, label: "ACE", dotColor: "#FFD700",
    grades: [
      { grade: 10, ebayKey: "ace10", label: "ACE 10" },
      { grade: 9,  ebayKey: "ace9",  label: "ACE 9"  },
      { grade: 8,  ebayKey: "ace8",  label: "ACE 8"  },
    ],
  },
  TAG: {
    fee: 20, label: "TAG", dotColor: "#9CA3AF",
    grades: [
      { grade: 10, ebayKey: "tag10", label: "TAG 10" },
      { grade: 9,  ebayKey: "tag9",  label: "TAG 9"  },
      { grade: 8,  ebayKey: "tag8",  label: "TAG 8"  },
    ],
  },
  CGC: {
    fee: 22, label: "CGC", dotColor: "#E63946",
    grades: [
      { grade: 10,  ebayKey: "cgc10", label: "CGC 10"  },
      { grade: 9.5, ebayKey: "cgc95", label: "CGC 9.5" },
      { grade: 9,   ebayKey: "cgc9",  label: "CGC 9"   },
      { grade: 8,   ebayKey: "cgc8",  label: "CGC 8"   },
    ],
  },
};

const COMPANY_ORDER: CompanyId[] = ["PSA", "Beckett", "Ace", "TAG", "CGC"];

export default function CardProfitScreen() {
  const insets = useSafeAreaInsets();
  const webTop = Platform.OS === "web" ? 67 : 0;
  const webBot = Platform.OS === "web" ? 34 : 0;
  const { settings } = useSettings();

  const { cardName, setName, cardNumber, setTotal, imageUrl, rawPriceUSD, edition } = useLocalSearchParams<{
    cardId: string;
    cardName: string;
    setName: string;
    cardNumber?: string;
    setTotal?: string;
    imageUrl?: string;
    rawPriceUSD?: string;
    edition?: string;
  }>();

  const editionParam: "1st" | "unlimited" | null =
    edition === "1st" ? "1st" : edition === "unlimited" ? "unlimited" : null;

  // Format card number: "045" + setTotal → "045/143", otherwise just "045"
  const displayCardNumber = cardNumber
    ? (setTotal ? `${cardNumber}/${setTotal}` : cardNumber)
    : null;

  const [imageFullscreen, setImageFullscreen] = useState(false);

  // ── Pinch-to-zoom state for fullscreen viewer ───────────────────────────
  const zoomScale     = useSharedValue(1);
  const savedScale    = useSharedValue(1);
  const translateX    = useSharedValue(0);
  const translateY    = useSharedValue(0);
  const savedTx       = useSharedValue(0);
  const savedTy       = useSharedValue(0);

  // Reset zoom whenever the modal closes
  useEffect(() => {
    if (!imageFullscreen) {
      zoomScale.value  = withSpring(1);
      savedScale.value = 1;
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      savedTx.value    = 0;
      savedTy.value    = 0;
    }
  }, [imageFullscreen]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      zoomScale.value = Math.max(1, savedScale.value * e.scale);
    })
    .onEnd(() => {
      savedScale.value = zoomScale.value;
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = savedTx.value + e.translationX;
      translateY.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = translateX.value;
      savedTy.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      zoomScale.value  = withSpring(1);
      savedScale.value = 1;
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      savedTx.value    = 0;
      savedTy.value    = 0;
    });

  const zoomGesture = Gesture.Race(
    doubleTap,
    Gesture.Simultaneous(pinchGesture, panGesture),
  );

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: zoomScale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  // Derive hires URL for fullscreen (pokemontcg.io standard → _hires variant)
  const hiresImageUrl = imageUrl
    ? imageUrl.replace(/\.png$/i, "_hires.png")
    : imageUrl;

  const currency = settings.currency || "GBP";
  const { data: ratesData } = useQuery<ExchangeRateData>({
    queryKey: ["/api/exchange-rates"],
    staleTime: 22 * 60 * 60 * 1000,
  });
  const rates = ratesData?.rates || FALLBACK_RATES;
  const currencyDef = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0];
  const currencySymbol = currencyDef.symbol;
  // eBay and TCGPlayer prices come in USD; fees are stored in GBP
  const gbpRate = currency === "GBP" ? 1 : (rates["GBP"] ?? 0.79) / (rates["USD"] ?? 1);
  const currencyRate = currency === "USD" ? 1 : (rates[currency] ?? FALLBACK_RATES[currency] ?? 1) / (rates["USD"] ?? 1);
  const fmtLocal = (v: number) => currencySymbol === "¥" ? `${currencySymbol}${Math.round(v)}` : `${currencySymbol}${Math.round(v)}`;

  const rawUSD = rawPriceUSD ? parseFloat(rawPriceUSD) : 0;
  const rawLocalVal = rawUSD > 0 ? rawUSD * currencyRate : 0;
  const hasRawPrice = rawLocalVal > 0;

  const { data: ebay, isLoading, error } = useQuery<EbayAllGrades>({
    queryKey: ["ebay-all-grades", cardName, setName, editionParam],
    queryFn: () => {
      const editionQ = editionParam ? `&edition=${editionParam}` : "";
      return apiRequest(
        "GET",
        `/api/ebay-all-grades?name=${encodeURIComponent(cardName || "")}&setName=${encodeURIComponent(setName || "")}${editionQ}`
      ).then(r => r.json());
    },
    enabled: !!(cardName && setName),
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const enabledCompanies: CompanyId[] =
    settings.enabledCompanies.length > 0
      ? settings.enabledCompanies
      : COMPANY_ORDER;

  const companies = useMemo(() => {
    // fees are in GBP — convert to selected currency
    return COMPANY_ORDER.filter(id => enabledCompanies.includes(id)).map(compId => {
      const config = COMPANY_CONFIG[compId];
      if (!config) return null;
      const feeLocal = config.fee * (currencyRate / gbpRate);

      const rows = config.grades.map(g => {
        const ebayUSD = ebay ? (ebay[g.ebayKey] ?? 0) : 0;
        const ebayLocal = ebayUSD > 0 ? Math.round(ebayUSD * currencyRate) : null;
        const profit =
          ebayLocal !== null && hasRawPrice
            ? Math.round(ebayLocal - rawLocalVal - feeLocal)
            : null;
        return { ...g, ebayLocal, profit };
      });

      // Minimum grade = lowest grade number where profit >= 0 (breaks even or better).
      // Iterate from worst grade (highest index = lowest number) upward.
      const minProfitRow =
        [...rows].reverse().find(r => r.profit !== null && r.profit >= 0) ?? null;

      return { compId, config, rows, minProfitRow, feeLocal };
    }).filter((c): c is NonNullable<typeof c> => c !== null);
  }, [enabledCompanies, ebay, rawLocalVal, hasRawPrice, currencyRate, gbpRate]);

  return (
    <View style={[st.container, { paddingTop: insets.top + webTop }]}>
      {/* Navbar */}
      <View style={st.navBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [st.backBtn, { opacity: pressed ? 0.7 : 1 }]}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={st.navTitle} numberOfLines={1}>
          Profit Analysis
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Fullscreen image modal */}
      {!!imageUrl && (
        <Modal
          visible={imageFullscreen}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setImageFullscreen(false)}
        >
          <View style={{ flex: 1, backgroundColor: "#000" }}>
            {/* Pinch-to-zoom + pan area. Double-tap resets. */}
            <GestureDetector gesture={zoomGesture}>
              <Animated.View style={[{ flex: 1 }, zoomStyle]}>
                <Image
                  source={{ uri: hiresImageUrl || imageUrl }}
                  style={{ flex: 1 }}
                  contentFit="contain"
                  transition={200}
                />
              </Animated.View>
            </GestureDetector>
            {/* Close button */}
            <Pressable
              style={st.fullscreenClose}
              onPress={() => setImageFullscreen(false)}
              hitSlop={16}
            >
              <Ionicons name="close-circle" size={36} color="rgba(255,255,255,0.9)" />
            </Pressable>
            {/* Hint */}
            <View style={st.zoomHintBanner}>
              <Text style={st.zoomHintBannerTxt}>Pinch to zoom · Double-tap to reset</Text>
            </View>
          </View>
        </Modal>
      )}

      <ScrollView
        style={st.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + webBot + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Card hero — large centred image */}
        <View style={st.heroSection}>
          <Pressable
            onPress={() => imageUrl ? setImageFullscreen(true) : undefined}
            style={({ pressed }) => [st.heroImgWrap, { opacity: pressed && !!imageUrl ? 0.85 : 1 }]}
          >
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={st.heroImg}
                contentFit="contain"
              />
            ) : (
              <View style={[st.heroImg, st.heroImgPlaceholder]}>
                <Ionicons name="image-outline" size={48} color={Colors.textMuted} />
              </View>
            )}
            {!!imageUrl && (
              <View style={st.heroZoomHint}>
                <Ionicons name="expand-outline" size={12} color="rgba(255,255,255,0.7)" />
                <Text style={st.heroZoomHintTxt}>Tap to expand</Text>
              </View>
            )}
          </Pressable>

          {/* Card identity */}
          <Text style={st.heroName}>{cardName || "Unknown Card"}</Text>
          <Text style={st.heroSet}>{setName}</Text>
          {!!displayCardNumber && (
            <Text style={st.heroNumber}>#{displayCardNumber}</Text>
          )}
          {editionParam && (
            <View style={editionParam === "1st" ? st.editionBadge1st : st.editionBadgeUnlimited}>
              <Ionicons
                name={editionParam === "1st" ? "star" : "layers-outline"}
                size={11}
                color={editionParam === "1st" ? "#fff" : Colors.textSecondary}
              />
              <Text style={editionParam === "1st" ? st.editionBadge1stText : st.editionBadgeUnlimitedText}>
                {editionParam === "1st" ? "1st Edition" : "Unlimited"}
              </Text>
            </View>
          )}

          {/* Raw price pill */}
          <View style={st.heroPriceRow}>
            <Ionicons name="pricetag-outline" size={13} color={Colors.textMuted} />
            <Text style={st.heroPriceLabel}>Raw (TCGPlayer)</Text>
            <Text style={st.heroPriceValue}>
              {hasRawPrice ? fmtLocal(rawLocalVal) : "No price data"}
            </Text>
          </View>
          {!hasRawPrice && (
            <Text style={st.noRawNote}>Profit figures are unavailable without a raw price</Text>
          )}
        </View>

        {/* Price fetch status */}
        {isLoading && (
          <View style={st.feedbackRow}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={st.feedbackText}>Fetching last sold prices…</Text>
          </View>
        )}
        {!isLoading && !!error && (
          <View style={st.feedbackRow}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.error} />
            <Text style={[st.feedbackText, { color: Colors.error, flex: 1 }]}>
              Couldn't load sold prices — try again later
            </Text>
          </View>
        )}

        {/* Per-company grade tables */}
        {companies.map(({ compId, config, rows, minProfitRow, feeLocal }) => (
          <View key={compId} style={st.companyCard}>
            {/* Company header */}
            <View style={st.companyHeader}>
              <View style={[st.dot, { backgroundColor: config.dotColor }]} />
              <Text style={st.companyLabel}>{config.label}</Text>
              <Text style={st.companyFee}>~{fmtLocal(feeLocal)} fee</Text>
            </View>

            {/* Table column headers */}
            <View style={st.tblHead}>
              <Text style={[st.tblHeadTxt, { width: 76 }]}>Grade</Text>
              <Text style={[st.tblHeadTxt, { flex: 1, textAlign: "right" }]}>Last Sold</Text>
              <Text style={[st.tblHeadTxt, { flex: 1, textAlign: "right" }]}>Net Profit</Text>
              <View style={{ width: 58 }} />
            </View>

            {/* Grade rows */}
            {rows.map((gr, idx) => {
              const isMin = minProfitRow?.ebayKey === gr.ebayKey;
              const isProfit = gr.profit !== null && gr.profit >= 0;
              const isLast = idx === rows.length - 1;

              return (
                <View
                  key={gr.ebayKey}
                  style={[
                    st.tblRow,
                    isMin && st.tblRowGreen,
                    isLast && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={[st.accent, isMin && st.accentGreen]} />

                  <Text style={[st.gradeLabel, isMin && { color: "#22c55e" }]}>
                    {gr.label}{isMin ? " ★" : ""}
                  </Text>

                  {isLoading ? (
                    <ActivityIndicator
                      size="small"
                      color={Colors.textMuted}
                      style={{ flex: 1, transform: [{ scale: 0.6 }] }}
                    />
                  ) : (
                    <Text style={[st.ebayPrice, { flex: 1 }]}>
                      {gr.ebayLocal !== null ? fmtLocal(gr.ebayLocal) : "—"}
                    </Text>
                  )}

                  {isLoading ? (
                    <View style={{ flex: 1 }} />
                  ) : hasRawPrice && gr.profit !== null ? (
                    <Text
                      style={[
                        st.profitVal,
                        { flex: 1, color: isProfit ? "#22c55e" : "#ef4444" },
                      ]}
                    >
                      {isProfit ? "+" : "-"}{fmtLocal(Math.abs(gr.profit))}
                    </Text>
                  ) : (
                    <Text style={[st.mutedTxt, { flex: 1, textAlign: "right" }]}>—</Text>
                  )}

                  {!isLoading && gr.ebayLocal !== null && hasRawPrice && gr.profit !== null ? (
                    <View
                      style={[
                        st.badge,
                        {
                          width: 58,
                          backgroundColor: isProfit
                            ? "rgba(34,197,94,0.15)"
                            : "rgba(239,68,68,0.12)",
                        },
                      ]}
                    >
                      <Text style={[st.badgeTxt, { color: isProfit ? "#22c55e" : "#ef4444" }]}>
                        {isProfit ? "Profit" : "Loss"}
                      </Text>
                    </View>
                  ) : (
                    <View style={{ width: 58 }} />
                  )}
                </View>
              );
            })}

            {/* Company summary */}
            {!isLoading && ebay && hasRawPrice && (
              <View style={st.summaryRow}>
                {minProfitRow ? (
                  <Text style={st.summaryTxt}>
                    Min grade to profit:{" "}
                    <Text style={{ color: "#22c55e", fontFamily: "Inter_700Bold" }}>
                      {minProfitRow.label}
                    </Text>
                  </Text>
                ) : (
                  <Text style={[st.summaryTxt, { color: "#ef4444" }]}>
                    No profitable grade at this raw price
                  </Text>
                )}
              </View>
            )}
          </View>
        ))}

        {/* Grade this card CTA */}
        <Pressable
          style={({ pressed }) => [st.gradeCta, { opacity: pressed ? 0.85 : 1 }]}
          onPress={() => router.push("/(tabs)/grade")}
        >
          <Ionicons name="scan-outline" size={18} color="#fff" />
          <Text style={st.gradeCtaTxt}>Grade This Card</Text>
        </Pressable>

        {/* Stale data warning */}
        {!isLoading && ebay?.isStale && ebay.fetchedAt && (
          <View style={[st.feedbackRow, { backgroundColor: "rgba(245,158,11,0.08)", borderRadius: 8, marginTop: 4 }]}>
            <Ionicons name="time-outline" size={14} color="#f59e0b" />
            <Text style={[st.feedbackText, { color: "#f59e0b", flex: 1 }]}>
              Showing archived prices from {Math.round((Date.now() - ebay.fetchedAt) / 86400000)} day{Math.round((Date.now() - ebay.fetchedAt) / 86400000) !== 1 ? "s" : ""} ago — live data temporarily unavailable
            </Text>
          </View>
        )}

        {/* Disclaimer */}
        <View style={st.disclaimer}>
          <Ionicons name="information-circle-outline" size={12} color={Colors.textMuted} />
          <Text style={st.disclaimerTxt}>
            Last sold prices sourced from eBay · All prices in {currency}
            {ratesData?.updatedAt ? ` · Rates: ${ratesData.updatedAt}` : ""}
            {!isLoading && ebay?.fetchedAt && !ebay.isStale ? ` · Updated ${Math.round((Date.now() - ebay.fetchedAt) / 3600000)}h ago` : ""}
            {" · "}Grading fees are estimates and may vary
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  navTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    flex: 1,
    textAlign: "center",
  },

  scroll: { flex: 1 },

  // ── Hero card section ────────────────────────────────────────────────────
  heroSection: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 20,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  heroImgWrap: {
    alignItems: "center",
    marginBottom: 16,
  },
  heroImg: {
    width: 180,
    height: 252,           // 180 × 1.4 — Pokémon card aspect ratio
    borderRadius: 10,
    backgroundColor: Colors.background,
  },
  heroImgPlaceholder: { alignItems: "center", justifyContent: "center" },
  heroZoomHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  heroZoomHintTxt: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
  },
  heroName: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.text,
    textAlign: "center",
    lineHeight: 26,
    marginBottom: 4,
  },
  heroSet: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 2,
  },
  heroNumber: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    marginBottom: 8,
  },
  editionBadge1st: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "center",
    backgroundColor: "#7c3aed",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  editionBadge1stText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: "#fff",
    letterSpacing: 0.3,
  },
  editionBadgeUnlimited: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "center",
    backgroundColor: Colors.surface,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  editionBadgeUnlimitedText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },
  heroPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 4,
  },
  heroPriceLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    flex: 1,
  },
  heroPriceValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  noRawNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 15,
  },
  // ── Fullscreen modal ─────────────────────────────────────────────────────
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenClose: {
    position: "absolute",
    top: 56,
    right: 20,
    zIndex: 10,
  },
  zoomHintBanner: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  zoomHintBannerTxt: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.45)",
  },

  feedbackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  feedbackText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },

  companyCard: {
    marginTop: 12,
    marginHorizontal: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: "hidden",
  },
  companyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  companyLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  companyFee: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },

  tblHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    gap: 4,
  },
  tblHeadTxt: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  tblRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    gap: 4,
  },
  tblRowGreen: { backgroundColor: "rgba(34,197,94,0.05)" },

  accent: { width: 3, alignSelf: "stretch", backgroundColor: "transparent", borderRadius: 2, marginRight: 11 },
  accentGreen: { backgroundColor: "#22c55e" },

  gradeLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
    width: 71,
  },
  ebayPrice: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "right",
  },
  profitVal: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    textAlign: "right",
  },
  mutedTxt: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
    alignItems: "center",
  },
  badgeTxt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },

  summaryRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  summaryTxt: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },

  gradeCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    marginHorizontal: 12,
    marginTop: 20,
  },
  gradeCtaTxt: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#fff",
  },

  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    paddingHorizontal: 16,
    marginTop: 14,
  },
  disclaimerTxt: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    flex: 1,
    lineHeight: 16,
  },
});
