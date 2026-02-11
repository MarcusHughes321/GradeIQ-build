import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { useSubscription } from "@/lib/subscription";

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { dailyLimit } = useSubscription();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const handleSubscribe = async () => {
    router.back();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset, paddingBottom: insets.bottom + webBottomInset }]}>
      <Pressable style={styles.closeBtn} onPress={() => router.back()}>
        <Ionicons name="close" size={28} color={Colors.textSecondary} />
      </Pressable>

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconGradient}
          >
            <Ionicons name="diamond" size={48} color="#fff" />
          </LinearGradient>
        </View>

        <Text style={styles.title}>
          Grade.<Text style={{ color: Colors.primary }}>IQ</Text> Pro
        </Text>
        <Text style={styles.subtitle}>
          You've used all {dailyLimit} free grades for today
        </Text>

        <View style={styles.features}>
          {[
            { icon: "infinite-outline" as const, text: "Unlimited card gradings" },
            { icon: "flash-outline" as const, text: "Priority analysis speed" },
            { icon: "layers-outline" as const, text: "Bulk grading up to 20 cards" },
            { icon: "analytics-outline" as const, text: "Full portfolio tracking" },
          ].map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={f.icon} size={20} color={Colors.primary} />
              </View>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.priceCard}>
          <Text style={styles.priceLabel}>Monthly</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceAmount}>£2.99</Text>
            <Text style={styles.pricePeriod}>/month</Text>
          </View>
          <Text style={styles.priceNote}>Cancel anytime</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.subscribeBtn, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
          onPress={handleSubscribe}
        >
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.subscribeBtnGradient}
          >
            <Text style={styles.subscribeBtnText}>Subscribe Now</Text>
          </LinearGradient>
        </Pressable>

        <Text style={styles.restoreText}>
          Restore Purchases
        </Text>

        <Text style={styles.freeNote}>
          {dailyLimit} free grades per day included with the free plan
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
  closeBtn: {
    position: "absolute",
    top: 60,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconWrap: {
    marginBottom: 24,
  },
  iconGradient: {
    width: 100,
    height: 100,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 32,
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 22,
  },
  features: {
    width: "100%",
    gap: 16,
    marginBottom: 32,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: Colors.text,
  },
  priceCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.primary + "40",
    paddingVertical: 20,
    paddingHorizontal: 24,
    width: "100%",
    alignItems: "center",
    marginBottom: 24,
  },
  priceLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  priceAmount: {
    fontFamily: "Inter_700Bold",
    fontSize: 36,
    color: Colors.text,
  },
  pricePeriod: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: Colors.textSecondary,
    marginLeft: 4,
  },
  priceNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
  },
  subscribeBtn: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 16,
  },
  subscribeBtnGradient: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  subscribeBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: "#fff",
  },
  restoreText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  freeNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
  },
});
