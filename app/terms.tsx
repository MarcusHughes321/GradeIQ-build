import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const SECTIONS = [
  {
    title: "AI-Generated Estimates",
    icon: "analytics-outline" as const,
    body: `Grade.IQ uses artificial intelligence to analyse images of your cards and provide estimated condition grades. These grades are estimates only and should not be treated as official or guaranteed grades.\n\nActual grades from professional grading companies may differ from our estimates due to factors including but not limited to: image quality, lighting conditions, physical defects not visible in photographs, and differences in grading standards between companies.\n\nGrade.IQ does not guarantee the accuracy of any estimated grade.`,
  },
  {
    title: "No Affiliation with Grading Companies",
    icon: "shield-checkmark-outline" as const,
    body: `Grade.IQ is an independent application. We are not affiliated with, endorsed by, licensed by, or partnered with any professional card grading company, including but not limited to:\n\n\u2022 PSA (Professional Sports Authenticator)\n\u2022 Beckett Grading Services (BGS)\n\u2022 Ace Grading\n\u2022 TAG Grading\n\u2022 CGC Cards\n\nAll grading company names, logos, and grading scales are trademarks of their respective owners and are used here solely for informational and descriptive purposes under nominative fair use.`,
  },
  {
    title: "Market Price Estimates",
    icon: "cash-outline" as const,
    body: `Market values displayed in the app are estimates based on publicly available pricing data. These values may not reflect current market conditions and should not be relied upon for buying or selling decisions.\n\nActual sale prices may vary significantly based on market demand, card condition, buyer and seller preferences, and other factors outside our control.`,
  },
  {
    title: "Intellectual Property",
    icon: "document-text-outline" as const,
    body: `Pokemon is a trademark of Nintendo, Creatures Inc., and GAME FREAK Inc. The Pokemon Company International manages the Pokemon brand outside of Asia.\n\nGrade.IQ is an independent tool for collectors and is not produced by, endorsed by, or associated with Nintendo, The Pokemon Company, or any of their affiliates.\n\nAll card images analysed by Grade.IQ are user-provided photographs of their own cards.`,
  },
  {
    title: "Limitation of Liability",
    icon: "alert-circle-outline" as const,
    body: `Grade.IQ is provided "as is" without warranty of any kind, express or implied. We do not accept liability for any loss, damage, or expense arising from reliance on grades, valuations, or any other information provided by this app.\n\nBy using Grade.IQ, you acknowledge that AI-estimated grades are approximations and agree not to hold Grade.IQ responsible for any discrepancy between our estimates and actual professional grading results.`,
  },
  {
    title: "Subscriptions & Auto-Renewal",
    icon: "card-outline" as const,
    body: `Grade.IQ offers the following auto-renewable subscription plans:\n\n\u2022 Grade Curious — £2.99/month (15 Quick Grades + 2 Deep Grades)\n\u2022 Grade Enthusiast — £5.99/month (50 Quick Grades + 7 Deep Grades)\n\u2022 Grade Obsessed — £9.99/month (Unlimited Quick Grades + 30 Deep Grades)\n\nPayment is charged to your Apple ID or Google Play account at confirmation of purchase. Subscriptions automatically renew each month unless cancelled at least 24 hours before the end of the current billing period. Your account will be charged for renewal within 24 hours prior to the end of the current period at the same price.\n\nYou can manage or cancel your subscription at any time by going to your account settings in the App Store or Google Play Store. Cancellation takes effect at the end of the current billing period — you will retain access until then.\n\nFree trial periods, if offered, will automatically convert to a paid subscription unless cancelled before the trial ends. Any unused portion of a free trial is forfeited upon purchasing a subscription.`,
  },
];

export default function TermsScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Terms & Disclaimer</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + webBottomInset + 40 }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      >
        <View style={styles.heroSection}>
          <View style={styles.heroIcon}>
            <Ionicons name="shield-checkmark" size={32} color={Colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Legal & Disclaimer</Text>
          <Text style={styles.heroSubtitle}>
            Please read the following information carefully. By using Grade.IQ, you agree to these terms.
          </Text>
        </View>

        {SECTIONS.map((section, idx) => (
          <View key={idx} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIcon}>
                <Ionicons name={section.icon} size={20} color={Colors.primary} />
              </View>
              <Text style={styles.cardTitle}>{section.title}</Text>
            </View>
            <Text style={styles.cardBody}>{section.body}</Text>
          </View>
        ))}

        <Text style={styles.lastUpdated}>Last updated: February 2026</Text>
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
    paddingVertical: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  content: {
    paddingHorizontal: 20,
  },
  heroSection: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 12,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255, 60, 49, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  heroTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: Colors.text,
  },
  heroSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255, 60, 49, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
    flex: 1,
  },
  cardBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  lastUpdated: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 16,
  },
});
