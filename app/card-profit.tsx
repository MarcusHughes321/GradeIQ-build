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
  TextInput,
  KeyboardAvoidingView,
  RefreshControl,
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useSettings } from "@/lib/settings-context";
import { CURRENCIES } from "@/lib/settings";
import CompanyLabel from "@/components/CompanyLabel";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useSubscription } from "@/lib/subscription";
import { BlurredValue } from "@/components/BlurredValue";
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

// Submission start URLs per company (verified April 2026)
const COMPANY_SUBMIT_URL: Record<string, string> = {
  PSA:     "https://www.psacard.com/submit",
  Beckett: "https://www.beckett.com/submit",
  CGC:     "https://www.cgccomics.com/cards/submit/",
  Ace:     "https://acegrading.com/submission-portal",
  TAG:     "https://my.taggrading.com",
};

// Stamp badge overlay colours keyed by TCGdex stamp_type
const STAMP_BADGE_COLORS: Record<string, string> = {
  "set-logo":         "rgba(245,158,11,0.9)",   // amber  — prerelease
  "gym-challenge":    "rgba(99,102,241,0.9)",    // indigo — gym challenge
  "pre-release":      "rgba(245,158,11,0.9)",    // amber
  "pokemon-center":   "rgba(59,130,246,0.9)",    // blue
  "build-and-battle": "rgba(16,185,129,0.9)",    // green
  "trick-or-trade":   "rgba(249,115,22,0.9)",    // orange
  "staff":            "rgba(139,92,246,0.9)",     // purple
  "league":           "rgba(236,72,153,0.9)",     // pink
};

// Grading fee tiers per company — mirrored from grading-fees.tsx
type FeeCurrency = "USD" | "GBP";
interface FeeOption { label: string; amount: number; currency: FeeCurrency; turnaround: string; }
const COMPANY_FEE_OPTIONS: Record<string, FeeOption[]> = {
  PSA: [
    { label: "Value Bulk",    amount: 21.99,  currency: "USD", turnaround: "65+ business days"   },
    { label: "Value",         amount: 27.99,  currency: "USD", turnaround: "45–65 business days" },
    { label: "Value Plus",    amount: 44.99,  currency: "USD", turnaround: "30–45 business days" },
    { label: "Value Max",     amount: 59.99,  currency: "USD", turnaround: "20–30 business days" },
    { label: "Regular",       amount: 79.99,  currency: "USD", turnaround: "~10 business days"   },
    { label: "Express",       amount: 149.99, currency: "USD", turnaround: "~5 business days"    },
    { label: "Super Express", amount: 299.99, currency: "USD", turnaround: "~2 business days"    },
    { label: "Walk-Through",  amount: 499.99, currency: "USD", turnaround: "Same day"            },
  ],
  Beckett: [
    { label: "Economy",       amount: 20,  currency: "USD", turnaround: "20–25 business days" },
    { label: "Standard",      amount: 30,  currency: "USD", turnaround: "10–15 business days" },
    { label: "Express",       amount: 100, currency: "USD", turnaround: "5–7 business days"   },
    { label: "Super Express", amount: 125, currency: "USD", turnaround: "1–3 business days"   },
  ],
  CGC: [
    { label: "Bulk",     amount: 15,  currency: "USD", turnaround: "~40 days" },
    { label: "Economy",  amount: 18,  currency: "USD", turnaround: "~20 days" },
    { label: "Standard", amount: 55,  currency: "USD", turnaround: "~10 days" },
    { label: "Express",  amount: 100, currency: "USD", turnaround: "~5 days"  },
  ],
  Ace: [
    { label: "Basic",    amount: 12, currency: "GBP", turnaround: "~80 business days" },
    { label: "Standard", amount: 15, currency: "GBP", turnaround: "~30 business days" },
    { label: "Premier",  amount: 18, currency: "GBP", turnaround: "~15 business days" },
    { label: "Ultra",    amount: 25, currency: "GBP", turnaround: "~5 business days"  },
    { label: "Luxury",   amount: 50, currency: "GBP", turnaround: "~2 business days"  },
  ],
  TAG: [
    { label: "Basic",         amount: 22, currency: "USD", turnaround: "45+ business days" },
    { label: "Standard",      amount: 39, currency: "USD", turnaround: "~15 business days" },
    { label: "Express",       amount: 59, currency: "USD", turnaround: "~5 business days"  },
    { label: "Super Express", amount: 99, currency: "USD", turnaround: "~2 business days"  },
  ],
};

// Liquidity score 0–100 for a single grade's detail data.
// Weights: sale velocity 50% | price stability 30% | data freshness 20%
function calcLiquidityScore(detail: GradeDetail | undefined): number {
  if (!detail || !detail.saleCount) return 0;
  // Signal 1 — sale velocity (0–50 pts): 30+ sales = full score
  const velocity = Math.min(detail.saleCount / 30, 1) * 50;
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
  if (score >= 60 && saleCount >= 30) return { label: "High",   color: "#22c55e" };
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
  track:        { height: 10, backgroundColor: Colors.surfaceBorder, borderRadius: 6, overflow: "hidden" },
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
  blurred = false,
}: {
  detail: GradeDetail | undefined;
  history: PricePoint[];
  currencySymbol: string;
  currencyRate: number;
  blurred?: boolean;
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
          <BlurredValue blurred={blurred}><PriceAxis high={fmt(maxV)} low={fmt(minV)} /></BlurredValue>
        </View>
        {detail?.saleCount != null && (
          <BlurredValue blurred={blurred}>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "center", marginTop: 2 }}>
              {detail.saleCount.toLocaleString()} recorded sales
              {detail?.lastUpdated ? ` · Updated ${new Date(detail.lastUpdated).toLocaleDateString()}` : ""}
            </Text>
          </BlurredValue>
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
        <BlurredValue blurred={blurred}><PriceAxis high={fmt(maxV2)} low={fmt(minV2)} /></BlurredValue>
      </View>
      {detail.saleCount != null && (
        <BlurredValue blurred={blurred}>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "center", marginTop: 2 }}>
            {detail.saleCount.toLocaleString()} recorded sales
            {detail.lastUpdated ? ` · Updated ${new Date(detail.lastUpdated).toLocaleDateString()}` : ""}
          </Text>
        </BlurredValue>
      )}
    </View>
  );
}

export default function CardProfitScreen() {
  const insets = useSafeAreaInsets();
  const webTop = Platform.OS === "web" ? 67 : 0;
  const webBot = Platform.OS === "web" ? 34 : 0;
  const { settings } = useSettings();
  const { isSubscribed, isAdminMode } = useSubscription();
  const hasAccess = isSubscribed || isAdminMode;

  const { cardName, setName, cardNumber, setTotal, imageUrl, rawPriceUSD, rawPriceEUR, lang, edition, holoPrice, reverseHoloPrice, normalPrice, company: companyParam } = useLocalSearchParams<{
    cardId: string;
    cardName: string;
    setName: string;
    cardNumber?: string;
    setTotal?: string;
    imageUrl?: string;
    rawPriceUSD?: string;
    rawPriceEUR?: string;
    lang?: string;
    edition?: string;
    holoPrice?: string;
    reverseHoloPrice?: string;
    normalPrice?: string;
    company?: string;
  }>();

  const isJapanese = lang === "ja";

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

  // Price-paid override — must be declared before the derived values below use it
  const [priceOverrideInput, setPriceOverrideInput] = useState<string>("");
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [modalDraft, setModalDraft] = useState<string>("");

  // ── Price flag state ────────────────────────────────────────────────────
  const [flagSheetVisible, setFlagSheetVisible] = useState(false);
  const [flagSelectedGrades, setFlagSelectedGrades] = useState<Set<string>>(new Set());
  const [flagRawPrice, setFlagRawPrice] = useState(false);
  const [flagNote, setFlagNote] = useState("");
  const [flagSubmitted, setFlagSubmitted] = useState(false);
  const [flagSubmitting, setFlagSubmitting] = useState(false);

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

  const eurRate = rates["EUR"] ?? FALLBACK_RATES["EUR"] ?? 0.92;
  const gbpRate = rates["GBP"] ?? FALLBACK_RATES["GBP"] ?? 0.79;

  const baseRawUSD = rawPriceUSD ? parseFloat(rawPriceUSD) : 0;
  const baseRawEUR = rawPriceEUR ? parseFloat(rawPriceEUR) : 0;
  const selectedVariantPrice = selectedVariant
    ? (variantPrices.find(v => v.key === selectedVariant)?.price ?? null)
    : null;
  // For Japanese cards, use EUR raw price (Cardmarket NM); otherwise use USD (TCGPlayer)
  const rawUSD = isJapanese && baseRawEUR > 0
    ? baseRawEUR / eurRate // EUR → USD equivalent
    : (hasVariantTabs && selectedVariantPrice != null) ? selectedVariantPrice : baseRawUSD;
  const rawLocalVal = isJapanese && baseRawEUR > 0
    ? baseRawEUR * (currencyRate / eurRate) // EUR → user currency directly
    : rawUSD > 0 ? rawUSD * currencyRate : 0;
  const hasRawPrice = rawLocalVal > 0;
  const rawPriceLabel = isJapanese ? "Cardmarket" : "TCGPlayer";

  // Effective price for profit calculations — user override takes priority
  const overrideParsed = priceOverrideInput !== "" ? parseFloat(priceOverrideInput) : NaN;
  const effectiveRawLocal = (!isNaN(overrideParsed) && overrideParsed > 0) ? overrideParsed : rawLocalVal;
  const hasEffectiveRawPrice = effectiveRawLocal > 0;
  const priceIsOverridden = !isNaN(overrideParsed) && overrideParsed > 0;

  const qc = useQueryClient();
  const [ebayRefreshing, setEbayRefreshing] = useState(false);

  const { data: ebay, isLoading, error, refetch: refetchEbay } = useQuery<EbayAllGrades>({
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
    staleTime: 4 * 60 * 60 * 1000,
    retry: 1,
  });

  const handleRefresh = async () => {
    setEbayRefreshing(true);
    qc.invalidateQueries({ queryKey: ["ebay-all-grades", cardName, setName, cardNumber ?? "", editionParam] });
    await refetchEbay().catch(() => {});
    setEbayRefreshing(false);
  };

  // ── Stamp variants ───────────────────────────────────────────────────────
  interface CardVariant {
    id: number;
    stamp_type: string;
    display_name: string;
    image_url: string | null;
    notes: string | null;
    prices_fetched_at: string | null;
    poketrace_search_term: string | null;
  }
  const [selectedStampId, setSelectedStampId] = useState<number | null>(null);

  const { data: stampVariants = [] } = useQuery<CardVariant[]>({
    queryKey: ["card-variants", cardName, setName, cardNumber],
    queryFn: () => {
      const params = new URLSearchParams({ name: cardName || "" });
      if (setName)    params.set("setName",    setName);
      if (cardNumber) params.set("cardNumber",  cardNumber.split("/")[0].trim());
      return apiRequest("GET", `/api/card-variants?${params.toString()}`).then(r => r.json());
    },
    enabled: !!cardName,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const { data: stampEbayData, isLoading: stampLoading } = useQuery<EbayAllGrades>({
    queryKey: ["card-variant-prices", selectedStampId],
    queryFn: () =>
      apiRequest("GET", `/api/card-variants/${selectedStampId}/prices`).then(r => r.json()),
    enabled: selectedStampId !== null,
    staleTime: 12 * 60 * 60 * 1000,
  });

  const selectedStampVariant = stampVariants.find(v => v.id === selectedStampId) ?? null;
  const displayEbay: EbayAllGrades | undefined = (selectedStampId && stampEbayData) ? stampEbayData : ebay;
  const displayImage: string | undefined = (selectedStampId && selectedStampVariant?.image_url) ? selectedStampVariant.image_url : imageUrl;
  const displayLoading = selectedStampId ? stampLoading : isLoading;

  const hasStampVariants = stampVariants.length > 0;

  const enabledCompanies: CompanyId[] =
    settings.enabledCompanies.length > 0
      ? settings.enabledCompanies
      : COMPANY_ORDER;

  const defaultCompany: CompanyId = (
    companyParam && enabledCompanies.includes(companyParam as CompanyId)
      ? companyParam as CompanyId
      : enabledCompanies[0]
  ) ?? "PSA";
  const [selectedCompany, setSelectedCompany] = useState<CompanyId>(defaultCompany);

  // Which grade row the user has tapped to chart (undefined = top grade default)
  const [chartGradeKey, setChartGradeKey] = useState<string | undefined>(undefined);
  const [selectedFeeOption, setSelectedFeeOption] = useState<FeeOption | null>(null);
  const [aceLabelOption, setAceLabelOption] = useState<"standard" | "colour-match" | "custom">("standard");

  const openPriceModal = (currentValue?: string) => {
    setModalDraft(currentValue ?? "");
    setShowPriceModal(true);
  };

  const confirmPriceModal = () => {
    const val = parseFloat(modalDraft);
    if (!isNaN(val) && val > 0) {
      setPriceOverrideInput(val.toFixed(2));
    }
    setShowPriceModal(false);
  };

  // Reset chart grade, fee and label whenever the company tab switches
  useEffect(() => {
    setChartGradeKey(undefined);
    setSelectedFeeOption(null);
    setAceLabelOption("standard");
  }, [selectedCompany]);

  // Convert selected grading fee to local currency (GBP fees → local via GBP rate)
  // ACE label add-ons: Colour Match +£1, Custom Ace Label +£3
  const ACE_LABEL_ADDON_GBP: Record<string, number> = { "standard": 0, "colour-match": 1, "custom": 3 };
  const feeLocalAmount = selectedFeeOption
    ? (() => {
        const base = selectedFeeOption.currency === "GBP"
          ? selectedFeeOption.amount * (currencyRate / gbpRate)
          : selectedFeeOption.amount * currencyRate;
        const labelGbp = selectedCompany === "Ace" ? (ACE_LABEL_ADDON_GBP[aceLabelOption] ?? 0) : 0;
        return base + labelGbp * (currencyRate / gbpRate);
      })()
    : 0;

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

  // When a stamp variant is active, use its PokeTrace search term as the eBay base query
  const stampEbayBase: string | null = selectedStampVariant?.poketrace_search_term
    ? selectedStampVariant.poketrace_search_term
    : null;

  const buildEbayUrl = (gradeLabel: string) => {
    const base = stampEbayBase
      ? `${gradeLabel} ${stampEbayBase} pokemon`
      : [gradeLabel, cardName, displayCardNumber ? `${displayCardNumber}` : null, setName, "pokemon"].filter(Boolean).join(" ");
    return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(base)}&LH_Complete=1&LH_Sold=1`;
  };

  // Raw eBay "Find on eBay" search query — adapts to stamp variant
  const rawEbayQuery = stampEbayBase
    ? `${stampEbayBase} raw pokemon`
    : [cardName, displayCardNumber || null, setName, "Pokemon"].filter(Boolean).join(" ");

  const companies = useMemo(() => {
    return COMPANY_ORDER.filter(id => enabledCompanies.includes(id)).map(compId => {
      const config = COMPANY_CONFIG[compId];
      if (!config) return null;

      const rows = config.grades.map(g => {
        const ebayUSD = displayEbay ? ((displayEbay[g.ebayKey] as number | undefined) ?? 0) : 0;
        const ebayLocal = ebayUSD > 0 ? Math.round(ebayUSD * currencyRate) : null;
        // When a fee tier is selected, deduct it from profit for this company only
        const feeDeduc = compId === selectedCompany ? feeLocalAmount : 0;
        const profit =
          ebayLocal !== null && hasEffectiveRawPrice
            ? Math.round(ebayLocal - effectiveRawLocal - feeDeduc)
            : null;
        return { ...g, ebayLocal, profit };
      });

      const minProfitRow =
        [...rows].reverse().find(r => r.profit !== null && r.profit >= 0) ?? null;

      return { compId, config, rows, minProfitRow };
    }).filter((c): c is NonNullable<typeof c> => c !== null);
  }, [enabledCompanies, displayEbay, effectiveRawLocal, hasEffectiveRawPrice, currencyRate, feeLocalAmount, selectedCompany]);

  // ── Market snapshot — liquidity across all enabled companies ────────────
  const marketSnapshot = useMemo(() => {
    if (!displayEbay) return null; // hide only when prices haven't loaded at all

    const rows = COMPANY_ORDER
      .filter(id => enabledCompanies.includes(id))
      .map(compId => {
        const topKey = COMPANY_TOP_KEY[compId];
        const detail = topKey ? displayEbay.gradeDetails?.[topKey as string] : undefined;
        const score = calcLiquidityScore(detail);
        return {
          compId,
          label: COMPANY_CONFIG[compId]?.label ?? compId,
          color: COMPANY_CONFIG[compId]?.dotColor ?? "#6b7280",
          score,
          saleCount: detail?.saleCount ?? 0,
        };
      });

    const hasData     = rows.some(r => r.saleCount > 0);
    const totalSales  = rows.reduce((s, r) => s + r.saleCount, 0);
    const best        = rows.reduce((a, b) => b.score > a.score ? b : a, rows[0]);
    const maxScore    = Math.max(...rows.map(r => r.score), 1);
    const overallScore = Math.max(...rows.map(r => r.score), 0);
    const overallBand  = liquidityBand(overallScore, best.saleCount);

    return { rows, totalSales, best, maxScore, overallScore, overallBand, hasData };
  }, [displayEbay, enabledCompanies]);

  return (
    <View style={[st.container, { paddingTop: insets.top + webTop }]}>

      {/* ── Price-paid entry modal ─────────────────────────────── */}
      <Modal
        visible={showPriceModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPriceModal(false)}
      >
        <Pressable style={st.priceModalOverlay} onPress={() => setShowPriceModal(false)}>
          <Pressable style={st.priceModalCard} onPress={() => {}}>
            <Text style={st.priceModalTitle}>How much did you pay?</Text>
            <Text style={st.priceModalSub}>Enter the price in {currencySymbol}</Text>
            <TextInput
              style={st.priceModalInput}
              value={modalDraft}
              onChangeText={setModalDraft}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={Colors.textMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={confirmPriceModal}
              selectTextOnFocus
            />
            <View style={st.priceModalBtns}>
              <Pressable
                onPress={() => setShowPriceModal(false)}
                style={({ pressed }) => [st.priceModalBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={st.priceModalBtnTxtCancel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmPriceModal}
                style={({ pressed }) => [st.priceModalBtn, st.priceModalBtnConfirm, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={st.priceModalBtnTxtConfirm}>Confirm</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
      {!!displayImage && (
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
                  source={{ uri: displayImage }}
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
        refreshControl={
          <RefreshControl
            refreshing={ebayRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* Card hero — large centred image */}
        <View style={st.heroSection}>
          <Pressable
            onPress={() => displayImage ? setImageFullscreen(true) : undefined}
            style={({ pressed }) => [st.heroImgWrap, { opacity: pressed && !!displayImage ? 0.85 : 1 }]}
          >
            <View style={st.heroImgContainer}>
              {displayImage ? (
                <Image
                  source={{ uri: displayImage }}
                  style={st.heroImg}
                  contentFit="contain"
                />
              ) : (
                <View style={[st.heroImg, st.heroImgPlaceholder]}>
                  <Ionicons name="image-outline" size={48} color={Colors.textMuted} />
                </View>
              )}
              {!!selectedStampVariant && (
                <View style={[st.stampImageBadge, { backgroundColor: STAMP_BADGE_COLORS[selectedStampVariant.stamp_type] ?? "rgba(255,60,49,0.85)" }]}>
                  <Ionicons name="ribbon-outline" size={10} color="#fff" />
                  <Text style={st.stampImageBadgeTxt}>{selectedStampVariant.display_name.toUpperCase()}</Text>
                </View>
              )}
            </View>
            {!!displayImage && (
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

          {/* Variant tabs — TCGPlayer print variants (holo/RH/normal) */}
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

          {/* Stamp variant selector — shows when known stamped versions exist */}
          {hasStampVariants && (
            <View style={st.stampRow}>
              <Ionicons name="ribbon-outline" size={12} color={Colors.textMuted} style={{ marginTop: 1 }} />
              <View style={st.stampPills}>
                <Pressable
                  onPress={() => setSelectedStampId(null)}
                  style={[st.stampPill, selectedStampId === null && st.stampPillActive]}
                >
                  <Text style={[st.stampPillText, selectedStampId === null && st.stampPillTextActive]}>
                    Regular
                  </Text>
                </Pressable>
                {stampVariants.map(v => {
                  const isSelected = selectedStampId === v.id;
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => setSelectedStampId(isSelected ? null : v.id)}
                      style={[st.stampPill, isSelected && st.stampPillActive]}
                    >
                      <Text style={[st.stampPillText, isSelected && st.stampPillTextActive]}>
                        {v.display_name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Market price — shows stamp variant raw eBay price when variant selected */}
          {(() => {
            const variantRawUSD = selectedStampId && stampEbayData?.raw ? stampEbayData.raw : 0;
            const showVariantRaw = selectedStampId && variantRawUSD > 0;
            const rawDisplay = showVariantRaw
              ? fmtLocal(variantRawUSD)
              : hasRawPrice ? fmtLocal(rawLocalVal) : "—";
            const rawLabel = showVariantRaw
              ? `Raw (eBay · ${selectedStampVariant?.display_name})`
              : `Raw (${rawPriceLabel})`;
            return (
              <View style={st.heroPriceRow}>
                <Ionicons name="pricetag-outline" size={13} color={Colors.textMuted} />
                <Text style={st.heroPriceLabel}>{rawLabel}</Text>
                <BlurredValue blurred={!hasAccess}>
                  <Text style={[st.heroPriceValue, { marginLeft: 4 }]}>{rawDisplay}</Text>
                </BlurredValue>
                <Pressable
                  onPress={() => Linking.openURL(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(rawEbayQuery)}`)}
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, flexDirection: "row" as const, alignItems: "center" as const, gap: 3, marginLeft: "auto" as any })}
                >
                  <Text style={st.rawEbayLink}>Find on eBay</Text>
                  <Ionicons name="open-outline" size={10} color={Colors.textMuted} />
                </Pressable>
              </View>
            );
          })()}

          {/* Price paid — separate editable row below */}
          {priceIsOverridden ? (
            <View style={st.pricePaidSetRow}>
              <Ionicons name="wallet-outline" size={13} color={Colors.textMuted} />
              <Text style={st.heroPriceLabel}>You paid</Text>
              <Text style={[st.heroPriceValue, { marginLeft: 4 }]}>{fmtLocal(overrideParsed)}</Text>
              <Pressable
                onPress={() => openPriceModal(overrideParsed.toFixed(2))}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginLeft: "auto" as any })}
              >
                <Ionicons name="pencil-outline" size={14} color={Colors.textMuted} />
              </Pressable>
              <Pressable
                onPress={() => { setPriceOverrideInput(""); }}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Ionicons name="close-circle-outline" size={16} color={Colors.textMuted} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => openPriceModal()}
              style={({ pressed }) => [st.addPricePaidBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Ionicons name="add-circle-outline" size={15} color={Colors.textMuted} />
              <Text style={st.addPricePaidTxt}>Add how much you paid for accurate profit</Text>
            </Pressable>
          )}
        </View>

        {/* Grade This Card — compact secondary CTA */}
        <Pressable
          style={({ pressed }) => [st.gradeCtaSmall, { opacity: pressed ? 0.75 : 1 }]}
          onPress={() => router.push("/(tabs)/grade")}
        >
          <Ionicons name="scan-outline" size={14} color={Colors.primary} />
          <Text style={st.gradeCtaSmallTxt}>Grade This Card</Text>
          <Ionicons name="chevron-forward" size={13} color={Colors.textMuted} style={{ marginLeft: "auto" }} />
        </Pressable>

        {/* Price fetch status */}
        {displayLoading && (
          <View style={st.feedbackRow}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={st.feedbackText}>Fetching last sold prices…</Text>
          </View>
        )}
        {!displayLoading && !!error && !selectedStampId && (
          <View style={st.feedbackRow}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.error} />
            <Text style={[st.feedbackText, { color: Colors.error, flex: 1 }]}>
              Couldn't load sold prices — try again later
            </Text>
          </View>
        )}

        {/* ── Market Snapshot ─────────────────────────────────────── */}
        {!displayLoading && !error && !!marketSnapshot && (() => {
          // No-data state: prices loaded but PokeTrace has no saleCount stats
          if (!marketSnapshot.hasData) {
            return (
              <View style={st.snapshotCard}>
                <View style={st.snapshotTopRow}>
                  <Text style={st.snapshotLabel}>Liquidity</Text>
                  <View style={[st.snapshotBandChip, { backgroundColor: "#6b728022", borderColor: "#6b728055" }]}>
                    <View style={[st.snapshotBandDot, { backgroundColor: "#6b7280" }]} />
                    <Text style={[st.snapshotBandText, { color: "#6b7280" }]}>No data</Text>
                  </View>
                </View>
                <LiquidityBar score={0} color="#6b7280" />
                <Text style={st.snapshotFooter}>Not enough sales history to assess liquidity</Text>
              </View>
            );
          }

          // Drive bar from the tapped grade row (effectiveChartKey), not just the top grade
          const tappedDetail = effectiveChartKey ? displayEbay?.gradeDetails?.[effectiveChartKey] : undefined;
          const activeScore = calcLiquidityScore(tappedDetail);
          const activeSaleCount = tappedDetail?.saleCount ?? 0;
          const activeBand = liquidityBand(activeScore, activeSaleCount);
          // Grade label for the highlighted pill, e.g. "PSA 9"
          const activeGradeLabel =
            COMPANY_CONFIG[selectedCompany]?.grades.find(g => g.ebayKey === effectiveChartKey)?.label
            ?? COMPANY_CONFIG[selectedCompany]?.label
            ?? selectedCompany;
          const companyColor = COMPANY_CONFIG[selectedCompany]?.dotColor ?? "#6b7280";

          return (
            <View style={st.snapshotCard}>
              {/* Top row: label + band chip */}
              <View style={st.snapshotTopRow}>
                <Text style={st.snapshotLabel}>Liquidity</Text>
                <BlurredValue blurred={!hasAccess}>
                  <View style={[
                    st.snapshotBandChip,
                    { backgroundColor: activeBand.color + "1A", borderColor: activeBand.color + "55" },
                  ]}>
                    <View style={[st.snapshotBandDot, { backgroundColor: activeBand.color }]} />
                    <Text style={[st.snapshotBandText, { color: activeBand.color }]}>
                      {activeBand.label}
                    </Text>
                  </View>
                </BlurredValue>
              </View>

              {/* Animated liquid bar — reflects tapped grade */}
              <LiquidityBar score={hasAccess ? activeScore : 0} color={hasAccess ? activeBand.color : "#6b7280"} />

              {/* Active grade pill + other-company pills */}
              <View style={st.snapshotSalesPills}>
                {/* Always show active company's tapped grade */}
                <BlurredValue blurred={!hasAccess}>
                  <View style={[
                    st.snapshotSalesPill,
                    { borderColor: companyColor + "99", backgroundColor: companyColor + "1A" },
                  ]}>
                    <Text style={[st.snapshotSalesCo, { color: companyColor }]}>{activeGradeLabel}</Text>
                    <Text style={[st.snapshotSalesCt, { color: Colors.text }]}>{activeSaleCount}</Text>
                  </View>
                </BlurredValue>
                {/* Other companies — top grade saleCount */}
                {marketSnapshot.rows
                  .filter(r => r.compId !== selectedCompany && r.saleCount > 0)
                  .map(r => (
                    <BlurredValue key={r.compId} blurred={!hasAccess}>
                      <View style={st.snapshotSalesPill}>
                        <Text style={[st.snapshotSalesCo, { color: r.color }]}>{r.label}</Text>
                        <Text style={st.snapshotSalesCt}>{r.saleCount}</Text>
                      </View>
                    </BlurredValue>
                  ))
                }
              </View>

              {/* Footer — reflects the tapped grade */}
              <BlurredValue blurred={!hasAccess}>
                <Text style={st.snapshotFooter}>
                  {activeSaleCount > 0
                    ? `${activeSaleCount} recorded ${activeGradeLabel} sales in the last month`
                    : `No recent sales data for ${activeGradeLabel}`}
                </Text>
              </BlurredValue>
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
          const chartDetail = effectiveChartKey ? displayEbay?.gradeDetails?.[effectiveChartKey] : undefined;

          // Net profit box follows the tapped grade row; falls back to minimum profitable grade
          const displayRow = chartGradeKey
            ? (rows.find(r => r.ebayKey === chartGradeKey) ?? minProfitRow)
            : minProfitRow;

          return (
            <View key={compId} style={st.companyCard}>
              {/* Column headers */}
              <View style={st.tblHead}>
                <Text style={[st.tblHeadTxt, { flex: 2 }]}>Grade</Text>
                <Text style={[st.tblHeadTxt, { flex: 2, textAlign: "right" }]}>eBay Sold</Text>
                <View style={{ flex: 2, alignItems: "flex-end" as const }}>
                  <Text style={st.tblHeadTxt}>
                    {selectedFeeOption ? "Net Profit" : "Profit"}
                  </Text>
                  {priceIsOverridden && (
                    <Text style={st.tblHeadSubTxt}>vs {fmtLocal(overrideParsed)} paid</Text>
                  )}
                </View>
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
                      isProfit ? st.tblRowProfit
                        : gr.profit !== null ? st.tblRowLoss
                        : null,
                      (isCharted && chartGradeKey !== undefined) ? st.tblRowCharted : null,
                      isLast && { borderBottomWidth: 0 },
                    ]}>
                      <View style={[
                        st.accent,
                        (isCharted && chartGradeKey !== undefined) ? st.accentCharted
                          : isProfit ? st.accentProfit
                          : gr.profit !== null ? st.accentLoss
                          : null,
                      ]} />

                      <View style={{ flex: 2 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                          <Text style={st.gradeLabel}>
                            {gr.label}
                          </Text>
                        </View>
                        {detail?.saleCount != null && (
                          <BlurredValue blurred={!hasAccess}>
                            <Text style={st.saleCountTxt}>{detail.saleCount} sales last month</Text>
                          </BlurredValue>
                        )}
                      </View>

                      {displayLoading ? (
                        <ActivityIndicator size="small" color={Colors.textMuted} style={{ flex: 2 }} />
                      ) : (
                        <BlurredValue blurred={!hasAccess && gr.ebayLocal !== null} containerStyle={{ flex: 2 }}>
                          <Text style={[st.ebayPrice, { flex: 2 }]}>
                            {gr.ebayLocal !== null ? fmtLocal(gr.ebayLocal) : "—"}
                          </Text>
                        </BlurredValue>
                      )}

                      {displayLoading ? (
                        <View style={{ flex: 2 }} />
                      ) : hasEffectiveRawPrice && gr.profit !== null ? (
                        <BlurredValue blurred={!hasAccess} containerStyle={{ flex: 2 }}>
                          <Text style={[st.profitVal, { flex: 2, color: isProfit ? "#22c55e" : "#ef4444" }]}>
                            {isProfit ? "+" : "-"}{fmtProfit(Math.abs(gr.profit), effectiveRawLocal)}
                          </Text>
                        </BlurredValue>
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
              {!displayLoading && (chartDetail || (historyData?.history?.length ?? 0) >= 3) && (
                <View style={st.chartContainer}>
                  <TrendChart
                    detail={chartDetail}
                    history={historyData?.history ?? []}
                    currencySymbol={currencySymbol}
                    currencyRate={currencyRate}
                    blurred={!hasAccess}
                  />
                </View>
              )}

              {/* Company summary */}
              {!displayLoading && displayEbay && hasEffectiveRawPrice && (
                <View style={st.summaryRow}>
                  {minProfitRow ? (
                    <BlurredValue blurred={!hasAccess}>
                      <Text style={st.summaryTxt}>
                        Min grade to profit:{" "}
                        <Text style={{ color: "#f59e0b", fontFamily: "Inter_700Bold" }}>
                          {minProfitRow.label}
                        </Text>
                      </Text>
                    </BlurredValue>
                  ) : (
                    <Text style={[st.summaryTxt, { color: "#ef4444" }]}>
                      No profitable grade at this raw price
                    </Text>
                  )}
                </View>
              )}

              {/* ── Grading Fee Section ─────────────────────────────── */}
              {(COMPANY_FEE_OPTIONS[compId] ?? []).length > 0 && (
                <View style={st.feeSection}>
                  {/* Header row */}
                  <View style={st.feeSectionHeader}>
                    <Ionicons name="receipt-outline" size={13} color={Colors.textMuted} />
                    <Text style={st.feeSectionTitle}>Grading Fee</Text>
                    {selectedFeeOption && compId === selectedCompany && (
                      <Pressable
                        onPress={() => setSelectedFeeOption(null)}
                        hitSlop={8}
                        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                      >
                        <Text style={st.feeClearBtn}>Clear</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Tier pills — horizontal scroll, bleeds edge-to-edge within card */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={st.feeTierScroll}
                    style={st.feeTierScrollView}
                  >
                    {(COMPANY_FEE_OPTIONS[compId] ?? []).map(opt => {
                      const isActive = compId === selectedCompany && selectedFeeOption?.label === opt.label;
                      const nativeSym = opt.currency === "GBP" ? "£" : "$";
                      const nativeAmt = opt.amount % 1 === 0
                        ? `${opt.amount}`
                        : opt.amount.toFixed(2);
                      return (
                        <Pressable
                          key={opt.label}
                          onPress={() => setSelectedFeeOption(isActive ? null : opt)}
                          style={[st.feeTierPill, isActive && st.feeTierPillActive]}
                        >
                          <Text style={[st.feeTierName, isActive && st.feeTierNameActive]}>
                            {opt.label}
                          </Text>
                          <Text style={[st.feeTierAmt, isActive && st.feeTierAmtActive]}>
                            {nativeSym}{nativeAmt}
                          </Text>
                          <Text style={[st.feeTierTurnaround, isActive && st.feeTierTurnaroundActive]}>
                            {opt.turnaround}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  {/* ACE Custom Label toggle — shown once a tier is selected */}
                  {compId === "Ace" && selectedFeeOption && compId === selectedCompany && (
                    <View style={st.labelSection}>
                      <View style={st.labelSectionHeader}>
                        <Ionicons name="color-palette-outline" size={13} color={Colors.textMuted} />
                        <Text style={st.labelSectionTitle}>Label</Text>
                      </View>
                      <View style={st.labelPillRow}>
                        {([
                          { key: "standard",     name: "Standard",          price: "Included"    },
                          { key: "colour-match", name: "Colour Match",      price: "+£1 per card" },
                          { key: "custom",       name: "Custom Ace Label",  price: "+£3 per card" },
                        ] as const).map(opt => {
                          const active = aceLabelOption === opt.key;
                          return (
                            <Pressable
                              key={opt.key}
                              onPress={() => setAceLabelOption(opt.key)}
                              style={[st.labelPill, active && st.labelPillActive]}
                            >
                              <Text style={[st.labelPillName, active && st.labelPillNameActive]}>
                                {opt.name}
                              </Text>
                              <Text style={[st.labelPillPrice, active && st.labelPillPriceActive]}>
                                {opt.price}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Turnaround + deduction note */}
                  {selectedFeeOption && compId === selectedCompany ? (
                    <View style={st.feeMeta}>
                      <View style={st.feeMetaRow}>
                        <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                        <Text style={st.feeMetaTxt}>
                          Est. turnaround:{" "}
                          <Text style={{ color: Colors.text, fontFamily: "Inter_600SemiBold" }}>
                            {selectedFeeOption.turnaround}
                          </Text>
                        </Text>
                      </View>
                      <View style={st.feeMetaRow}>
                        <Ionicons name="remove-circle-outline" size={13} color={Colors.textMuted} />
                        <BlurredValue blurred={!hasAccess}>
                          <Text style={st.feeMetaTxt}>
                            {selectedFeeOption.label} fee ({fmtLocal(feeLocalAmount)}{currency !== "USD" && selectedFeeOption.currency === "USD" ? ` · $${selectedFeeOption.amount}` : ""}) deducted from profit above
                          </Text>
                        </BlurredValue>
                      </View>
                    </View>
                  ) : (
                    <Text style={st.feeHint}>
                      Tap a tier to factor in the grading fee
                    </Text>
                  )}

                  {/* Nudge — fee tier selected but no raw price entered */}
                  {selectedFeeOption && compId === selectedCompany && !hasEffectiveRawPrice && (
                    <Pressable
                      onPress={() => openPriceModal(effectiveRawLocal > 0 ? effectiveRawLocal.toFixed(2) : "")}
                      style={({ pressed }) => [st.noPriceNudge, { opacity: pressed ? 0.75 : 1 }]}
                    >
                      <Ionicons name="pricetag-outline" size={14} color={Colors.textMuted} />
                      <Text style={st.noPriceNudgeTxt}>Add your purchase price to see net profit</Text>
                      <Ionicons name="chevron-forward" size={13} color={Colors.textMuted} style={{ marginLeft: "auto" as any }} />
                    </Pressable>
                  )}

                  {/* Final Net Profit summary */}
                  {compId === selectedCompany && hasEffectiveRawPrice && displayEbay && (
                    <View style={[
                      st.netProfitBox,
                      displayRow
                        ? (displayRow.profit ?? 0) >= 0 ? st.netProfitBoxGreen : st.netProfitBoxRed
                        : st.netProfitBoxRed,
                    ]}>
                      <Text style={st.netProfitLabel}>
                        {displayRow ? `Net Profit at ${displayRow.label}` : "No profitable grade"}
                      </Text>
                      {displayRow && (
                        <BlurredValue blurred={!hasAccess}>
                          <Text style={[
                            st.netProfitValue,
                            (displayRow.profit ?? 0) >= 0 ? { color: "#22c55e" } : { color: "#ef4444" },
                          ]}>
                            {fmtLocal(displayRow.profit ?? 0)}
                          </Text>
                        </BlurredValue>
                      )}
                      <BlurredValue blurred={!hasAccess}>
                        <Text style={st.netProfitSub}>
                          {displayRow
                            ? `after ${fmtLocal(effectiveRawLocal)} ${priceIsOverridden ? "you paid" : "raw"}${selectedFeeOption ? ` + ${fmtLocal(feeLocalAmount)} fee` : ""}`
                            : selectedFeeOption ? `fee of ${fmtLocal(feeLocalAmount)} exceeds all grade profits` : "No profitable grade at this price"}
                        </Text>
                      </BlurredValue>
                    </View>
                  )}

                  {/* Ready to Submit button */}
                  {selectedFeeOption && compId === selectedCompany && COMPANY_SUBMIT_URL[compId] && (
                    <Pressable
                      onPress={() => Linking.openURL(COMPANY_SUBMIT_URL[compId])}
                      style={({ pressed }) => [st.submitBtn, { opacity: pressed ? 0.75 : 1 }]}
                    >
                      <Ionicons name="checkmark-circle-outline" size={17} color="#fff" />
                      <Text style={st.submitBtnTxt}>Ready to Submit?</Text>
                      <Ionicons name="open-outline" size={14} color="rgba(255,255,255,0.7)" style={{ marginLeft: "auto" }} />
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {/* Stale data warning */}
        {!displayLoading && displayEbay?.isStale && displayEbay.fetchedAt && (
          <View style={[st.feedbackRow, { backgroundColor: "rgba(245,158,11,0.08)", borderRadius: 8, marginTop: 4 }]}>
            <Ionicons name="time-outline" size={14} color="#f59e0b" />
            <Text style={[st.feedbackText, { color: "#f59e0b", flex: 1 }]}>
              Showing archived prices from {Math.round((Date.now() - displayEbay.fetchedAt) / 86400000)} day{Math.round((Date.now() - displayEbay.fetchedAt) / 86400000) !== 1 ? "s" : ""} ago — live data temporarily unavailable
            </Text>
          </View>
        )}

        {/* Price flag trigger */}
        {!displayLoading && displayEbay && (
          flagSubmitted ? (
            <View style={st.flagConfirm}>
              <Ionicons name="checkmark-circle" size={15} color="#10B981" />
              <Text style={st.flagConfirmTxt}>Thanks — we're looking into it.</Text>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                setFlagSelectedGrades(new Set());
                setFlagRawPrice(false);
                setFlagNote("");
                setFlagSheetVisible(true);
              }}
              style={({ pressed }) => [st.flagTrigger, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Ionicons name="flag-outline" size={13} color={Colors.textMuted} />
              <Text style={st.flagTriggerTxt}>Price doesn't look right?</Text>
            </Pressable>
          )
        )}

        {/* Disclaimer */}
        <View style={st.disclaimer}>
          <Ionicons name="information-circle-outline" size={12} color={Colors.textMuted} />
          <Text style={st.disclaimerTxt}>
            Last sold prices sourced from eBay · All prices in {currency}
            {ratesData?.updatedAt ? ` · Rates: ${ratesData.updatedAt}` : ""}
            {!displayLoading && displayEbay?.fetchedAt && !displayEbay.isStale ? ` · Updated ${Math.round((Date.now() - displayEbay.fetchedAt) / 3600000)}h ago` : ""}
          </Text>
        </View>
      </ScrollView>

      {/* Flag selection modal */}
      <Modal
        visible={flagSheetVisible}
        animationType="slide"
        transparent
        onRequestClose={() => { setFlagSheetVisible(false); setFlagRawPrice(false); }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={[{ flex: 1 }, st.flagOverlay]} onPress={() => { setFlagSheetVisible(false); setFlagRawPrice(false); }} />
          <View style={[st.flagSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={st.flagSheetHandle} />
          <Text style={st.flagSheetTitle}>Which prices look off?</Text>
          <Text style={st.flagSheetSub}>Select everything that seems incorrect</Text>

          <ScrollView style={st.flagGradeList} scrollEnabled={false}>
            {/* Raw price row */}
            {hasRawPrice && (
              <Pressable
                onPress={() => setFlagRawPrice(p => !p)}
                style={[st.flagGradeRow, flagRawPrice && st.flagGradeRowSelected, st.flagRawRow]}
              >
                <View style={[st.flagGradeCheck, flagRawPrice && st.flagGradeCheckSelected]}>
                  {flagRawPrice && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
                <View style={st.flagRawLabel}>
                  <Text style={[st.flagGradeLabel, flagRawPrice && { color: Colors.text }]}>
                    Raw ({rawPriceLabel})
                  </Text>
                  <Text style={st.flagRawSubLabel}>Market price</Text>
                </View>
                <Text style={st.flagGradeValue}>
                  {fmtLocal(rawUSD)}
                </Text>
              </Pressable>
            )}
            {/* Divider between raw and graded */}
            {hasRawPrice && (COMPANY_CONFIG[selectedCompany]?.grades ?? []).length > 0 && (
              <View style={st.flagSectionDivider}>
                <Text style={st.flagSectionDividerTxt}>GRADED (eBay)</Text>
              </View>
            )}
            {(COMPANY_CONFIG[selectedCompany]?.grades ?? []).map(g => {
              const ebayUSD = ebay ? ((ebay[g.ebayKey] as number | undefined) ?? 0) : 0;
              const isSelected = flagSelectedGrades.has(g.label);
              return (
                <Pressable
                  key={g.label}
                  onPress={() => {
                    const next = new Set(flagSelectedGrades);
                    if (isSelected) next.delete(g.label);
                    else next.add(g.label);
                    setFlagSelectedGrades(next);
                  }}
                  style={[st.flagGradeRow, isSelected && st.flagGradeRowSelected]}
                >
                  <View style={[st.flagGradeCheck, isSelected && st.flagGradeCheckSelected]}>
                    {isSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
                  </View>
                  <Text style={[st.flagGradeLabel, isSelected && { color: Colors.text }]}>{g.label}</Text>
                  <Text style={st.flagGradeValue}>
                    {ebayUSD > 0 ? `$${ebayUSD.toFixed(2)}` : "—"}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <TextInput
            style={st.flagNoteInput}
            value={flagNote}
            onChangeText={setFlagNote}
            placeholder="Optional note — e.g. 'looks like the wrong set'"
            placeholderTextColor={Colors.textMuted}
            multiline
          />

          <Pressable
            onPress={async () => {
              if (flagSelectedGrades.size === 0 && !flagRawPrice) return;
              setFlagSubmitting(true);
              try {
                const ebayMap: Record<string, number> = {};
                (COMPANY_CONFIG[selectedCompany]?.grades ?? []).forEach(g => {
                  if (flagSelectedGrades.has(g.label)) {
                    ebayMap[g.label] = ebay ? ((ebay[g.ebayKey] as number | undefined) ?? 0) : 0;
                  }
                });
                const allGrades = Array.from(flagSelectedGrades);
                if (flagRawPrice) {
                  allGrades.unshift(`Raw (${rawPriceLabel})`);
                  ebayMap[`Raw (${rawPriceLabel})`] = rawUSD;
                }
                const url = new URL("/api/price-flags", getApiUrl());
                await fetch(url.toString(), {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    cardName: cardName ?? "",
                    setName: setName ?? null,
                    cardNumber: cardNumber ?? null,
                    cardLang: lang ?? "en",
                    company: selectedCompany,
                    flaggedGrades: allGrades,
                    flaggedValues: ebayMap,
                    userNote: flagNote.trim() || null,
                  }),
                });
                setFlagSheetVisible(false);
                setFlagSubmitted(true);
                setFlagRawPrice(false);
              } catch {
                setFlagSheetVisible(false);
                setFlagRawPrice(false);
              } finally {
                setFlagSubmitting(false);
              }
            }}
            disabled={(flagSelectedGrades.size === 0 && !flagRawPrice) || flagSubmitting}
            style={({ pressed }) => [
              st.flagSubmitBtn,
              ((flagSelectedGrades.size === 0 && !flagRawPrice) || flagSubmitting || pressed) && { opacity: 0.5 },
            ]}
          >
            {flagSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (() => {
              const total = flagSelectedGrades.size + (flagRawPrice ? 1 : 0);
              return <Text style={st.flagSubmitBtnTxt}>Flag {total > 0 ? total : ""} Price{total !== 1 ? "s" : ""}</Text>;
            })()}
          </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  heroImgContainer: {
    width: 180,
    height: 252,
    position: "relative",
  },
  stampImageBadge: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 0,
    marginHorizontal: 8,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  stampImageBadgeTxt: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    color: "#fff",
    letterSpacing: 0.5,
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
  stampRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    alignSelf: "center",
    marginBottom: 10,
    marginTop: -2,
  },
  stampPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  stampPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  stampPillActive: {
    backgroundColor: "rgba(255,60,49,0.12)",
    borderColor: Colors.primary,
  },
  stampPillText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
  },
  stampPillTextActive: {
    color: Colors.primary,
    fontFamily: "Inter_600SemiBold",
  },
  heroPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 4,
  },
  // Price-paid modal
  priceModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: 24,
  },
  priceModalCard: {
    width: "100%" as any,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  priceModalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
    textAlign: "center" as const,
  },
  priceModalSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center" as const,
  },
  priceModalInput: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: Colors.text,
    textAlign: "center" as const,
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
    paddingVertical: 8,
    marginVertical: 4,
  },
  priceModalBtns: {
    flexDirection: "row" as const,
    gap: 12,
    marginTop: 4,
  },
  priceModalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center" as const,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  priceModalBtnConfirm: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  priceModalBtnTxtCancel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.textMuted,
  },
  priceModalBtnTxtConfirm: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#fff",
  },
  heroPriceLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  heroPriceValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  pricePaidSetRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 2,
  },
  addPricePaidBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 7,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 2,
  },
  addPricePaidTxt: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
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
  tblHeadSubTxt: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 1,
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
  tblRowAmber:  { backgroundColor: "rgba(245,158,11,0.08)" },
  tblRowCharted: { backgroundColor: "rgba(255,255,255,0.07)" },
  tblRowProfit: { backgroundColor: "rgba(34,197,94,0.07)"  },
  tblRowLoss:   { backgroundColor: "rgba(239,68,68,0.07)"  },

  accent:        { width: 3, alignSelf: "stretch", backgroundColor: "transparent", borderRadius: 2, marginRight: 11 },
  accentAmber:   { backgroundColor: "#f59e0b" },
  accentProfit:  { backgroundColor: "#22c55e" },
  accentLoss:    { backgroundColor: "#ef4444" },
  accentCharted: { backgroundColor: "#ffffff" },

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
    borderColor: Colors.surfaceBorder,
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
    borderColor: Colors.surfaceBorder,
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

  // ── Grading Fee Section ─────────────────────────────────────────────────
  feeSection: {
    marginTop: 0,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    gap: 12,
  },
  feeSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  feeSectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textMuted,
    flex: 1,
  },
  feeClearBtn: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.primary,
  },
  feeTierScrollView: {
    marginHorizontal: -14,
  },
  feeTierScroll: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 1,
  },
  feeTierPill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: "center",
    gap: 2,
    minWidth: 90,
    maxWidth: 120,
  },
  feeTierPillActive: {
    backgroundColor: Colors.primary + "18",
    borderColor: Colors.primary,
  },
  feeTierName: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textMuted,
  },
  feeTierNameActive: {
    color: Colors.primary,
    fontFamily: "Inter_600SemiBold",
  },
  feeTierAmt: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
  },
  feeTierAmtActive: {
    color: Colors.primary,
  },
  feeTierTurnaround: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: "center",
  },
  feeTierTurnaroundActive: {
    color: Colors.primary + "aa",
  },
  labelSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    paddingTop: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  labelSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  labelSectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  labelPillRow: {
    flexDirection: "row",
    gap: 8,
  },
  labelPill: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: "center",
    gap: 3,
  },
  labelPillActive: {
    backgroundColor: Colors.primary + "18",
    borderColor: Colors.primary,
  },
  labelPillName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.text,
    textAlign: "center",
  },
  labelPillNameActive: {
    color: Colors.primary,
  },
  labelPillPrice: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
  },
  labelPillPriceActive: {
    color: Colors.primary + "cc",
  },
  feeMeta: {
    gap: 5,
    paddingHorizontal: 2,
  },
  feeMetaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  feeMetaTxt: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    flex: 1,
    lineHeight: 17,
  },
  feeHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: "italic",
    paddingHorizontal: 2,
  },
  noPriceNudge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noPriceNudgeTxt: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    flex: 1,
  },
  // Net profit summary box
  netProfitBox: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 3,
    alignItems: "center",
  },
  netProfitBoxGreen: {
    backgroundColor: "rgba(34,197,94,0.07)",
    borderColor: "rgba(34,197,94,0.3)",
  },
  netProfitBoxRed: {
    backgroundColor: "rgba(239,68,68,0.07)",
    borderColor: "rgba(239,68,68,0.25)",
  },
  netProfitLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  netProfitValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
  },
  netProfitSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#16a34a",
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  submitBtnTxt: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#fff",
    flex: 1,
  },
  // Compact secondary CTA shown below hero section
  gradeCtaSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  gradeCtaSmallTxt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.primary,
    flex: 1,
  },

  // ── Price flag styles ─────────────────────────────────────────────────
  flagTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginHorizontal: 12,
    marginTop: 4,
  },
  flagTriggerTxt: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textDecorationLine: "underline",
  },
  flagConfirm: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginHorizontal: 12,
    marginTop: 4,
  },
  flagConfirmTxt: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#10B981",
  },
  flagOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  flagSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  flagSheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.surfaceBorder,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  flagSheetTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: Colors.text,
    marginBottom: 4,
  },
  flagSheetSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 16,
  },
  flagGradeList: {
    marginBottom: 12,
  },
  flagGradeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  flagGradeRowSelected: {
    backgroundColor: "rgba(255,60,49,0.04)",
  },
  flagGradeCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  flagGradeCheckSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  flagGradeLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
    flex: 1,
  },
  flagGradeValue: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  flagRawRow: {
    borderColor: "#F59E0B44",
  },
  flagRawLabel: {
    flex: 1,
    gap: 1,
  },
  flagRawSubLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  flagSectionDivider: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  flagSectionDividerTxt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.8,
    color: Colors.textMuted,
  },
  flagNoteInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
    marginBottom: 12,
    minHeight: 60,
  },
  flagSubmitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  flagSubmitBtnTxt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});
