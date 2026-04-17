import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  FlatList,
  Platform,
  ViewToken,
  Image,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
  FadeIn,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import CompanyLabel, { getCompanyColor } from "@/components/CompanyLabel";

const logoImage = require("@/assets/grade-iq-logo.png");

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const ONBOARDING_KEY = "gradeiq_onboarding_complete";

interface SlideData {
  key: string;
  icon: string;
  iconSet: "ionicons" | "mci";
  title: string;
  subtitle: string;
  color: string;
  gradientColors: [string, string, string];
}

const SLIDES: SlideData[] = [
  {
    key: "welcome",
    icon: "cards-playing-diamond",
    iconSet: "mci",
    title: "Welcome to Grade.IQ",
    subtitle: "AI-powered Pokemon card grading in seconds. Get accurate estimated grades from 5 major grading companies.",
    color: Colors.primary,
    gradientColors: ["#1a0000", "#2a0a08", "#000000"],
  },
  {
    key: "snap",
    icon: "camera",
    iconSet: "ionicons",
    title: "Snap Front & Back",
    subtitle: "Take photos of your card's front and back using the built-in camera with spirit level for perfect alignment.",
    color: "#FF9500",
    gradientColors: ["#1a1000", "#1a0a00", "#000000"],
  },
  {
    key: "grades",
    icon: "analytics",
    iconSet: "ionicons",
    title: "Get Instant Grades",
    subtitle: "AI analyses centering, corners, edges, and surface to estimate grades from all 5 companies.",
    color: "#10B981",
    gradientColors: ["#001a0d", "#000a08", "#000000"],
  },
  {
    key: "values",
    icon: "cash",
    iconSet: "ionicons",
    title: "Know Your Card's Value",
    subtitle: "See estimated TCGPlayer market prices for each grade level, plus what your card could be worth at a perfect 10.",
    color: "#6366F1",
    gradientColors: ["#0a001a", "#08001a", "#000000"],
  },
  {
    key: "bulk",
    icon: "layers",
    iconSet: "ionicons",
    title: "Grade in Bulk",
    subtitle: "Scan up to 20 cards at once using the rapid-fire camera or photo library. Build your portfolio and track value.",
    color: "#EC4899",
    gradientColors: ["#1a000d", "#1a0008", "#000000"],
  },
  {
    key: "pro",
    icon: "diamond",
    iconSet: "ionicons",
    title: "Free to Try, Pro to Master",
    subtitle: "Get 3 free card grades every month. Upgrade for more grades starting at just \u00a32.99/month, with options up to unlimited grading.",
    color: "#F59E0B",
    gradientColors: ["#1a1200", "#1a0a00", "#000000"],
  },
];

function SlideItem({ item, index }: { item: SlideData; index: number }) {
  const iconAnim = useSharedValue(0);
  const glowAnim = useSharedValue(0);

  React.useEffect(() => {
    iconAnim.value = withDelay(
      200,
      withSpring(1, { damping: 12, stiffness: 100 })
    );
    glowAnim.value = withDelay(
      400,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconAnim.value }],
    opacity: iconAnim.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowAnim.value, [0, 1], [0.15, 0.4]),
    transform: [{ scale: interpolate(glowAnim.value, [0, 1], [0.8, 1.2]) }],
  }));

  return (
    <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
      <LinearGradient
        colors={item.gradientColors}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      <View style={styles.slideContent}>
        {item.key === "welcome" ? (
          <>
            <Animated.View entering={FadeIn.delay(200).duration(600)}>
              <Text style={styles.welcomeTitle}>
                <Text style={{ color: "#fff" }}>Grade.</Text>
                <Text style={{ color: Colors.primary }}>IQ</Text>
              </Text>
            </Animated.View>

            <Animated.View entering={FadeIn.delay(500).duration(600)}>
              <Text style={styles.welcomeSubtitle}>{item.subtitle}</Text>
            </Animated.View>
          </>
        ) : (
          <>
            <View style={styles.iconArea}>
              <Animated.View style={[styles.iconGlow, glowStyle, { backgroundColor: item.color }]} />
              <Animated.View style={[styles.iconCircle, iconStyle, { borderColor: item.color + "40" }]}>
                {item.iconSet === "ionicons" ? (
                  <Ionicons name={item.icon as any} size={52} color={item.color} />
                ) : (
                  <MaterialCommunityIcons name={item.icon as any} size={52} color={item.color} />
                )}
              </Animated.View>
            </View>

            <Animated.View entering={FadeIn.delay(300).duration(600)}>
              <Text style={styles.slideTitle}>{item.title}</Text>
            </Animated.View>

            <Animated.View entering={FadeIn.delay(500).duration(600)}>
              <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
            </Animated.View>
          </>
        )}

        {item.key === "grades" && (
          <Animated.View entering={FadeIn.delay(700).duration(600)} style={styles.companyRow}>
            {["PSA", "BGS", "ACE", "TAG", "CGC"].map((c) => (
              <View key={c} style={[styles.companyBadge, { borderColor: getCompanyColor(c) + "60" }]}>
                <CompanyLabel company={c} fontSize={14} />
              </View>
            ))}
          </Animated.View>
        )}

        {item.key === "pro" && (
          <Animated.View entering={FadeIn.delay(700).duration(600)} style={styles.proFeatures}>
            {[
              { icon: "checkmark-circle" as const, text: "3 free grades every month" },
              { icon: "sparkles" as const, text: "Plans from just \u00a32.99/month" },
              { icon: "infinite" as const, text: "Unlimited option available" },
            ].map((f) => (
              <View key={f.text} style={styles.proFeatureRow}>
                <Ionicons name={f.icon} size={20} color={item.color} />
                <Text style={styles.proFeatureText}>{f.text}</Text>
              </View>
            ))}
          </Animated.View>
        )}
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const isLast = currentIndex === SLIDES.length - 1;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const completeOnboarding = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    router.replace("/disclaimer");
  };

  const goNext = () => {
    if (isLast) {
      completeOnboarding();
    } else {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    }
  };

  const skip = () => {
    completeOnboarding();
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        keyExtractor={(item) => item.key}
        renderItem={({ item, index }) => <SlideItem item={item} index={index} />}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      />

      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]}>
        <View style={styles.dots}>
          {SLIDES.map((slide, i) => (
            <View
              key={slide.key}
              style={[
                styles.dot,
                i === currentIndex && [styles.dotActive, { backgroundColor: SLIDES[currentIndex].color }],
              ]}
            />
          ))}
        </View>

        <Pressable
          onPress={goNext}
          style={({ pressed }) => [
            styles.ctaBtn,
            { backgroundColor: SLIDES[currentIndex].color, transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
        >
          <Text style={styles.ctaText}>{isLast ? "Get Started" : "Next"}</Text>
          <Ionicons name={isLast ? "arrow-forward" : "chevron-forward"} size={20} color="#fff" />
        </Pressable>
      </View>

      {!isLast && (
        <View style={[styles.topBar, { top: insets.top + webTopInset }]}>
          <Pressable onPress={skip} style={({ pressed }) => [styles.skipBtn, { opacity: pressed ? 0.5 : 0.7 }]}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingVertical: 8,
    zIndex: 10,
  },
  logoImage: {
    width: 80,
    height: 80,
  },
  welcomeLogoArea: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  welcomeLogo: {
    width: 160,
    height: 160,
  },
  welcomeTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 44,
    textAlign: "center",
    lineHeight: 52,
  },
  welcomeSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 18,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    lineHeight: 28,
  },
  skipBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  skipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: Colors.textSecondary,
  },
  slide: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  slideContent: {
    alignItems: "center",
    paddingHorizontal: 40,
    gap: 24,
  },
  iconArea: {
    width: 140,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  iconGlow: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  slideTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: "#fff",
    textAlign: "center",
    lineHeight: 34,
  },
  slideSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
  bottomArea: {
    paddingHorizontal: 30,
    gap: 24,
    alignItems: "center",
  },
  dots: {
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  dotActive: {
    width: 24,
    borderRadius: 4,
  },
  companyRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    justifyContent: "center",
    flexWrap: "wrap",
  },
  companyBadge: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    paddingVertical: 18,
    borderRadius: 16,
  },
  ctaText: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: "#fff",
  },
  proFeatures: {
    gap: 12,
    width: "100%",
    marginTop: 4,
  },
  proFeatureRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.2)",
  },
  proFeatureText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: "#fff",
  },
});
