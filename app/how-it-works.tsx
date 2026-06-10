import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";

type SystemStats = {
  enCards: number | null;
  jaCards: number | null;
  setsTracked: number | null;
  gradesCompleted: number | null;
};

const NODE = 44;
const SPINE_CENTER = NODE / 2;

function approx(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (n < 1000) return String(n);
  const floored = Math.floor(n / 100) * 100;
  return floored.toLocaleString() + "+";
}

type SpineVariant = "grade" | "primary" | "dashed";

const LINE_COLORS: Record<Exclude<SpineVariant, "dashed">, [string, string, ...string[]]> = {
  grade: ["#FF3C31", "#F59E0B", "#10B981"],
  primary: ["#FF3C31", "#FF6B63"],
};

type MapItem = {
  key: string;
  icon: string;
  color: string;
  title: string;
  desc: string;
  summary?: string;
  stat?: string | null;
  status?: "live" | "soon";
};

function MapSection({
  items,
  variant,
}: {
  items: MapItem[];
  variant: SpineVariant;
}) {
  const [lastY, setLastY] = useState(0);
  const dotY = useSharedValue(0);

  useEffect(() => {
    if (lastY > 0 && variant !== "dashed" && Platform.OS !== "web") {
      dotY.value = 0;
      dotY.value = withRepeat(
        withTiming(lastY, { duration: 2800, easing: Easing.inOut(Easing.ease) }),
        -1,
        false,
      );
    }
  }, [lastY, variant]);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dotY.value }],
  }));

  return (
    <View style={styles.mapBody}>
      {variant !== "dashed" && lastY > 0 && (
        <LinearGradient
          colors={LINE_COLORS[variant]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.spineLine, { height: lastY }]}
        />
      )}
      {variant === "dashed" && lastY > 0 && (
        <View style={[styles.spineDashed, { height: lastY }]} />
      )}
      {variant !== "dashed" && lastY > 0 && Platform.OS !== "web" && (
        <Animated.View style={[styles.pulseDot, dotStyle]} />
      )}

      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <View
            key={item.key}
            style={[styles.row, !isLast && { marginBottom: 16 }]}
            onLayout={isLast ? (e) => setLastY(e.nativeEvent.layout.y) : undefined}
          >
            <View style={styles.nodeCol}>
              <View style={[styles.node, { borderColor: item.color, opacity: item.status === "soon" ? 0.55 : 1 }]}>
                <Ionicons name={item.icon as any} size={20} color={item.color} />
              </View>
            </View>
            <View style={styles.nodeContent}>
              <MapNode item={item} variant={variant} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function MapNode({ item, variant }: { item: MapItem; variant: SpineVariant }) {
  const [open, setOpen] = useState(false);
  const rot = useSharedValue(0);

  useEffect(() => {
    rot.value = withTiming(open ? 1 : 0, { duration: 180 });
  }, [open]);

  const chevStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value * 180}deg` }],
  }));

  const soon = item.status === "soon";
  const showLive = variant === "primary" && !soon;
  const teaser = item.summary ?? item.stat ?? null;

  return (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      style={({ pressed }) => [styles.nodeCard, soon && styles.soonCard, { opacity: pressed ? 0.85 : 1 }]}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
    >
      <View style={styles.nodeTopRow}>
        <Text style={[styles.nodeTitle, soon && { color: Colors.textSecondary }]} numberOfLines={1}>
          {item.title}
        </Text>
        {showLive && (
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveTxt}>Live</Text>
          </View>
        )}
        {soon && (
          <View style={styles.soonPill}>
            <Ionicons name="time-outline" size={11} color={Colors.warning} />
            <Text style={styles.soonPillTxt}>Coming Soon</Text>
          </View>
        )}
        <Animated.View style={chevStyle}>
          <Ionicons name="chevron-down" size={18} color={Colors.textMuted} />
        </Animated.View>
      </View>
      {teaser && (
        <Text style={[styles.nodeTeaser, { color: soon ? Colors.textMuted : item.color }]}>{teaser}</Text>
      )}
      {open && <Text style={styles.nodeBody}>{item.desc}</Text>}
    </Pressable>
  );
}

export default function HowItWorksScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const { data: stats, isLoading } = useQuery<SystemStats>({
    queryKey: ["/api/system-map/stats"],
    queryFn: async () => {
      const url = new URL("/api/system-map/stats", getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
  });

  const statTiles: { value: number | null; label: string }[] = [
    { value: stats?.enCards ?? null, label: "English cards" },
    { value: stats?.jaCards ?? null, label: "Japanese cards" },
    { value: stats?.setsTracked ?? null, label: "Sets tracked" },
  ];

  const journey: MapItem[] = [
    { key: "capture", icon: "camera", color: Colors.primary, title: "Capture", summary: "Front & back photos", desc: "You snap clear photos of your card — front and back." },
    { key: "enhance", icon: "color-wand", color: Colors.warning, title: "Enhance", summary: "Auto-crop & sharpen", desc: "We auto-crop, straighten and sharpen every photo for a clean, even look." },
    { key: "analyse", icon: "sparkles", color: "#A78BFA", title: "Analyse", summary: "AI checks the 4 grade factors", desc: "Your card is examined against the four things graders score: centering, corners, edges and surface." },
    { key: "identify", icon: "search", color: "#60A5FA", title: "Identify", summary: "Matched to our databases", desc: "We match your card against our English and Japanese card databases." },
    { key: "value", icon: "cash", color: Colors.success, title: "Value", summary: "Live market prices pulled in", desc: "Live market prices are pulled in so you can see what each grade is worth." },
    { key: "result", icon: "ribbon", color: Colors.primary, title: "Result", summary: "Grade + value, saved to history", desc: "You get an estimated grade and value — saved safely to your history." },
  ];

  const powers: MapItem[] = [
    {
      key: "claude",
      icon: "sparkles",
      color: "#A78BFA",
      title: "Claude AI Analyzer",
      stat: "The brain behind every grade",
      desc: "Every card is examined by Anthropic's Claude — a powerful AI vision model. It scores the four things graders care about (centering, corners, edges, surface), identifies the exact card and set, and also powers the Card Advisor.",
    },
    {
      key: "en-db",
      icon: "albums",
      color: "#60A5FA",
      title: "English Card Database",
      stat: approx(stats?.enCards) ? `${approx(stats?.enCards)} English cards tracked` : "English cards & live prices",
      desc: "A full catalogue of English Pokémon cards with up-to-date TCGPlayer market prices, refreshed daily. This is what lets us name your card and estimate its raw value.",
    },
    {
      key: "ja-db",
      icon: "language",
      color: "#F472B6",
      title: "Japanese Card Database",
      stat: approx(stats?.jaCards) ? `${approx(stats?.jaCards)} Japanese cards tracked` : "Japanese cards & live prices",
      desc: "Japanese cards too — with English names and Cardmarket (EU) prices, refreshed daily, so Japanese collectors get accurate values in their own currency.",
    },
    {
      key: "tcg",
      icon: "trending-up",
      color: Colors.success,
      title: "TCGPlayer Market Data",
      stat: "Raw (ungraded) card values",
      desc: "We pull raw market prices from TCGPlayer so you can see what a card is worth before grading — the starting point for every profit estimate.",
    },
    {
      key: "ebay",
      icon: "pricetags",
      color: Colors.warning,
      title: "eBay Graded Prices",
      stat: "Powered by PokeTrace",
      desc: "For graded values we use real, recently-sold eBay prices for each grade (PSA 10/9, BGS, ACE, TAG, CGC), sourced through the PokeTrace market data API — actual sales, not guesses.",
    },
    {
      key: "cardmarket",
      icon: "earth",
      color: "#38BDF8",
      title: "Cardmarket (Europe)",
      stat: "European pricing",
      desc: "Cardmarket gives us European (EUR) prices, mainly for Japanese cards, converted automatically to your chosen currency.",
    },
    {
      key: "server",
      icon: "shield-checkmark",
      color: Colors.primary,
      title: "Secure Server & Your Data",
      stat: "Your history, kept safe",
      desc: "Your grades, history and card photos are stored securely so they survive reinstalls and device switches. Your data stays private to you.",
    },
    {
      key: "cost",
      icon: "speedometer",
      color: "#A78BFA",
      title: "AI Cost Tracking",
      stat: "Transparent by design",
      desc: "We measure the cost of every AI analysis behind the scenes. It keeps Grade.IQ sustainable and honest — so we always know the true cost of running the app for you.",
    },
  ];

  const roadmap: MapItem[] = [
    { key: "cn", icon: "language", color: "#FBBF24", title: "Chinese Card Database", status: "soon", summary: "Chinese cards & prices", desc: "Pricing and identification for Chinese Pokémon cards, joining English and Japanese." },
    { key: "kr", icon: "language", color: "#34D399", title: "Korean Card Database", status: "soon", summary: "Korean cards & prices", desc: "Full support for Korean cards and their market values." },
    { key: "accuracy", icon: "rocket", color: "#60A5FA", title: "Even Sharper Accuracy", status: "soon", summary: "Sharper grades over time", desc: "Ongoing improvements to grading accuracy, card detection and value estimates." },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>How Grade.IQ Works</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + webBottomInset + 48 }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroChip}>
            <Ionicons name="hardware-chip-outline" size={14} color={Colors.primary} />
            <Text style={styles.heroEyebrow}>Under the hood</Text>
          </View>
          <Text style={styles.heroTitle}>A live look at how your card{"\n"}gets graded</Text>
          <Text style={styles.heroSub}>
            Grade.IQ is built from a few powerful parts working together. Here's the whole machine — tap any part to learn what it does.
          </Text>
        </View>

        {/* Live stat strip */}
        <View style={styles.statStrip}>
          {statTiles.map((t) => {
            const v = approx(t.value);
            return (
              <View key={t.label} style={styles.statTile}>
                <Text style={styles.statNum}>{isLoading ? "…" : v ?? "—"}</Text>
                <Text style={styles.statLabel}>{t.label}</Text>
              </View>
            );
          })}
        </View>
        {!isLoading && approx(stats?.gradesCompleted) && (stats?.gradesCompleted ?? 0) > 0 && (
          <View style={styles.gradesBanner}>
            <Ionicons name="checkmark-done-circle" size={16} color={Colors.success} />
            <Text style={styles.gradesBannerTxt}>
              <Text style={styles.gradesBannerNum}>{approx(stats?.gradesCompleted)}</Text> cards graded so far
            </Text>
          </View>
        )}

        {/* Zone 1 — Journey */}
        <SectionHeader title="The journey of your card" subtitle="What happens from photo to grade" />
        <MapSection items={journey} variant="grade" />

        {/* Zone 2 — What powers it */}
        <SectionHeader title="What powers Grade.IQ" subtitle="The engines and data behind the app" />
        <MapSection items={powers} variant="primary" />

        {/* Zone 3 — Roadmap */}
        <SectionHeader title="On the roadmap" subtitle="What we're building next" />
        <MapSection items={roadmap} variant="dashed" />

        <Text style={styles.footer}>Built in the open, for the Pokémon card community.</Text>
      </ScrollView>
    </View>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSub}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text },
  content: { paddingHorizontal: 20 },

  hero: { paddingTop: 8, paddingBottom: 18, gap: 12 },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255, 60, 49, 0.12)",
  },
  heroEyebrow: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Colors.primary,
  },
  heroTitle: { fontFamily: "Inter_700Bold", fontSize: 26, lineHeight: 32, color: Colors.text },
  heroSub: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21, color: Colors.textSecondary },

  statStrip: { flexDirection: "row", gap: 10, marginBottom: 12 },
  statTile: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 4,
  },
  statNum: { fontFamily: "Inter_700Bold", fontSize: 19, color: Colors.text },
  statLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textMuted, textAlign: "center" },

  gradesBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  gradesBannerTxt: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.textSecondary },
  gradesBannerNum: { fontFamily: "Inter_700Bold", color: Colors.text },

  sectionHeader: { marginTop: 28, marginBottom: 16 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text },
  sectionSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textMuted, marginTop: 3 },

  mapBody: { position: "relative" },
  spineLine: { position: "absolute", left: SPINE_CENTER - 1.25, top: SPINE_CENTER, width: 2.5, borderRadius: 2 },
  spineDashed: {
    position: "absolute",
    left: SPINE_CENTER - 1,
    top: SPINE_CENTER,
    width: 0,
    borderLeftWidth: 2,
    borderStyle: "dashed",
    borderColor: Colors.surfaceBorder,
  },
  pulseDot: {
    position: "absolute",
    left: SPINE_CENTER - 5,
    top: SPINE_CENTER - 5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
    shadowColor: "#FF3C31",
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },

  row: { flexDirection: "row", alignItems: "flex-start" },
  nodeCol: { width: NODE, alignItems: "center" },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    borderWidth: 2,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeContent: { flex: 1, marginLeft: 14 },

  nodeCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 14,
  },
  soonCard: { opacity: 0.9 },
  nodeTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  nodeTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: Colors.text, flex: 1 },
  nodeTeaser: { fontFamily: "Inter_600SemiBold", fontSize: 13, marginTop: 7 },
  nodeBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 20,
    color: Colors.textSecondary,
    marginTop: 10,
  },

  soonPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
  },
  soonPillTxt: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: Colors.warning },

  liveTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  liveTxt: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: Colors.success },

  footer: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 32,
  },
});
