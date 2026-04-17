import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const SECTIONS = [
  {
    title: "Information We Collect",
    icon: "folder-open-outline" as const,
    body: `Grade.IQ collects the following information when you use the app:\n\n\u2022 Card images: Photos you take or upload are sent to our server for AI analysis. Images are processed in real-time and are not permanently stored on our servers after analysis is complete.\n\n\u2022 Grading history: Your grading results are stored locally on your device using AsyncStorage. This data never leaves your device unless you choose to share it.\n\n\u2022 Subscription data: If you subscribe, your purchase is handled entirely by Apple App Store or Google Play Store. We do not collect or store payment information.`,
  },
  {
    title: "How We Use Your Information",
    icon: "analytics-outline" as const,
    body: `We use the information collected solely for the following purposes:\n\n\u2022 To analyse your card images and provide estimated grades\n\u2022 To look up market pricing information for identified cards\n\u2022 To track your monthly usage against your plan limits\n\n We do not sell, rent, or share your personal information with third parties for marketing purposes.`,
  },
  {
    title: "Third-Party Services",
    icon: "globe-outline" as const,
    body: `Grade.IQ uses the following third-party services:\n\n\u2022 OpenAI: Card images are sent to OpenAI's API for AI-powered analysis. OpenAI's privacy policy applies to this data processing.\n\n\u2022 RevenueCat: Manages subscription status. RevenueCat's privacy policy applies.\n\n\u2022 Apple App Store / Google Play Store: Handles all payment processing for subscriptions.\n\n\u2022 TCGCSV / TCGPlayer: Used to retrieve publicly available market pricing data. No personal data is shared with these services.`,
  },
  {
    title: "Data Storage & Security",
    icon: "lock-closed-outline" as const,
    body: `Your grading history is stored locally on your device and is not backed up to our servers. If you delete the app, your grading history will be lost.\n\nCard images are transmitted securely to our server for analysis and are not retained after processing is complete.\n\nWe take reasonable measures to protect the security of your data during transmission and processing.`,
  },
  {
    title: "Children's Privacy",
    icon: "people-outline" as const,
    body: `Grade.IQ is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, please contact us so we can remove it.`,
  },
  {
    title: "Your Rights",
    icon: "hand-left-outline" as const,
    body: `You have the right to:\n\n\u2022 Delete your local grading history at any time through the app\n\u2022 Cancel your subscription at any time through your app store settings\n\u2022 Contact us with any privacy-related questions or concerns\n\nFor any privacy enquiries, please contact us at marceus.tcg@hotmail.com`,
  },
  {
    title: "Changes to This Policy",
    icon: "create-outline" as const,
    body: `We may update this privacy policy from time to time. Any changes will be reflected in the app with an updated date. Continued use of the app after changes constitutes acceptance of the revised policy.`,
  },
];

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
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
            <Ionicons name="lock-closed" size={32} color="#10B981" />
          </View>
          <Text style={styles.heroTitle}>Your Privacy Matters</Text>
          <Text style={styles.heroSubtitle}>
            We believe in transparency. Here's exactly how Grade.IQ handles your data.
          </Text>
        </View>

        {SECTIONS.map((section, idx) => (
          <View key={idx} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIcon}>
                <Ionicons name={section.icon} size={20} color="#10B981" />
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
    backgroundColor: "rgba(16, 185, 129, 0.12)",
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
    backgroundColor: "rgba(16, 185, 129, 0.1)",
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
