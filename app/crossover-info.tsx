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

const ACCENT = "#8B5CF6";
const ACCENT_DIM = "rgba(139, 92, 246, 0.12)";
const ACCENT_BORDER = "rgba(139, 92, 246, 0.2)";

const STEPS = [
  {
    num: "1",
    title: "Photograph the Slab",
    desc: "Take a photo of the front of the graded slab. Adding the back photo gives the AI more data.",
  },
  {
    num: "2",
    title: "AI Reads the Label",
    desc: "The AI reads the grading company and grade directly from the slab label — no manual entry needed.",
  },
  {
    num: "3",
    title: "Get Crossover Estimates",
    desc: "Receive estimated grades from PSA, BGS, ACE, TAG, and CGC with per-company analysis.",
  },
];

const FEATURES = [
  {
    icon: "git-compare-outline" as const,
    title: "5-Company Coverage",
    desc: "See how your card would likely grade at PSA, Beckett, ACE, TAG, and CGC in one analysis.",
  },
  {
    icon: "eye-outline" as const,
    title: "Standard-Aware Analysis",
    desc: "The AI knows each company's specific standards — BGS sub-grades, TAG's strict surface rules, and PSA's centering tolerances.",
  },
  {
    icon: "trending-up-outline" as const,
    title: "Informed Decisions",
    desc: "Know before you send whether it's worth crossing over to a different company.",
  },
  {
    icon: "shield-checkmark-outline" as const,
    title: "Company-Specific Notes",
    desc: "Each grade comes with a note on which attribute (corners, surface, centering) drives any difference.",
  },
];

export default function CrossoverInfoScreen() {
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
        <Text style={styles.headerTitle}>Crossover Grading</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + webBottomInset + 30 }]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      >
        <View style={styles.heroSection}>
          <LinearGradient colors={["#8B5CF6", "#7C3AED"]} style={styles.heroBadge}>
            <Ionicons name="swap-horizontal" size={32} color="#fff" />
          </LinearGradient>
          <Text style={styles.heroTitle}>Know Before You Send</Text>
          <Text style={styles.heroSubtitle}>
            Photograph any graded slab and instantly see how the card would likely grade at every other major company.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>How It Works</Text>
        <View style={styles.stepsCard}>
          {STEPS.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <LinearGradient colors={["#8B5CF6", "#7C3AED"]} style={styles.stepNumBadge}>
                <Text style={styles.stepNumText}>{step.num}</Text>
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDesc}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Why Crossover?</Text>
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

        <Text style={styles.sectionTitle}>Crossover Grades per Month</Text>
        <View style={styles.pricingTable}>
          {[
            { name: "Free",             price: "Free",   crossovers: "0",         color: Colors.textMuted },
            { name: "Grade Curious",    price: "£2.99",  crossovers: "10",        color: "#60A5FA" },
            { name: "Grade Enthusiast", price: "£5.99",  crossovers: "25",        color: "#34D399", highlight: true },
            { name: "Grade Obsessed",   price: "£9.99",  crossovers: "Unlimited", color: "#F59E0B" },
          ].map((row, i) => (
            <View key={i} style={[styles.pricingRow, row.highlight && styles.pricingRowHighlight]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.pricingTierName, row.highlight && { color: Colors.text }]}>{row.name}</Text>
                <Text style={styles.pricingTierPrice}>{row.price}/mo</Text>
              </View>
              <View style={[styles.pricingBadge, { backgroundColor: row.highlight ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.05)" }]}>
                <Text style={[styles.pricingBadgeText, { color: row.crossovers === "0" ? Colors.textMuted : row.color }]}>
                  {row.crossovers}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => {
            router.back();
            setTimeout(() => router.push("/paywall"), 300);
          }}
          style={({ pressed }) => [styles.upgradeBtn, { opacity: pressed ? 0.85 : 1 }]}
        >
          <LinearGradient
            colors={["#8B5CF6", "#7C3AED"]}
            style={styles.upgradeBtnGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name="diamond" size={18} color="#fff" />
            <Text style={styles.upgradeBtnText}>Upgrade to Unlock Crossover</Text>
          </LinearGradient>
        </Pressable>

        <Text style={styles.pricingNote}>
          Crossover limits reset on the 1st of each month. Unused grades do not carry over.
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
  pricingTable: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ACCENT_BORDER,
    overflow: "hidden",
  },
  pricingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  pricingRowHighlight: {
    backgroundColor: "rgba(52, 211, 153, 0.06)",
  },
  pricingTierName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  pricingTierPrice: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  pricingBadge: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    minWidth: 80,
    alignItems: "center",
  },
  pricingBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
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
