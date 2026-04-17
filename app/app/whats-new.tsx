import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";

const APP_VERSION = "1.0.7";

const RELEASES: {
  version: string;
  date: string;
  items: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; desc: string }[];
}[] = [
  {
    version: "1.0.7",
    date: "April 2026",
    items: [
      {
        icon: "trophy-outline",
        color: "#F59E0B",
        title: "Top Grading Picks",
        desc: "A curated feed of cards worth grading right now, ranked by profit potential. Each pick shows raw vs graded prices, estimated profit, and how quickly that grade sells.",
      },
      {
        icon: "cash-outline",
        color: "#10B981",
        title: "Profit Analysis",
        desc: "Tap any card to see real eBay sold prices for every grade — PSA, BGS, ACE, TAG and CGC — with 30-day averages, price ranges, and a trend sparkline.",
      },
      {
        icon: "water-outline",
        color: "#3B82F6",
        title: "Liquidity Scores",
        desc: "See how easily each grade sells. Tap a grade row and the liquidity bar, rating band and sale count all update to reflect that specific grade.",
      },
      {
        icon: "albums-outline",
        color: "#8B5CF6",
        title: "Set Browser",
        desc: "Browse any set and see live TCGPlayer prices per card, including Holo, Reverse Holo and Non-Holo variants side by side.",
      },
    ],
  },
  {
    version: "1.0.6",
    date: "March 2026",
    items: [
      {
        icon: "git-compare-outline",
        color: "#8B5CF6",
        title: "Crossover Monthly Limits",
        desc: "Crossover grading is now available on all paid tiers — 10 per month on Curious, 25 on Enthusiast, and unlimited on Obsessed.",
      },
      {
        icon: "shield-checkmark-outline",
        color: "#F59E0B",
        title: "Subscription Fixes",
        desc: "Improved subscription detection after purchase, with smarter retry logic to prevent false 'free tier' downgrades.",
      },
    ],
  },
  {
    version: "1.0.5",
    date: "February 2026",
    items: [
      {
        icon: "layers-outline",
        color: "#FF3C31",
        title: "Background Grading",
        desc: "Grade cards while browsing the rest of the app. A status banner on the Home tab keeps you updated.",
      },
      {
        icon: "cube-outline",
        color: "#F59E0B",
        title: "Deep Grade Mode",
        desc: "Submit up to 12 photos — front, back, angled shots, and 8 corner close-ups — for the highest accuracy analysis.",
      },
      {
        icon: "people-outline",
        color: "#10B981",
        title: "Bulk Grading",
        desc: "Grade up to 20 cards at once with parallel processing and average grade summaries.",
      },
    ],
  },
];

export default function WhatsNewScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>What's New</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + webBottomInset + 40 }]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      >
        <View style={styles.heroSection}>
          <LinearGradient colors={["#8B5CF6", "#6D28D9"]} style={styles.heroBadge}>
            <Ionicons name="sparkles" size={28} color="#fff" />
          </LinearGradient>
          <Text style={styles.heroTitle}>Version {APP_VERSION}</Text>
          <Text style={styles.heroSubtitle}>
            New features and improvements to make grading faster and smarter.
          </Text>
        </View>

        {RELEASES.map((release, ri) => (
          <View key={release.version} style={styles.releaseBlock}>
            <View style={styles.releaseHeader}>
              <View style={[styles.versionPill, ri === 0 && styles.versionPillLatest]}>
                <Text style={[styles.versionPillText, ri === 0 && styles.versionPillTextLatest]}>
                  v{release.version}
                </Text>
                {ri === 0 && (
                  <View style={styles.latestBadge}>
                    <Text style={styles.latestBadgeText}>Latest</Text>
                  </View>
                )}
              </View>
              <Text style={styles.releaseDate}>{release.date}</Text>
            </View>

            <View style={styles.itemsCard}>
              {release.items.map((item, i) => (
                <View key={i} style={[styles.itemRow, i < release.items.length - 1 && styles.itemRowBorder]}>
                  <View style={[styles.itemIconWrap, { backgroundColor: item.color + "18" }]}>
                    <Ionicons name={item.icon} size={20} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemDesc}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  scroll: {
    paddingHorizontal: 20,
    gap: 24,
  },
  heroSection: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 10,
  },
  heroBadge: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
    textAlign: "center",
  },
  heroSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  releaseBlock: {
    gap: 10,
  },
  releaseHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  versionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  versionPillLatest: {
    backgroundColor: "rgba(139, 92, 246, 0.12)",
    borderColor: "rgba(139, 92, 246, 0.3)",
  },
  versionPillText: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  versionPillTextLatest: {
    color: "#8B5CF6",
  },
  latestBadge: {
    backgroundColor: "#8B5CF6",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  latestBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    color: "#fff",
    letterSpacing: 0.3,
  },
  releaseDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  itemsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    padding: 14,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  itemIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  itemTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 3,
  },
  itemDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
});
