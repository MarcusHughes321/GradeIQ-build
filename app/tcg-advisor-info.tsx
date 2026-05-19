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

const ACCENT = "#F59E0B";
const ACCENT_DIM = "rgba(245, 158, 11, 0.12)";
const ACCENT_BORDER = "rgba(245, 158, 11, 0.2)";

const FEATURES = [
  {
    icon: "chatbubbles-outline" as const,
    title: "Ask Anything",
    desc: "Chat naturally about any Pokémon card — condition, value, whether it's worth grading, or how it compares to similar cards.",
  },
  {
    icon: "trending-up-outline" as const,
    title: "Real Market Prices",
    desc: "Get live PSA 10, BGS 9.5, ACE 10, TAG 10, and CGC 10 eBay sold prices alongside raw TCGPlayer values — all in one answer.",
  },
  {
    icon: "calculator-outline" as const,
    title: "Grading Economics",
    desc: "Instantly see whether grading fees are worth it. The advisor calculates profit margins and payback thresholds for you.",
  },
  {
    icon: "images-outline" as const,
    title: "Card Recognition",
    desc: "Mention a card by name and the advisor finds it automatically — including alt arts, secret rares, and Japanese variants.",
  },
  {
    icon: "volume-medium-outline" as const,
    title: "Voice Responses",
    desc: "Tap Listen on any reply to hear it read aloud with a natural AI voice. Pause, resume, or stop at any time.",
  },
  {
    icon: "mic-outline" as const,
    title: "Voice Input",
    desc: "Tap the microphone to speak your question. The app transcribes your voice and sends it automatically.",
  },
];

const PRICING = [
  { name: "Free",             price: "Free",  access: "No access",      color: Colors.textMuted, highlight: false },
  { name: "Grade Curious",    price: "£2.99", access: "Full access",    color: "#60A5FA",        highlight: false },
  { name: "Grade Enthusiast", price: "£5.99", access: "Full access",    color: "#34D399",        highlight: true  },
  { name: "Grade Obsessed",   price: "£9.99", access: "Full access",    color: ACCENT,           highlight: false },
];

export default function TcgAdvisorInfoScreen() {
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
        <Text style={styles.headerTitle}>TCG Advisor</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + webBottomInset + 30 }]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      >
        <View style={styles.heroSection}>
          <LinearGradient colors={["#F59E0B", "#D97706"]} style={styles.heroBadge}>
            <Ionicons name="chatbubbles" size={32} color="#fff" />
          </LinearGradient>
          <View style={styles.proPill}>
            <Ionicons name="sparkles" size={11} color={ACCENT} />
            <Text style={styles.proPillText}>PRO FEATURE</Text>
          </View>
          <Text style={styles.heroTitle}>Your Pokémon Card Expert</Text>
          <Text style={styles.heroSubtitle}>
            Ask any question about card values, grading economics, or investment potential — and get a straight, data-driven answer in seconds.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>What You Can Ask</Text>
        <View style={styles.examplesCard}>
          {[
            "Is my Charizard VSTAR worth grading?",
            "Compare PSA 10 vs raw for Umbreon VMAX alt art",
            "What's the best card to grade right now under £50?",
            "Is a BGS 9.5 worth crossing to PSA?",
          ].map((q, i) => (
            <View key={i} style={styles.exampleRow}>
              <Ionicons name="chatbubble-ellipses-outline" size={14} color={ACCENT} style={{ marginTop: 2 }} />
              <Text style={styles.exampleText}>"{q}"</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Features</Text>
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

        <Text style={styles.sectionTitle}>Plans</Text>
        <View style={styles.pricingTable}>
          {PRICING.map((row, i) => (
            <View
              key={i}
              style={[
                styles.pricingRow,
                row.highlight && styles.pricingRowHighlight,
                i === PRICING.length - 1 && { borderBottomWidth: 0 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.pricingTierName, row.highlight && { color: Colors.text }]}>{row.name}</Text>
                <Text style={styles.pricingTierPrice}>{row.price}/mo</Text>
              </View>
              <View style={[
                styles.pricingBadge,
                { backgroundColor: row.highlight ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.05)" },
              ]}>
                <Text style={[styles.pricingBadgeText, { color: row.color }]}>{row.access}</Text>
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
            colors={["#F59E0B", "#D97706"]}
            style={styles.upgradeBtnGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name="sparkles" size={18} color="#fff" />
            <Text style={styles.upgradeBtnText}>Unlock TCG Advisor</Text>
          </LinearGradient>
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.maybeLaterBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={styles.maybeLaterText}>Maybe later</Text>
        </Pressable>
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
    gap: 10,
  },
  heroBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  proPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: ACCENT_DIM,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: ACCENT_BORDER,
  },
  proPillText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: ACCENT,
    letterSpacing: 0.5,
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
    lineHeight: 21,
    paddingHorizontal: 10,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
    marginTop: 4,
  },
  examplesCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: ACCENT_BORDER,
    gap: 12,
  },
  exampleRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  exampleText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
    flex: 1,
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
    flexShrink: 0,
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
    minWidth: 90,
    alignItems: "center",
  },
  pricingBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
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
  maybeLaterBtn: {
    alignItems: "center",
    paddingVertical: 4,
  },
  maybeLaterText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
});
