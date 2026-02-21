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

const FEATURES = [
  {
    icon: "camera-outline" as const,
    title: "12-Photo Capture",
    desc: "Front, back, angled shots, and 8 corner close-ups for maximum detail.",
  },
  {
    icon: "eye-outline" as const,
    title: "AI Corner Inspection",
    desc: "Close-up photos let the AI detect micro-whitening, dents, and edge wear invisible in full-card shots.",
  },
  {
    icon: "sparkles-outline" as const,
    title: "Enhanced Image Processing",
    desc: "Server-side sharpening, contrast boosting, and brightness adjustment reveal hidden flaws.",
  },
  {
    icon: "analytics-outline" as const,
    title: "Premium Accuracy",
    desc: "Deep Grade analyses up to 16 images per card, delivering the most precise AI grade possible.",
  },
];

const STEPS = [
  { num: "1-2", title: "Full Card Shots", desc: "Front and back photos capture overall condition, centering, and surface." },
  { num: "3-4", title: "Angled Shots", desc: "Front and back at an angle to reveal surface scratches, holo patterns, and texture." },
  { num: "5-8", title: "Front Corner Close-ups", desc: "Hold your phone close to each front corner. The AI inspects for whitening, peeling, and dings." },
  { num: "9-12", title: "Back Corner Close-ups", desc: "Same for the back. Catches edge wear and corner damage that full photos miss." },
];

export default function DeepGradeInfoScreen() {
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
        <Text style={styles.headerTitle}>Deep Grade</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + webBottomInset + 30 }]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      >
        <View style={styles.heroSection}>
          <LinearGradient
            colors={["#F59E0B", "#D97706"]}
            style={styles.heroBadge}
          >
            <Ionicons name="search" size={32} color="#fff" />
          </LinearGradient>
          <Text style={styles.heroTitle}>The Ultimate AI Grade</Text>
          <Text style={styles.heroSubtitle}>
            Deep Grade captures your card from every angle, giving the AI 6x more data to deliver the most accurate grade estimate possible.
          </Text>
        </View>

        <View style={styles.comparisonCard}>
          <View style={styles.compRow}>
            <View style={styles.compCol}>
              <Ionicons name="flash" size={18} color={Colors.textSecondary} />
              <Text style={styles.compColTitle}>Quick Grade</Text>
              <Text style={styles.compDetail}>2 photos</Text>
              <Text style={styles.compDetail}>Standard analysis</Text>
              <Text style={styles.compDetail}>Fast results</Text>
            </View>
            <View style={styles.compDivider} />
            <View style={styles.compCol}>
              <Ionicons name="search" size={18} color="#F59E0B" />
              <Text style={[styles.compColTitle, { color: "#F59E0B" }]}>Deep Grade</Text>
              <Text style={styles.compDetail}>12 photos</Text>
              <Text style={styles.compDetail}>Corner-level inspection</Text>
              <Text style={styles.compDetail}>Premium accuracy</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>How It Works</Text>
        <View style={styles.stepsCard}>
          {STEPS.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <LinearGradient colors={["#F59E0B", "#D97706"]} style={styles.stepNumBadge}>
                <Text style={styles.stepNumText}>{step.num}</Text>
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDesc}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Why Deep Grade?</Text>
        {FEATURES.map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <View style={styles.featureIconWrap}>
              <Ionicons name={f.icon} size={20} color="#F59E0B" />
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
            colors={["#F59E0B", "#D97706"]}
            style={styles.upgradeBtnGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name="diamond" size={18} color="#fff" />
            <Text style={styles.upgradeBtnText}>Upgrade to Unlock Deep Grade</Text>
          </LinearGradient>
        </Pressable>

        <Text style={styles.pricingNote}>
          Available on Grade Curious (£2.99/mo), Grade Enthusiast (£5.99/mo), and Grade Obsessed (£9.99/mo) plans.
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
    borderColor: "rgba(245, 158, 11, 0.2)",
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
    backgroundColor: "rgba(245, 158, 11, 0.12)",
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
