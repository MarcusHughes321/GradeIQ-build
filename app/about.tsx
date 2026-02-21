import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Linking } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import Colors from "@/constants/colors";

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>About Grade.IQ</Text>
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
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>Grade</Text>
            <Text style={styles.logoDot}>.</Text>
            <Text style={styles.logoIQ}>IQ</Text>
          </View>
          <Text style={styles.tagline}>Pre-grade smarter. Save money. Know your cards.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <Ionicons name="heart" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.cardTitle}>Built for the Community</Text>
          </View>
          <Text style={styles.cardBody}>
            Grade.IQ was born from a simple idea: what if collectors could get an estimate of their card's grade before spending money on professional grading?
          </Text>
          <Text style={[styles.cardBody, { marginTop: 10 }]}>
            As a fellow Pokemon card collector and grader, I know how frustrating it is to send a card off for grading only to receive a lower grade than expected. Every submission costs money — and sometimes the grade comes back and the card wasn't even worth submitting.
          </Text>
          <Text style={[styles.cardBody, { marginTop: 10 }]}>
            Grade.IQ was built to help solve that problem. This app was made for the community, by a community member.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <Ionicons name="bulb" size={20} color="#F59E0B" />
            </View>
            <Text style={styles.cardTitle}>The Purpose</Text>
          </View>
          <Text style={styles.cardBody}>
            Grade.IQ is a pre-grading tool designed to help you make smarter decisions about which cards to submit for professional grading. It helps you:
          </Text>

          <View style={styles.purposeList}>
            <PurposeItem
              icon="search"
              text="Spot flaws you might have missed — surface scratches, edge whitening, centering issues"
            />
            <PurposeItem
              icon="analytics"
              text="Get AI-estimated grades across multiple grading companies so you can compare"
            />
            <PurposeItem
              icon="cash"
              text="Decide whether it's worth the grading cost before you send your card off"
            />
            <PurposeItem
              icon="trending-up"
              text="Estimate market values for different grade outcomes"
            />
          </View>

          <Text style={[styles.cardBody, { marginTop: 12 }]}>
            It's designed to complement professional grading, not replace it. Think of it as your second opinion before you commit to a submission.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <Ionicons name="people" size={20} color="#10B981" />
            </View>
            <Text style={styles.cardTitle}>Credits</Text>
          </View>
          <Text style={styles.cardBody}>
            Grade.IQ started as a vision — the idea that AI could help everyday collectors make better grading decisions and save money in the process.
          </Text>

          <View style={styles.creditSection}>
            <View style={styles.marceusLogoWrap}>
              <Image
                source={require("@/assets/images/marceus-logo.png")}
                style={styles.marceusLogo}
                contentFit="contain"
              />
            </View>

            <View style={styles.logoDivider} />

            <View style={styles.creditRow}>
              <View style={styles.creditIcon}>
                <Ionicons name="eye" size={18} color={Colors.primary} />
              </View>
              <View style={styles.creditInfo}>
                <Text style={styles.creditRole}>The Vision</Text>
                <Text style={styles.creditName}>Marceus.tcg — a passionate collector and grader who saw a gap in the market and imagined something better for the community.</Text>
              </View>
            </View>

            <Pressable
              onPress={() => Linking.openURL("https://instagram.com/marceus.tcg")}
              style={({ pressed }) => [styles.socialLink, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Ionicons name="logo-instagram" size={16} color="#E1306C" />
              <Text style={styles.socialText}>@marceus.tcg</Text>
            </Pressable>

            <View style={styles.creditDivider} />

            <View style={styles.creditRow}>
              <View style={styles.creditIcon}>
                <Ionicons name="code-slash" size={18} color="#A78BFA" />
              </View>
              <View style={styles.creditInfo}>
                <Text style={styles.creditRole}>The Builder</Text>
                <Text style={styles.creditName}>Replit Agent (Claude) — an AI developer that turned the vision into reality, designing and building every feature of this app from the ground up.</Text>
              </View>
            </View>
          </View>

          <Text style={[styles.cardBody, { marginTop: 12, fontStyle: "italic" }]}>
            One had the dream, the other had the code. Together, they built Grade.IQ for collectors everywhere.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <Ionicons name="rocket" size={20} color="#60A5FA" />
            </View>
            <Text style={styles.cardTitle}>What's Next</Text>
          </View>
          <Text style={styles.cardBody}>
            Grade.IQ is constantly evolving. We're always working on improving accuracy, adding new features, and making the grading experience even better for the community. Your feedback shapes what we build next.
          </Text>
        </View>

        <Text style={styles.footer}>
          Made with passion for the Pokemon card community
        </Text>
      </ScrollView>
    </View>
  );
}

function PurposeItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.purposeRow}>
      <View style={styles.purposeIcon}>
        <Ionicons name={icon as any} size={16} color={Colors.primary} />
      </View>
      <Text style={styles.purposeText}>{text}</Text>
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
    paddingVertical: 28,
    gap: 14,
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  logoText: {
    fontFamily: "Inter_700Bold",
    fontSize: 36,
    color: Colors.text,
  },
  logoDot: {
    fontFamily: "Inter_700Bold",
    fontSize: 36,
    color: Colors.primary,
  },
  logoIQ: {
    fontFamily: "Inter_700Bold",
    fontSize: 36,
    color: Colors.primary,
  },
  tagline: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 20,
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
    backgroundColor: "rgba(255, 255, 255, 0.06)",
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
  purposeList: {
    marginTop: 14,
    gap: 12,
  },
  purposeRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  purposeIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(255, 60, 49, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  purposeText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
    flex: 1,
  },
  marceusLogoWrap: {
    alignItems: "center",
    marginBottom: 0,
  },
  logoDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    marginVertical: 14,
  },
  marceusLogo: {
    width: 120,
    height: 80,
    borderRadius: 12,
  },
  creditSection: {
    marginTop: 14,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 14,
  },
  creditRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  creditIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  creditInfo: {
    flex: 1,
    gap: 3,
  },
  creditRole: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: Colors.text,
  },
  creditName: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  creditDivider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: 12,
  },
  socialLink: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginTop: 8,
    marginLeft: 48,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "rgba(225, 48, 108, 0.1)",
    borderRadius: 8,
    alignSelf: "flex-start" as const,
  },
  socialText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#E1306C",
  },
  footer: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 16,
  },
});
