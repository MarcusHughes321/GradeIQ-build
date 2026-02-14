import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Alert, ActivityIndicator, ScrollView } from "react-native";
import { router, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { useSubscription, TIERS, type SubscriptionTier } from "@/lib/subscription";

const TIER_CARDS: { tier: SubscriptionTier; highlight?: boolean; icon: keyof typeof Ionicons.glyphMap; features: string[] }[] = [
  {
    tier: "curious",
    icon: "sparkles-outline",
    features: ["15 Quick Grades per month", "2 Deep Grades per month", "Full AI analysis", "Market price estimates"],
  },
  {
    tier: "enthusiast",
    highlight: true,
    icon: "flame-outline",
    features: ["50 Quick Grades per month", "7 Deep Grades per month", "Full AI analysis", "Market price estimates", "Bulk grading up to 20 cards"],
  },
  {
    tier: "obsessed",
    icon: "diamond-outline",
    features: ["Unlimited Quick Grades", "30 Deep Grades per month", "Full AI analysis", "Market price estimates", "Bulk grading up to 20 cards", "Priority support"],
  },
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { purchaseTier, restorePurchases, rcConfigured, remainingGrades, currentTier } = useSubscription();
  const [purchasing, setPurchasing] = useState(false);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>("enthusiast");
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const handleSubscribe = async (tier: SubscriptionTier) => {
    if (!rcConfigured) {
      Alert.alert("Not Available", "Subscriptions are not yet configured. Please check back later.");
      return;
    }
    setPurchasing(true);
    try {
      const success = await purchaseTier(tier);
      if (success) {
        router.back();
      }
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    if (!rcConfigured) {
      Alert.alert("Not Available", "Subscriptions are not yet configured. Please check back later.");
      return;
    }
    setPurchasing(true);
    try {
      const success = await restorePurchases();
      if (success) {
        Alert.alert("Restored", "Your subscription has been restored.");
        router.back();
      } else {
        Alert.alert("No Subscription Found", "We couldn't find an active subscription for your account.");
      }
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setPurchasing(false);
    }
  };

  const limitMessage = currentTier === "free"
    ? `You've used all ${TIERS.free.monthlyLimit} free grades this month`
    : `You've used all ${TIERS[currentTier].monthlyLimit} grades this month`;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset, paddingBottom: insets.bottom + webBottomInset }]}>
      <Pressable style={[styles.closeBtn, { top: insets.top + webTopInset + 12 }]} onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/");
        }
      }}>
        <Ionicons name="close" size={28} color={Colors.textSecondary} />
      </Pressable>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>
          Upgrade Your{"\n"}
          <Text style={{ color: Colors.primary }}>Grading</Text>
        </Text>
        <Text style={styles.subtitle}>
          {(remainingGrades !== null && remainingGrades <= 0) ? limitMessage : "Choose a plan that fits your collection"}
        </Text>

        <View style={styles.tiersContainer}>
          {TIER_CARDS.map((card) => {
            const info = TIERS[card.tier];
            const isSelected = selectedTier === card.tier;

            return (
              <Pressable
                key={card.tier}
                style={[
                  styles.tierCard,
                  isSelected && styles.tierCardSelected,
                  card.highlight && styles.tierCardPopular,
                ]}
                onPress={() => setSelectedTier(card.tier)}
              >
                {card.highlight && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>Most Popular</Text>
                  </View>
                )}

                <View style={styles.tierHeader}>
                  <View style={[styles.tierIconWrap, isSelected && { backgroundColor: Colors.primary + "25" }]}>
                    <Ionicons name={card.icon} size={22} color={isSelected ? Colors.primary : Colors.textSecondary} />
                  </View>
                  <View style={styles.tierNameWrap}>
                    <Text style={[styles.tierName, isSelected && { color: Colors.text }]}>{info.name}</Text>
                    <View style={styles.tierPriceRow}>
                      <Text style={[styles.tierPrice, isSelected && { color: Colors.primary }]}>{info.price}</Text>
                      <Text style={styles.tierPricePeriod}>/month</Text>
                    </View>
                  </View>
                  <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                </View>

                <View style={styles.tierFeatures}>
                  {card.features.map((f, i) => (
                    <View key={i} style={styles.tierFeatureRow}>
                      <Ionicons name="checkmark" size={16} color={isSelected ? Colors.primary : Colors.textMuted} />
                      <Text style={[styles.tierFeatureText, isSelected && { color: Colors.textSecondary }]}>{f}</Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={({ pressed }) => [styles.subscribeBtn, { transform: [{ scale: pressed ? 0.97 : 1 }], opacity: purchasing ? 0.7 : 1 }]}
          onPress={() => handleSubscribe(selectedTier)}
          disabled={purchasing}
        >
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.subscribeBtnGradient}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.subscribeBtnText}>
                Subscribe to {TIERS[selectedTier].name}
              </Text>
            )}
          </LinearGradient>
        </Pressable>

        <Pressable onPress={handleRestore} disabled={purchasing}>
          <Text style={styles.restoreText}>Restore Purchases</Text>
        </Pressable>

        <Text style={styles.freeNote}>
          {TIERS.free.monthlyLimit} free grades per month included with the free plan
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
  closeBtn: {
    position: "absolute",
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 30,
    color: Colors.text,
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 38,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 22,
  },
  tiersContainer: {
    width: "100%",
    gap: 12,
    marginBottom: 28,
  },
  tierCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.surface,
    padding: 16,
    overflow: "hidden",
  },
  tierCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "08",
  },
  tierCardPopular: {
    position: "relative",
  },
  popularBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomLeftRadius: 10,
    borderTopRightRadius: 14,
  },
  popularBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tierHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  tierIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  tierNameWrap: {
    flex: 1,
  },
  tierName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  tierPriceRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  tierPrice: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.textSecondary,
  },
  tierPricePeriod: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    marginLeft: 2,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: Colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  tierFeatures: {
    gap: 6,
    paddingLeft: 4,
  },
  tierFeatureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tierFeatureText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
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
