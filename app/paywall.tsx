import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Alert, ActivityIndicator, ScrollView, NativeSyntheticEvent, NativeScrollEvent, useWindowDimensions } from "react-native";
import { router, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing, interpolate } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useSubscription, TIERS, type SubscriptionTier } from "@/lib/subscription";

const TIER_CARDS: { tier: SubscriptionTier; highlight?: boolean; icon: keyof typeof Ionicons.glyphMap; features: string[] }[] = [
  {
    tier: "curious",
    icon: "sparkles-outline",
    features: ["15 Quick Grades per month", "2 Deep Grades per month", "10 Crossover Grades per month", "Full AI analysis", "Graded market prices & Profit Analysis", "Market Liquidity scores"],
  },
  {
    tier: "enthusiast",
    highlight: true,
    icon: "flame-outline",
    features: ["50 Quick Grades per month", "7 Deep Grades per month", "25 Crossover Grades per month", "Full AI analysis", "Graded market prices & Profit Analysis", "Market Liquidity scores", "Bulk grading up to 20 cards"],
  },
  {
    tier: "obsessed",
    icon: "diamond-outline",
    features: ["Unlimited Quick Grades", "30 Deep Grades per month", "Unlimited Crossover Grades", "Full AI analysis", "Graded market prices & Profit Analysis", "Market Liquidity scores", "Bulk grading up to 20 cards", "Priority support"],
  },
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { purchaseTier, restorePurchases, rcConfigured, remainingGrades, currentTier } = useSubscription();
  const [purchasing, setPurchasing] = useState(false);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>("enthusiast");
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const isCompact = screenHeight < 750;

  const scrollIndicatorOpacity = useSharedValue(1);
  const bounceAnim = useSharedValue(0);

  React.useEffect(() => {
    bounceAnim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    if (offsetY > 80) {
      scrollIndicatorOpacity.value = withTiming(0, { duration: 250 });
    } else {
      scrollIndicatorOpacity.value = withTiming(1, { duration: 250 });
    }
  }, []);

  const scrollIndicatorStyle = useAnimatedStyle(() => ({
    opacity: scrollIndicatorOpacity.value,
    transform: [{ translateY: interpolate(bounceAnim.value, [0, 1], [0, 8]) }],
  }));

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
      } else {
        Alert.alert(
          "Payment Received",
          "Your payment was processed but your subscription hasn't activated yet. Tap 'Restore Purchases' below to apply it.",
          [{ text: "OK" }]
        );
      }
    } catch (e: any) {
      const message = e?.message || "";
      if (message === "USER_CANCELLED") {
        return;
      } else if (message === "NO_PACKAGES_AVAILABLE") {
        Alert.alert("Subscription Unavailable", "Unable to load subscription options. Please try again later.");
      } else if (message === "SUBSCRIPTION_NOT_CONFIGURED") {
        Alert.alert("Not Available", "Subscriptions are not yet configured. Please check back later.");
      } else if (message.startsWith("PURCHASE_FAILED|")) {
        const parts = message.split("|");
        const errorCode = parts[1] || "UNKNOWN";
        const errorDetail = parts[2] || "";
        console.error("Purchase failed - code:", errorCode, "detail:", errorDetail);
        if (errorCode === "1" || errorCode === "PURCHASE_CANCELLED_ERROR") {
          return;
        } else if (errorCode === "6" || errorCode === "PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR") {
          Alert.alert("Product Unavailable", "This subscription is not available for purchase yet. Please try again later.");
        } else if (errorCode === "2" || errorCode === "PURCHASE_NOT_ALLOWED_ERROR") {
          Alert.alert("Purchase Not Allowed", "In-app purchases are not allowed on this device. Please check your device settings.");
        } else if (errorCode === "10" || errorCode === "PRODUCT_ALREADY_PURCHASED_ERROR") {
          // Subscription already exists — automatically restore instead of making user do it manually
          console.log("PRODUCT_ALREADY_PURCHASED — auto-restoring...");
          try {
            const restored = await restorePurchases();
            if (restored) {
              router.back();
            } else {
              Alert.alert(
                "Subscription Found",
                "Your subscription is active but couldn't be applied automatically. Please tap 'Restore Purchases' below.",
                [{ text: "OK" }]
              );
            }
          } catch (restoreErr: any) {
            const detail = restoreErr?.message ? `\n\n(${restoreErr.message})` : "";
            Alert.alert("Restore Error", `Couldn't restore automatically.${detail} Please tap 'Restore Purchases' below.`);
          }
        } else {
          Alert.alert("Subscription Issue", `We couldn't process your subscription right now. (Code: ${errorCode})`);
        }
      } else {
        Alert.alert("Subscription Issue", "We couldn't process your subscription right now. Please try again later.");
      }
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
        Alert.alert("Restored", "Your subscription has been restored.", [{ text: "OK", onPress: () => router.back() }]);
      } else {
        Alert.alert("No Subscription Found", "We couldn't find an active subscription linked to your Apple ID. Make sure you're signed in with the same Apple ID used to purchase, then try again.");
      }
    } catch (e: any) {
      const detail = e?.message ? `\n\n(${e.message})` : "";
      Alert.alert("Restore Issue", `We couldn't restore your purchases right now.${detail}`);
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

      <ScrollView contentContainerStyle={[styles.scrollContent, isCompact && styles.scrollContentCompact]} showsVerticalScrollIndicator={true} contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} onScroll={handleScroll} scrollEventThrottle={16} bounces={true} alwaysBounceVertical={true}>
        <View style={styles.contentWrapper}>
          <Text style={[styles.title, isCompact && styles.titleCompact]}>
            Upgrade Your{"\n"}
            <Text style={{ color: Colors.primary }}>Grading</Text>
          </Text>
          <Text style={[styles.subtitle, isCompact && styles.subtitleCompact]}>
            {(remainingGrades !== null && remainingGrades <= 0) ? limitMessage : "Choose a plan that fits your collection"}
          </Text>

          <View style={[styles.tiersContainer, isCompact && styles.tiersContainerCompact]}>
            {TIER_CARDS.map((card) => {
              const info = TIERS[card.tier];
              const isSelected = selectedTier === card.tier;

              return (
                <Pressable
                  key={card.tier}
                  style={[
                    styles.tierCard,
                    isCompact && styles.tierCardCompact,
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

                  <View style={[styles.tierHeader, isCompact && styles.tierHeaderCompact]}>
                    <View style={[styles.tierIconWrap, isCompact && styles.tierIconWrapCompact, isSelected && { backgroundColor: Colors.primary + "25" }]}>
                      <Ionicons name={card.icon} size={isCompact ? 18 : 22} color={isSelected ? Colors.primary : Colors.textSecondary} />
                    </View>
                    <View style={styles.tierNameWrap}>
                      <Text style={[styles.tierName, isSelected && { color: Colors.text }]}>{info.name}</Text>
                      <View style={styles.tierPriceRow}>
                        <Text style={[styles.tierPrice, isCompact && styles.tierPriceCompact, isSelected && { color: Colors.primary }]}>{info.price}</Text>
                        <Text style={styles.tierPricePeriod}>/month</Text>
                      </View>
                    </View>
                    <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                      {isSelected && <View style={styles.radioInner} />}
                    </View>
                  </View>

                  {(!isCompact || isSelected) && (
                    <View style={[styles.tierFeatures, isCompact && styles.tierFeaturesCompact]}>
                      {card.features.map((f, i) => (
                        <View key={i} style={styles.tierFeatureRow}>
                          <Ionicons name="checkmark" size={16} color={isSelected ? Colors.primary : Colors.textMuted} />
                          <Text style={[styles.tierFeatureText, isSelected && { color: Colors.textSecondary }]}>{f}</Text>
                        </View>
                      ))}
                    </View>
                  )}
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

          <Pressable onPress={handleRestore} disabled={purchasing} style={styles.restoreBtn}>
            <Text style={styles.restoreText}>Restore Purchases</Text>
          </Pressable>

          <Text style={styles.freeNote}>
            {TIERS.free.monthlyLimit} free grades per month included with the free plan
          </Text>

          <Text style={styles.autoRenewNote}>
            Subscriptions auto-renew monthly unless cancelled at least 24 hours before the end of the current period. Manage or cancel anytime in your App Store or Google Play settings.
          </Text>

          <View style={styles.legalLinks}>
            <Pressable onPress={() => router.push("/terms")}>
              <Text style={styles.legalLinkText}>Terms of Use</Text>
            </Pressable>
            <Text style={styles.legalDivider}>|</Text>
            <Pressable onPress={() => router.push("/privacy")}>
              <Text style={styles.legalLinkText}>Privacy Policy</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <Animated.View pointerEvents="none" style={[styles.scrollIndicator, { bottom: insets.bottom + webBottomInset + 16 }, scrollIndicatorStyle]}>
        <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
        <Ionicons name="chevron-down" size={20} color={Colors.textMuted} style={{ marginTop: -10 }} />
      </Animated.View>
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
    paddingTop: 20,
    paddingBottom: 40,
    flexGrow: 1,
  },
  scrollContentCompact: {
    paddingTop: 12,
    paddingBottom: 24,
  },
  contentWrapper: {
    width: "100%",
    maxWidth: 500,
    alignItems: "center",
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 30,
    color: Colors.text,
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 38,
  },
  titleCompact: {
    fontSize: 24,
    lineHeight: 30,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 22,
  },
  subtitleCompact: {
    fontSize: 13,
    marginBottom: 16,
  },
  tiersContainer: {
    width: "100%",
    gap: 12,
    marginBottom: 28,
  },
  tiersContainerCompact: {
    gap: 8,
    marginBottom: 16,
  },
  tierCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.surface,
    padding: 16,
    overflow: "hidden",
  },
  tierCardCompact: {
    padding: 12,
    borderRadius: 12,
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
  tierHeaderCompact: {
    marginBottom: 8,
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
  tierIconWrapCompact: {
    width: 34,
    height: 34,
    borderRadius: 10,
    marginRight: 10,
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
  tierPriceCompact: {
    fontSize: 17,
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
  tierFeaturesCompact: {
    gap: 4,
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
  restoreBtn: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  restoreText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  freeNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
  },
  autoRenewNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 12,
    paddingHorizontal: 16,
    lineHeight: 16,
  },
  legalLinks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    gap: 12,
  },
  legalLinkText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.primary,
    textDecorationLine: "underline",
  },
  legalDivider: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  scrollIndicator: {
    position: "absolute",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
});
