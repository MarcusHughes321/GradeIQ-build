import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getSettings } from "@/lib/settings";

const DISCLAIMER_KEY = "gradeiq_disclaimer_accepted";

export default function DisclaimerScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const handleAccept = async () => {
    await AsyncStorage.setItem(DISCLAIMER_KEY, "true");
    const settings = await getSettings();
    if (settings.enabledCompanies.length === 0) {
      router.replace("/company-select");
    } else {
      router.replace("/(tabs)");
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + webBottomInset + 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroSection}>
          <View style={styles.heroIcon}>
            <Ionicons name="shield-checkmark" size={40} color={Colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Before You Begin</Text>
          <Text style={styles.heroSubtitle}>
            Please review the following important information about Grade.IQ
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.bulletRow}>
            <Ionicons name="analytics-outline" size={20} color={Colors.primary} />
            <View style={styles.bulletContent}>
              <Text style={styles.bulletTitle}>AI-Estimated Grades</Text>
              <Text style={styles.bulletBody}>
                All grades provided by Grade.IQ are AI-generated estimates. They are not official grades and may differ from actual professional grading results.
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.bulletRow}>
            <Ionicons name="shield-outline" size={20} color={Colors.primary} />
            <View style={styles.bulletContent}>
              <Text style={styles.bulletTitle}>Independent App</Text>
              <Text style={styles.bulletBody}>
                Grade.IQ is not affiliated with, endorsed by, or partnered with PSA, Beckett (BGS), Ace Grading, TAG Grading, CGC Cards, or any other grading company.
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.bulletRow}>
            <Ionicons name="cash-outline" size={20} color={Colors.primary} />
            <View style={styles.bulletContent}>
              <Text style={styles.bulletTitle}>Price Estimates</Text>
              <Text style={styles.bulletBody}>
                Market values shown are estimates and may not reflect current market conditions. They should not be solely relied upon for buying or selling decisions.
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.bulletRow}>
            <Ionicons name="alert-circle-outline" size={20} color={Colors.primary} />
            <View style={styles.bulletContent}>
              <Text style={styles.bulletTitle}>No Warranty</Text>
              <Text style={styles.bulletBody}>
                Grade.IQ is provided "as is" without warranty. We accept no liability for decisions made based on our estimates.
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.trademark}>
          Pokemon is a trademark of Nintendo / Creatures Inc. / GAME FREAK Inc. All grading company names are trademarks of their respective owners.
        </Text>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, webBottomInset) + 16 }]}>
        <Pressable
          onPress={handleAccept}
          style={({ pressed }) => [styles.acceptBtn, { opacity: pressed ? 0.85 : 1 }]}
          testID="accept-disclaimer-btn"
        >
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
          <Text style={styles.acceptBtnText}>I Understand & Agree</Text>
        </Pressable>
        <Text style={styles.termsLink}>
          You can review these terms anytime in Settings
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  heroSection: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255, 60, 49, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  heroTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: Colors.text,
  },
  heroSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 14,
    paddingVertical: 4,
  },
  bulletContent: {
    flex: 1,
    gap: 4,
  },
  bulletTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  bulletBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: 14,
  },
  trademark: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 16,
    marginTop: 20,
    paddingHorizontal: 12,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    alignItems: "center",
    gap: 10,
  },
  acceptBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    width: "100%",
  },
  acceptBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
  },
  termsLink: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
});
