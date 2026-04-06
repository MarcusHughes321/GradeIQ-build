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
  Linking,
  Dimensions,
} from "react-native";
import Svg, { Polyline, Line, Circle, Text as SvgText } from "react-native-svg";
import { Image } from "expo-image";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useSettings } from "@/lib/settings-context";
import { CURRENCIES } from "@/lib/settings";
import CompanyLabel from "@/components/CompanyLabel";
import { apiRequest } from "@/lib/query-client";
import type { CompanyId } from "@/lib/settings";

const FALLBACK_RATES: Record<string, number> = { USD: 1, GBP: 0.79, EUR: 0.92, AUD: 1.55, CAD: 1.38, JPY: 150 };
interface ExchangeRateData { rates: Record<string, number>; updatedAt: string; }

interface GradeDetail {
  avg7d?: number | null;
  avg30d?: number | null;
  avg1d?: number | null;
  low?: number | null;
  high?: number | null;
  saleCount?: number | null;
  lastUpdated?: string | null;
}

interface EbayAllGrades {
  psa10: number; psa9: number; psa8: number; psa7: number;
  bgs10: number; bgs95: number; bgs9: number; bgs85: number; bgs8: number;
  ace10: number; ace9: number; ace8: number;
  tag10: number; tag9: number; tag8: number;
  cgc10: number; cgc95: number; cgc9: number; cgc8: number;
  raw: number;
  gradeDetails?: Record<string, GradeDetail>;
  fetchedAt?: number;
  isStale?: boolean;
}

interface GradeEntry {
  grade: number;
  ebayKey: keyof EbayAllGrades;
  label: string;
}

const COMPANY_CONFIG: Record<string, {
  label: string;
  dotColor: string;
  grades: GradeEntry[];
}> = {
  PSA: {
    label: "PSA", dotColor: "#1E56A0",
    grades: [
      { grade: 10, ebayKey: "psa10", label: "PSA 10" },
      { grade: 9,  ebayKey: "psa9",  label: "PSA 9"  },
      { grade: 8,  ebayKey: "psa8",  label: "PSA 8"  },
      { grade: 7,  ebayKey: "psa7",  label: "PSA 7"  },
    ],
  },
  Beckett: {
    label: "BGS", dotColor: "#C0C0C0",
    grades: [
      { grade: 10,  ebayKey: "bgs10", label: "BGS 10"  },
      { grade: 9.5, ebayKey: "bgs95", label: "BGS 9.5" },
      { grade: 9,   ebayKey: "bgs9",  label: "BGS 9"   },
      { grade: 8.5, ebayKey: "bgs85", label: "BGS 8.5" },
      { grade: 8,   ebayKey: "bgs8",  label: "BGS 8"   },
    ],
  },
  Ace: {
    label: "ACE", dotColor: "#FFD700",
    grades: [
      { grade: 10, ebayKey: "ace10", label: "ACE 10" },
      { grade: 9,  ebayKey: "ace9",  label: "ACE 9"  },
      { grade: 8,  ebayKey: "ace8",  label: "ACE 8"  },
    ],
  },
  TAG: {
    label: "TAG", dotColor: "#9CA3AF",
    grades: [
      { grade: 10, ebayKey: "tag10", label: "TAG 10" },
      { grade: 9,  ebayKey: "tag9",  label: "TAG 9"  },
      { grade: 8,  ebayKey: "tag8",  label: "TAG 8"  },
    ],
  },
  CGC: {
    label: "CGC", dotColor: "#E63946",
    grades: [
      { grade: 10,  ebayKey: "cgc10", label: "CGC 10"  },
      { grade: 9.5, ebayKey: "cgc95", label: "CGC 9.5" },
      { grade: 9,   ebayKey: "cgc9",  label: "CGC 9"   },
      { grade: 8,   ebayKey: "cgc8",  label: "CGC 8"   },
    ],
  },
};

const COMPANY_ORDER: CompanyId[] = ["PSA", "Beckett", "Ace", "TAG", "CGC"];

// Top-grade eBay key per company — used for market snapshot
const COMPANY_TOP_KEY: Record<string, keyof EbayAllGrades> = {
  PSA: "psa10", Beckett: "bgs10", Ace: "ace10", TAG: "tag10", CGC: "cgc10",
};

// Liquidity score 0–100 for a single grade's detail data.
// Weights: sale velocity 50% | price stability 30% | data freshness 20%
function calcLiquidityScore(detail: GradeDetail | undefined): number {
  if (!detail || !detail.saleCount) return 0;
  // Signal 1 — sale velocity (0–50 pts): 20+ sales = full score
  const velocity = Math.min(detail.saleCount / 20, 1) * 50;
  // Signal 2 — price stability (0–30 pts): how close avg7d is to avg30d
  let stability = 15;
  if (detail.avg7d != null && detail.avg30d != null && detail.avg30d > 0) {
    const drift = Math.abs(detail.avg7d - detail.avg30d) / detail.avg30d;
    stability = Math.max(0, 1 - Math.min(drift * 2, 1)) * 30;
  }
  // Signal 3 — data freshness (0–20 pts): decays linearly over 90 days
  let freshness = 10;
  if (detail.lastUpdated) {
    const days = (Date.now() - new Date(detail.lastUpdated).getTime()) / 86_400_000;
    freshness = Math.max(0, 1 - days / 90) * 20;
  }
  return Math.round(velocity + stability + freshness);
}

// saleCount gates stop low-volume cards from reaching High/Medium
// just because their avg7d happens to equal avg30d (stable but illiquid)
function liquidityBand(score: number, saleCount = 0): { label: string; color: string } {
  if (score === 0) return { label: "No data", color: "#6b7280" };
  if (score >= 60 && saleCount >= 20) return { label: "High",   color: "#22c55e" };
  if (score >= 35 && saleCount >= 8)  return { label: "Medium", color: "#f59e0b" };
  if (score > 0)                      return { label: "Low",    color: "#ef4444" };
  return                              { label: "No data", color: "#6b7280" };
}

// ── Animated liquidity bar ──────────────────────────────────────────────────
// High   (≥60): shimmer sweep — a bright gloss slides across the fill
// Medium (≥35): gentle opacity breathing pulse
// Low    (< 35): static
function LiquidityBar({ score, color }: { score: number; color: string }) {
  const shimmerX       = useSharedValue(-150);
  const overlayOpacity = useSharedValue(0);

  useEffect(() => {
    shimmerX.value       = -150;
    overlayOpacity.value = 0;
    if (score >= 60) {
      shimmerX.value = withRepeat(
        withTiming(400, { duration: 1800, easing: Easing.linear }),
        -1, false,
      );
    } else if (score >= 35) {
      overlayOpacity.value = withRepeat(
        withSequence(
          withTiming(0.45, { duration: 900 }),
          withTiming(0,    { duration: 900 }),
        ),
        -1, false,
      );
    }
  }, [score]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const fillPct = `${Math.max(Math.min(score, 100), score > 0 ? 6 : 0)}%`;

  return (
    <View style={lbStyles.track}>
      <View style={[lbStyles.fill, { width: fillPct as any, backgroundColor: color }]}>
        {score >= 60 && (
          <Animated.View style={[lbStyles.shimmer, shimmerStyle]} />
        )}
        {score >= 35 && score < 60 && (
          <Animated.View style={[StyleSheet.absoluteFill, lbStyles.pulseOverlay, pulseStyle]} />
        )}
      </View>
    </View>
  );
}
const lbStyles = StyleSheet.create({
  track:        { height: 10, backgroundColor: Colors.border, borderRadius: 6, overflow: "hidden" },
  fill:         { height: "100%", borderRadius: 6, overflow: "hidden", position: "relative" },
  shimmer:      { position: "absolute", top: 0, bottom: 0, width: 60, backgroundColor: "rgba(255,255,255,0.35)", transform: [{ skewX: "-20deg" }] },
  pulseOverlay: { backgroundColor: "rgba(255,255,255,0.28)", borderRadius: 6 },
});

interface PricePoint { price_usd: number; recorded_at: string; }

// ── Trend chart ────────────────────────────────────────────────────────────
// Uses real time-series history when ≥3 snapshots exist, otherwise falls
// back to rolling avg points (avg30d → avg7d → avg1d) from gradeDetails.
function TrendChart({
  detail,
  history,
  currencySymbol,
  currencyRate,
}: {
  detail: GradeDetail | undefined;
  history: PricePoint[];
  currencySymbol: string;
  currencyRate: number;
}) {
  // LABEL_W: dedicated column for price labels — kept fully outside the SVG
  const LABEL_W = 38;
  const svgW = Dimensions.get("window").width - 48 - LABEL_W;
  const H = 90;
  const PAD = { top: 12, bottom: 28, left: 6, right: 6 };
  const chartW = svgW - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const fmt = (v: number) => {
    const local = v * currencyRate;
    if (currencySymbol === "¥") return `${currencySymbol}${Math.round(local)}`;
    if (local >= 1000) return `${currencySymbol}${(local / 1000).toFixed(1)}k`;
    return `${currencySymbol}${local.toFixed(0)}`;
  };

  // Shared price-label column — sits to the left of the SVG, no overlap possible
  const PriceAxis = ({ high, low }: { high: string; low: string }) => (
    <View style={{
      width: LABEL_W,
      height: H,
      justifyContent: "space-between",
      alignItems: "flex-end",
      paddingTop: PAD.top - 2,
      paddingBottom: PAD.bottom - 4,
    }}>
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted }}>{high}</Text>
      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.textMuted }}>{low}</Text>
    </View>
  );

  // ── Real time-series path ──────────────────────────────────────────────
  if (history.length >= 3) {
    const vals = history.map(p => p.price_usd);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const range = maxV - minV || 1;

    const toX = (i: number) => PAD.left + (i / (history.length - 1)) * chartW;
    const toY = (v: number) => PAD.top + (1 - (v - minV) / range) * chartH;

    const points = history.map((p, i) => ({ x: toX(i), y: toY(p.price_usd), price: p.price_usd, ts: p.recorded_at }));
    const polylineStr = points.map(p => `${p.x},${p.y}`).join(" ");
    const trendUp = points[points.length - 1].price >= points[0].price;
    const lineColor = trendUp ? "#22c55e" : "#ef4444";

    const fmtDate = (iso: string) => {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    };

    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textMuted, marginBottom: 4 }}>
          Price history · {history.length} snapshots
        </Text>
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <Svg width={svgW} height={H}>
            <Line x1={PAD.left} y1={PAD.top + chartH / 2} x2={PAD.left + chartW} y2={PAD.top + chartH / 2}
              stroke={Colors.surfaceBorder} strokeWidth="1" strokeDasharray="4,4" />
            <Polyline points={polylineStr} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" />
            {points.map((p, i) => (
              <Circle key={i} cx={p.x} cy={p.y} r={2.5} fill={lineColor} />
            ))}
            <SvgText x={PAD.left} y={H - 4} fontSize="9" fill={Colors.textMuted}
              textAnchor="start" fontFamily="Inter_400Regular">{fmtDate(points[0].ts)}</SvgText>
            <SvgText x={PAD.left + chartW} y={H - 4} fontSize="9" fill={Colors.textMuted}
              textAnchor="end" fontFamily="Inter_400Regular">{fmtDate(points[points.length - 1].ts)}</SvgText>
          </Svg>
          <PriceAxis high={fmt(maxV)} low={fmt(minV)} />
        </View>
        {detail?.saleCount != null && (
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "center", marginTop: 2 }}>
            {detail.saleCount.toLocaleString()} recorded sales
            {detail?.lastUpdated ? ` · Updated ${new Date(detail.lastUpdated).toLocaleDateString()}` : ""}
          </Text>
        )}
      </View>
    );
  }

  // ── Fallback: rolling avg sparkline (avg30d → avg7d → avg1d) ─────────
  if (!detail) return null;
  const rawPoints = [
    { label: "30d", value: detail.avg30d },
    { label: "7d",  value: detail.avg7d  },
    { label: "1d",  value: detail.avg1d  },
  ].filter((p): p is { label: string; value: number } => typeof p.value === "number" && p.value > 0);

  if (rawPoints.length < 2) {
    return (
      <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "center" }}>
          Not enough recent sales for a trend
        </Text>
      </View>
    );
  }

  const vals2 = rawPoints.map(p => p.value);
  const minV2 = Math.min(...vals2);
  const maxV2 = Math.max(...vals2);
  const range2 = maxV2 - minV2 || 1;

  const toX2 = (i: number) => PAD.left + (i / (rawPoints.length - 1)) * chartW;
  const toY2 = (v: number) => PAD.top + (1 - (v - minV2) / range2) * chartH;

  const points2 = rawPoints.map((p, i) => ({ x: toX2(i), y: toY2(p.value), ...p }));
  const polylineStr2 = points2.map(p => `${p.x},${p.y}`).join(" ");
  const trendUp2 = points2[points2.length - 1].value >= points2[0].value;

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textMuted, marginBottom: 4 }}>
        Rolling average trend · building history…
      </Text>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <Svg width={svgW} height={H}>
          <Line x1={PAD.left} y1={PAD.top + chartH / 2} x2={PAD.left + chartW} y2={PAD.top + chartH / 2}
            stroke={Colors.surfaceBorder} strokeWidth="1" strokeDasharray="4,4" />
          <Polyline points={polylineStr2} fill="none"
            stroke={trendUp2 ? "#22c55e" : "#ef4444"} strokeWidth="2" strokeLinejoin="round" />
          {points2.map((p, i) => (
            <React.Fragment key={i}>
              <Circle cx={p.x} cy={p.y} r={3} fill={trendUp2 ? "#22c55e" : "#ef4444"} />
              <SvgText x={p.x} y={H - 4} fontSize="9" fill={Colors.textMuted} textAnchor="middle"
                fontFamily="Inter_400Regular">{p.label}</SvgText>
            </React.Fragment>
          ))}
        </Svg>
        <PriceAxis high={fmt(maxV2)} low={fmt(minV2)} />
      </View>
      {detail.saleCount != null && (
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "center", marginTop: 2 }}>
          {detail.saleCount.toLocaleString()} recorded sales
          {detail.lastUpdated ? ` · Updated ${new Date(detail.lastUpdated).toLocaleDateString()}` : ""}
        </Text>
      )}
    </View>
  );
}

export default function CardProfitScreen() {
  const insets = useSafeAreaInsets();
  const webTop = Platform.OS === "web" ? 67 : 0;
  const webBot = Platform.OS === "web" ? 34 : 0;
  const { settings } = useSettings();

  const { cardName, setName, cardNumber, setTotal, imageUrl, rawPriceUSD, edition, holoPrice, reverseHoloPrice, normalPrice } = useLocalSearchParams<{
    cardId: string;
    cardName: string;
    setName: string;
    cardNumber?: string;
    setTotal?: string;
    imageUrl?: string;
    rawPriceUSD?: string;
    edition?: string;
    holoPrice?: string;
    reverseHoloPrice?: string;
    normalPrice?: string;
  }>();

  const editionParam: "1st" | "unlimited" | null =
    edition === "1st" ? "1st" : edition === "unlimited" ? "unlimited" : null;

  type Variant = "holo" | "reverseHolo" | "normal";
  const variantPrices: { key: Variant; label: string; price: number }[] = [
    ...(holoPrice && parseFloat(holoPrice) > 0 ? [{ key: "holo" as Variant, label: "Holo", price: parseFloat(holoPrice) }] : []),
    ...(reverseHoloPrice && parseFloat(reverseHoloPrice) > 0 ? [{ key: "reverseHolo" as Variant, label: "Rev Holo", price: parseFloat(reverseHoloPrice) }] : []),
    ...(normalPrice && parseFloat(normalPrice) > 0 ? [{ key: "normal" as Variant, label: "Normal", price: parseFloat(normalPrice) }] : []),
  ];
  const hasVariantTabs = variantPrices.length > 1;
  const defaultVariant: Variant | null = variantPrices.length > 0 ? variantPrices[0].key : null;
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(defaultVariant);

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
  const currencyRate = currency === "USD" ? 1 : (rates[currency] ?? FALLBACK_RATES[currency] ?? 1) / (rates["USD"] ?? 1);
  const fmtLocal = (v: number) => currencySymbol === "¥" ? `${currencySymbol}${Math.round(v)}` : `${currencySymbol}${v.toFixed(2)}`;
  const profitDisplay = settings.profitDisplay ?? "value";
  const fmtProfit = (profitAbs: number, rawVal: number): string => {
    const pct = rawVal > 0 ? `${Math.round((profitAbs / rawVal) * 100)}%` : null;
    if (profitDisplay === "percentage" && pct) return pct;
    if (profitDisplay === "both" && pct) return `${fmtLocal(profitAbs)} (${pct})`;
    return fmtLocal(profitAbs);
  };

  const baseRawUSD = rawPriceUSD ? parseFloat(rawPriceUSD) : 0;
  const selectedVariantPrice = selectedVariant
    ? (variantPrices.find(v => v.key === selectedVariant)?.price ?? null)
    : null;
  const rawUSD = (hasVariantTabs && selectedVariantPrice != null) ? selectedVariantPrice : baseRawUSD;
  const rawLocalVal = rawUSD > 0 ? rawUSD * currencyRate : 0;
  const hasRawPrice = rawLocalVal > 0;

  const { data: ebay, isLoading, error } = useQuery<EbayAllGrades>({
    queryKey: ["ebay-all-grades", cardName, setName, cardNumber ?? "", editionParam],
    queryFn: () => {
      const editionQ = editionParam ? `&edition=${editionParam}` : "";
      const numberQ  = cardNumber  ? `&cardNumber=${encodeURIComponent(cardNumber)}` : "";
      return apiRequest(
        "GET",
        `/api/ebay-all-grades?name=${encodeURIComponent(cardName || "")}&setName=${encodeURIComponent(setName || "")}${numberQ}${editionQ}`
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

  const defaultCompany: CompanyId = enabledCompanies[0] ?? "PSA";
  const [selectedCompany, setSelectedCompany] = useState<CompanyId>(defaultCompany);

  // Which grade row the user has tapped to chart (undefined = top grade default)
  const [chartGradeKey, setChartGradeKey] = useState<string | undefined>(undefined);

  // Reset to top grade whenever the company tab switches
  useEffect(() => { setChartGradeKey(undefined); }, [selectedCompany]);

  // Cache key mirrors server logic: "CardName BaseNum [1st]"
  const historyCacheKey = useMemo(() => {
    const baseNum = cardNumber ? cardNumber.split("/")[0].trim() : "";
    const editionTag = editionParam === "1st" ? "1st" : "";
    return [cardName, baseNum, editionTag].filter(Boolean).join(" ");
  }, [cardName, cardNumber, editionParam]);

  // Top grade key for the selected company (e.g. "psa10", "bgs95")
  const topGradeKey = COMPANY_CONFIG[selectedCompany]?.grades[0]?.ebayKey as string | undefined;

  // The chart always shows the tapped grade; falls back to top grade
  const effectiveChartKey = chartGradeKey ?? topGradeKey;

  const { data: historyData } = useQuery<{ history: PricePoint[] }>({
    queryKey: ["price-history", historyCacheKey, effectiveChartKey],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/price-history?cacheKey=${encodeURIComponent(historyCacheKey)}&grade=${encodeURIComponent(effectiveChartKey ?? "")}`
      ).then(r => r.json()),
    enabled: !!(historyCacheKey && effectiveChartKey),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  const buildEbayUrl = (gradeLabel: string) => {
    const q = [gradeLabel, cardName, displayCardNumber ? `${displayCardNumber}` : null, setName, "pokemon"].filter(Boolean).join(" ");
    return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Complete=1&LH_Sold=1`;
  };

  const companies = useMemo(() => {
    return COMPANY_ORDER.filter(id => enabledCompanies.includes(id)).map(compId => {
      const config = COMPANY_CONFIG[compId];
      if (!config) return null;

      const rows = config.grades.map(g => {
        const ebayUSD = ebay ? (ebay[g.ebayKey] ?? 0) : 0;
        const ebayLocal = ebayUSD > 0 ? Math.round(ebayUSD * currencyRate) : null;
        const profit =
          ebayLocal !== null && hasRawPrice
            ? Math.round(ebayLocal - rawLocalVal)
            : null;
        return { ...g, ebayLocal, profit };
      });

      const minProfitRow =
        [...rows].reverse().find(r => r.profit !== null && r.profit >= 0) ?? null;

      return { compId, config, rows, minProfitRow };
    }).filter((c): c is NonNullable<typeof c> => c !== null);
  }, [enabledCompanies, ebay, rawLocalVal, hasRawPrice, currencyRate]);

  // ── Market snapshot — liquidity across all enabled companies ────────────
  const marketSnapshot = useMemo(() => {
    if (!ebay?.gradeDetails) return null;

    const rows = COMPANY_ORDER
      .filter(id => enabledCompanies.includes(id))
      .map(compId => {
        const topKey = COMPANY_TOP_KEY[compId];
        const detail = topKey ? ebay.gradeDetails?.[topKey as string] : undefined;
        const score = calcLiquidityScore(detail);
        return {
          compId,
          label: COMPANY_CONFIG[compId]?.label ?? compId,
          color: COMPANY_CONFIG[compId]?.dotColor ?? "#6b7280",
          score,
          saleCount: detail?.saleCount ?? 0,
        };
      });

    const anyData = rows.some(r => r.score > 0);
    if (!anyData) return null;

    const totalSales  = rows.reduce((s, r) => s + r.saleCount, 0);
    const best        = rows.reduce((a, b) => b.score > a.score ? b : a, rows[0]);
    const maxScore    = Math.max(...rows.map(r => r.score), 1);
    const overallScore = Math.max(...rows.map(r => r.score), 0);
    const overallBand  = liquidityBand(overallScore, best.saleCount);

    return { rows, totalSales, best, maxScore, overallScore, overallBand };
  }, [ebay, enabledCompanies]);

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

          {/* Variant tabs */}
          {hasVariantTabs && (
            <View style={st.variantTabRow}>
              {variantPrices.map(v => {
                const isSelected = selectedVariant === v.key;
                const isHolo = v.key === "holo";
                const isRH = v.key === "reverseHolo";
                return (
                  <Pressable
                    key={v.key}
                    onPress={() => setSelectedVariant(v.key)}
                    style={[
                      st.variantTab,
                      isSelected && isHolo && st.variantTabHoloActive,
                      isSelected && isRH && st.variantTabRHActive,
                      isSelected && !isHolo && !isRH && st.variantTabNormalActive,
                    ]}
                  >
                    {isHolo && (
                      <Ionicons
                        name="sparkles"
                        size={11}
                        color={isSelected ? "#92400e" : Colors.textMuted}
                      />
                    )}
                    {isRH && (
                      <Ionicons
                        name="color-wand-outline"
                        size={11}
                        color={isSelected ? "#c4b5fd" : Colors.textMuted}
                      />
                    )}
                    <Text style={[
                      st.variantTabText,
                      isSelected && isHolo && st.variantTabTextHolo,
                      isSelected && isRH && st.variantTabTextRH,
                      isSelected && !isHolo && !isRH && st.variantTabTextNormal,
                    ]}>
                      {v.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Raw price pill */}
          <View style={st.heroPriceRow}>
            <Ionicons name="pricetag-outline" size={13} color={Colors.textMuted} />
            <Text style={st.heroPriceLabel}>Raw (TCGPlayer)</Text>
            <Text style={st.heroPriceValue}>
              {hasRawPrice ? fmtLocal(rawLocalVal) : "No price data"}
            </Text>
            <Pressable
              onPress={() => {
                const q = [cardName, displayCardNumber || null, setName, "Pokemon"].filter(Boolean).join(" ");
                Linking.openURL(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`);
              }}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, flexDirection: "row", alignItems: "center", gap: 3, marginLeft: 8 })}
            >
              <Text style={st.rawEbayLink}>Find on eBay</Text>
              <Ionicons name="open-outline" size={10} color={Colors.textMuted} />
            </Pressable>
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

        {/* ── Market Snapshot ─────────────────────────────────────── */}
        {!isLoading && !error && !!marketSnapshot && (() => {
          // Drive bar from the currently selected company pill
          const activeRow = marketSnapshot.rows.find(r => r.compId === selectedCompany)
            ?? marketSnapshot.best;
          const activeBand = liquidityBand(activeRow.score, activeRow.saleCount);
          return (
            <View style={st.snapshotCard}>
              {/* Top row: label + band chip */}
              <View style={st.snapshotTopRow}>
                <Text style={st.snapshotLabel}>Liquidity</Text>
                <View style={[
                  st.snapshotBandChip,
                  { backgroundColor: activeBand.color + "1A", borderColor: activeBand.color + "55" },
                ]}>
                  <View style={[st.snapshotBandDot, { backgroundColor: activeBand.color }]} />
                  <Text style={[st.snapshotBandText, { color: activeBand.color }]}>
                    {activeBand.label}
                  </Text>
                </View>
              </View>

              {/* Animated liquid bar — reflects selected company */}
              <LiquidityBar score={activeRow.score} color={activeBand.color} />

              {/* Per-company sales count pills — selected company highlighted */}
              <View style={st.snapshotSalesPills}>
                {marketSnapshot.rows
                  .filter(r => r.saleCount > 0)
                  .map(r => {
                    const isActive = r.compId === selectedCompany;
                    return (
                      <View key={r.compId} style={[
                        st.snapshotSalesPill,
                        isActive && { borderColor: r.color + "99", backgroundColor: r.color + "1A" },
                      ]}>
                        <Text style={[st.snapshotSalesCo, { color: r.color }]}>{r.label}</Text>
                        <Text style={[st.snapshotSalesCt, isActive && { color: Colors.text }]}>
                          {r.saleCount}
                        </Text>
                      </View>
                    );
                  })
                }
              </View>

              {/* Footer */}
              <Text style={st.snapshotFooter}>
                {activeRow.saleCount > 0
                  ? `${activeRow.saleCount} ${activeRow.label} sales in the last month`
                  : `No recent ${activeRow.label} sales · most liquid: `}
                {activeRow.saleCount === 0 && (
                  <Text style={{ color: marketSnapshot.best.color, fontFamily: "Inter_600SemiBold" }}>
                    {marketSnapshot.best.label}
                  </Text>
                )}
              </Text>
            </View>
          );
        })()}

        {/* Company pill tabs */}
        {companies.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.companyPillRow}
          >
            {companies.map(({ compId, config }) => {
              const isActive = selectedCompany === compId;
              return (
                <Pressable
                  key={compId}
                  onPress={() => setSelectedCompany(compId)}
                  style={[st.companyPill, isActive && { borderColor: config.dotColor, backgroundColor: config.dotColor + "22" }]}
                >
                  <View style={[st.companyPillDot, { backgroundColor: config.dotColor }]} />
                  <Text style={[st.companyPillLabel, isActive && { color: Colors.text }]}>
                    {config.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Expanded company section */}
        {companies.filter(c => c.compId === selectedCompany).map(({ compId, config, rows, minProfitRow }) => {
          // Use the tapped grade's detail for the chart (falls back to top grade)
          const chartDetail = effectiveChartKey ? ebay?.gradeDetails?.[effectiveChartKey] : undefined;

          return (
            <View key={compId} style={st.companyCard}>
              {/* Column headers */}
              <View style={st.tblHead}>
                <Text style={[st.tblHeadTxt, { flex: 2 }]}>Grade</Text>
                <Text style={[st.tblHeadTxt, { flex: 2, textAlign: "right" }]}>eBay Sold</Text>
                <Text style={[st.tblHeadTxt, { flex: 2, textAlign: "right" }]}>Profit</Text>
                <View style={{ width: 48 }} />
              </View>

              {/* Grade rows */}
              {rows.map((gr, idx) => {
                const isMin = minProfitRow?.ebayKey === gr.ebayKey;
                const isProfit = gr.profit !== null && gr.profit >= 0;
                const isLast = idx === rows.length - 1;
                const detail = ebay?.gradeDetails?.[gr.ebayKey as string];
                const isCharted = gr.ebayKey === effectiveChartKey;

                return (
                  <Pressable
                    key={gr.ebayKey}
                    onPress={() => setChartGradeKey(gr.ebayKey)}
                  >
                    <View style={[
                      st.tblRow,
                      isMin && st.tblRowGreen,
                      isCharted && st.tblRowCharted,
                      isLast && { borderBottomWidth: 0 },
                    ]}>
                      <View style={[st.accent, isMin && st.accentGreen, isCharted && !isMin && st.accentCharted]} />

                      <View style={{ flex: 2 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                          <Text style={[st.gradeLabel, isMin && { color: "#f59e0b" }]}>
                            {gr.label}{isMin ? " ★" : ""}
                          </Text>
                          {isCharted && (
                            <Ionicons name="stats-chart" size={10} color={Colors.primary} />
                          )}
                        </View>
                        {detail?.saleCount != null && (
                          <Text style={st.saleCountTxt}>{detail.saleCount} sales last month</Text>
                        )}
                      </View>

                      {isLoading ? (
                        <ActivityIndicator size="small" color={Colors.textMuted} style={{ flex: 2 }} />
                      ) : (
                        <Text style={[st.ebayPrice, { flex: 2 }]}>
                          {gr.ebayLocal !== null ? fmtLocal(gr.ebayLocal) : "—"}
                        </Text>
                      )}

                      {isLoading ? (
                        <View style={{ flex: 2 }} />
                      ) : hasRawPrice && gr.profit !== null ? (
                        <Text style={[st.profitVal, { flex: 2, color: isProfit ? "#22c55e" : "#ef4444" }]}>
                          {isProfit ? "+" : "-"}{fmtProfit(Math.abs(gr.profit), rawLocalVal)}
                        </Text>
                      ) : (
                        <Text style={[st.mutedTxt, { flex: 2, textAlign: "right" }]}>—</Text>
                      )}

                      {/* eBay sold link */}
                      <Pressable
                        onPress={() => Linking.openURL(buildEbayUrl(gr.label))}
                        hitSlop={8}
                        style={({ pressed }) => [st.ebayLinkBtn, { opacity: pressed ? 0.5 : 1 }]}
                      >
                        <Text style={st.ebayLinkTxt}>eBay</Text>
                        <Ionicons name="open-outline" size={10} color={Colors.textMuted} />
                      </Pressable>
                    </View>

                  </Pressable>
                );
              })}

              {/* Trend chart — updates to whichever grade row was tapped */}
              {!isLoading && (chartDetail || (historyData?.history?.length ?? 0) >= 3) && (
                <View style={st.chartContainer}>
                  <TrendChart
                    detail={chartDetail}
                    history={historyData?.history ?? []}
                    currencySymbol={currencySymbol}
                    currencyRate={currencyRate}
                  />
                </View>
              )}

              {/* Company summary */}
              {!isLoading && ebay && hasRawPrice && (
                <View style={st.summaryRow}>
                  {minProfitRow ? (
                    <Text style={st.summaryTxt}>
                      Min grade to profit:{" "}
                      <Text style={{ color: "#f59e0b", fontFamily: "Inter_700Bold" }}>
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
          );
        })}

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
  variantTabRow: {
    flexDirection: "row",
    gap: 6,
    alignSelf: "center",
    marginBottom: 10,
  },
  variantTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  variantTabHoloActive: {
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
  },
  variantTabRHActive: {
    backgroundColor: "rgba(139,92,246,0.15)",
    borderColor: "rgba(139,92,246,0.4)",
  },
  variantTabNormalActive: {
    backgroundColor: Colors.surfaceLight,
    borderColor: Colors.textMuted,
  },
  variantTabText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
  },
  variantTabTextHolo: {
    color: "#92400e",
    fontFamily: "Inter_600SemiBold",
  },
  variantTabTextRH: {
    color: "#c4b5fd",
    fontFamily: "Inter_600SemiBold",
  },
  variantTabTextNormal: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
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
  rawEbayLink: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
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

  // ── Company pill tabs ────────────────────────────────────────────────────
  companyPillRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  companyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  companyPillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  companyPillLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textMuted,
  },
  // ── Expanded company card ────────────────────────────────────────────────
  companyCard: {
    marginBottom: 12,
    marginHorizontal: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: "hidden",
  },
  saleCountTxt: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
  ebayLinkBtn: {
    width: 48,
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
  },
  ebayLinkTxt: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
  },
  trendHintRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    paddingLeft: 18,
  },
  trendHintTxt: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
  },
  chartContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    paddingTop: 12,
    paddingBottom: 4,
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
  tblRowGreen:    { backgroundColor: "rgba(245,158,11,0.05)" },
  tblRowCharted:  { backgroundColor: "rgba(255,60,49,0.05)" },

  accent:        { width: 3, alignSelf: "stretch", backgroundColor: "transparent", borderRadius: 2, marginRight: 11 },
  accentGreen:   { backgroundColor: "#f59e0b" },
  accentCharted: { backgroundColor: Colors.primary },

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

  // ── Market Snapshot ────────────────────────────────────────────────────
  snapshotCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 10,
  },
  snapshotTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  snapshotLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  snapshotBandChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  snapshotBandDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  snapshotBandText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  snapshotSalesPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  snapshotSalesPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  snapshotSalesCo: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  snapshotSalesCt: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  snapshotFooter: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
});
