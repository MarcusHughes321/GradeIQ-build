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

const ACCENT = "#10B981";
const ACCENT_DIM = "rgba(16, 185, 129, 0.12)";
const ACCENT_BORDER = "rgba(16, 185, 129, 0.2)";

const STEPS = [
  {
    num: "1",
    title: "Add Up to 20 Cards",
    desc: "Select cards from your library or take photos of each. Front and back required per card.",
  },
  {
    num: "2",
    title: "Run in Parallel",
    desc: "All cards are graded simultaneously — no waiting for one to finish before the next starts.",
  },
  {
    num: "3",
    title: "Review Results",
    desc: "See a summary with average grade and tap any card for its full detailed breakdown.",
  },
];

const FEATURES = [
  {
    icon: "layers-outline" as const,
    title: "Up to 20 Cards at Once",
    desc: "Grade an entire binder page or collection batch in a single session.",
  },
  {
    icon: "flash-outline" as const,
    title: "Parallel Processing",
    desc: "Cards are analysed simultaneously, so 20 cards takes roughly the same time as 1.",
  },
  {
    icon: "bar-chart-outline" as const,
    title: "Average Grade Summary",
    desc: "Get an at-a-glance average grade for the full batch to gauge overall collection quality.",
  },
  {
    icon: "list-outline" as const,
    title: "Full Per-Card Detail",
    desc: "Tap any card in the results to see its full centering, corners, edges, and surface breakdown.",
  },
];

export default function BulkInfoScreen() {
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
        <Text style={styles.headerTitle}>Bulk Grading</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + webBottomInset + 30 }]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      >
        <View style={styles.heroSection}>
          <LinearGradient colors={["#10B981", "#059669"]} style={styles.heroBadge}>
            <Ionicons name="layers" size={32} color="#fff" />
          </LinearGradient>
          <Text style={styles.heroTitle}>Grade Your Whole Collection</Text>
          <Text style={styles.heroSubtitle}>
            Grade up to 20 cards in one session. All analysed in parallel — results in seconds, not minutes.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>How It Works</Text>
        <View style={styles.stepsCard}>
          {STEPS.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <LinearGradient colors={["#10B981", "#059669"]} style={styles.stepNumBadge}>
                <Text style={styles.stepNumText}>{step.num}</Text>
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDesc}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Why Bulk Grade?</Text>
        {FEATURES.map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <View style={styles.featureIconWrap}>
              <Ionicons name={f.icon} size={20} color={ACCENT} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureDesc}>{f.desc}</Text>
            </View>
          </View>
        ))}

        <Pressable
          onPress={() => {
            router.back();
            setTimeout(() => router.push("/paywall"), 300);
          }}
          style={({ pressed }) => [styles.upgradeBtn, { opacity: pressed ? 0.85 : 1 }]}
        >
          <LinearGradient
            colors={["#10B981", "#059669"]}
            style={styles.upgradeBtnGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name="diamond" size={18} color="#fff" />
            <Text style={styles.upgradeBtnText}>Upgrade to Unlock Bulk Grade</Text>
          </LinearGradient>
        </Pressable>

        <Text style={styles.pricingNote}>
          Available on Grade Enthusiast (£5.99/mo) and Grade Obsessed (£9.99/mo) plans.
        </Text>
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
    gap: 16,
  },
  heroSection: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 12,
  },
  heroBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
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
  comparisonCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  compRow: {
    flexDirection: "row",
  },
  compCol: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  compColTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 4,
  },
  compDetail: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  compDivider: {
    width: 1,
    backgroundColor: Colors.surfaceBorder,
    marginHorizontal: 12,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
    marginTop: 4,
  },
  stepsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: ACCENT_BORDER,
    gap: 14,
  },
  stepRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  stepNumBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: "#fff",
  },
  stepTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  stepDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginTop: 2,
  },
  featureRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: ACCENT_DIM,
    alignItems: "center",
    justifyContent: "center",
  },
  featureTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  featureDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginTop: 2,
  },
  upgradeBtn: {
    marginTop: 8,
    borderRadius: 16,
    overflow: "hidden",
  },
  upgradeBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  upgradeBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
  },
  pricingNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 16,
  },
});
