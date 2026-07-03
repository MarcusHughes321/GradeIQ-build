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
import { router, useLocalSearchParams } from "expo-router";
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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Colors from "@/constants/colors";
import CompanyLabel, { getCompanyColor } from "@/components/CompanyLabel";

const logoImage = require("@/assets/grade-iq-logo.png");

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const ONBOARDING_KEY = "gradeiq_onboarding_complete";

// Pre-baked demo pair for the "Inspect Every Flaw" slide (raw crop + Laplacian edge map).
const demoRawImg = require("@/assets/images/demo-card-raw.jpg");
const demoEdgesImg = require("@/assets/images/demo-card-edges.jpg");
const CARD_RATIO = 660 / 924; // width / height of the pre-baked demo images
const CARD_H = Math.min(300, Math.round(SCREEN_HEIGHT * 0.36));
const CARD_W = Math.round(CARD_H * CARD_RATIO);

interface SlideData {
  key: string;
  icon: string;
  iconSet: "ionicons" | "mci";
  title: string;
  subtitle: string;
  color: string;
  gradientColors: [string, string, string];
  tags?: ("Free" | "Pro")[];
}

const SLIDES: SlideData[] = [
  {
    key: "standards",
    icon: "git-compare",
    iconSet: "ionicons",
    title: "Why Grade.IQ?",
    subtitle: "We've gathered the official published grading standards from every major company — and that's exactly what our AI assesses your card against. What this means for you: a real idea of the grade to expect from each company, and a clear view of where your card could be worth the most before you ever pay to submit.",
    color: "#06B6D4",
    gradientColors: ["#001417", "#000a0d", "#000000"],
  },
  {
    key: "report",
    icon: "document-text",
    iconSet: "ionicons",
    title: "Snap It, Grade It",
    subtitle: "Take a photo of the front and back, and our AI scores the four things graders care about — centering, corners, edges and surface. You get an overall grade plus the grade to expect from every company.",
    color: "#10B981",
    gradientColors: ["#001a0d", "#000a08", "#000000"],
    tags: ["Free"],
  },
  {
    key: "value",
    icon: "trending-up",
    iconSet: "ionicons",
    title: "See What It's Worth",
    subtitle: "Reveal the money side of any grade: real market value, profit potential after fees, how quickly it sells, sale counts and price trends. Know whether it's worth sending off — before you pay a penny.",
    color: "#6366F1",
    gradientColors: ["#0a001a", "#08001a", "#000000"],
    tags: ["Pro"],
  },
  {
    key: "inspect",
    icon: "color-filter",
    iconSet: "ionicons",
    title: "Inspect Every Flaw",
    subtitle: "Zoom into any photo and switch on the inspection filters — reveal surface texture, relief and edges that are invisible to the naked eye. Slide between the real photo and the filter to make scratches and print lines pop.",
    color: "#EC4899",
    gradientColors: ["#1a000d", "#1a0008", "#000000"],
    tags: ["Free"],
  },
  {
    key: "centering",
    icon: "scan",
    iconSet: "ionicons",
    title: "Measure Centering Yourself",
    subtitle: "Not sure about the borders? Open the centering tool, pinch to zoom and drag the guides to measure your card's centering by hand — front and back.",
    color: "#FF9500",
    gradientColors: ["#1a1000", "#1a0a00", "#000000"],
    tags: ["Free"],
  },
  {
    key: "advisor",
    icon: "chatbubbles",
    iconSet: "ionicons",
    title: "Ask the Card Advisor",
    subtitle: "Describe any card and get instant AI advice: what grade to expect, whether it's worth grading, and if a deal is actually good. Your personal grading and buying assistant.",
    color: "#A855F7",
    gradientColors: ["#12081f", "#0a0514", "#000000"],
    tags: ["Pro"],
  },
  {
    key: "sets",
    icon: "albums",
    iconSet: "ionicons",
    title: "Browse Sets & Top Picks",
    subtitle: "Explore every set and card for free. Go Pro to see live values, and check Top Grading Picks — cheaper cards that return the most profit once graded, refreshed daily.",
    color: "#0EA5E9",
    gradientColors: ["#00121a", "#000a14", "#000000"],
    tags: ["Free", "Pro"],
  },
  {
    key: "pro",
    icon: "diamond",
    iconSet: "ionicons",
    title: "Free to Try, Pro to Master",
    subtitle: "Get 3 free card grades every month. Upgrade for more grades and all the value tools, starting at just \u00a32.99/month — up to unlimited grading.",
    color: "#F59E0B",
    gradientColors: ["#1a1200", "#1a0a00", "#000000"],
  },
];

// Live before/after slider used on the "Inspect Every Flaw" slide. Drag the
// divider to wipe between the real photo and the Laplacian edge map. Offline —
// uses the pre-baked asset pair, no server call during onboarding.
function TextureCompareSlider({ active }: { active: boolean }) {
  const dividerX = useSharedValue(CARD_W * 0.5);

  React.useEffect(() => {
    if (!active) return;
    dividerX.value = CARD_W * 0.5;
    dividerX.value = withSequence(
      withDelay(350, withTiming(CARD_W * 0.8, { duration: 950, easing: Easing.inOut(Easing.ease) })),
      withTiming(CARD_W * 0.2, { duration: 1150, easing: Easing.inOut(Easing.ease) }),
      withTiming(CARD_W * 0.5, { duration: 800, easing: Easing.inOut(Easing.ease) }),
    );
  }, [active]);

  const pan = Gesture.Pan()
    .onBegin((e) => {
      "worklet";
      dividerX.value = Math.min(Math.max(e.x, 0), CARD_W);
    })
    .onUpdate((e) => {
      "worklet";
      dividerX.value = Math.min(Math.max(e.x, 0), CARD_W);
    });

  const clipStyle = useAnimatedStyle(() => ({ width: dividerX.value }));
  const handleStyle = useAnimatedStyle(() => ({ left: dividerX.value }));

  return (
    <Animated.View entering={FadeIn.delay(200).duration(600)} style={styles.compareOuter}>
      <GestureDetector gesture={pan}>
        <View style={[styles.compareCard, { width: CARD_W, height: CARD_H }]}>
          <Image source={demoRawImg} style={{ width: CARD_W, height: CARD_H }} resizeMode="cover" />
          <Animated.View style={[styles.compareClip, clipStyle]}>
            <Image source={demoEdgesImg} style={{ width: CARD_W, height: CARD_H }} resizeMode="cover" />
          </Animated.View>

          <View style={[styles.compareTag, styles.compareTagLeft]}>
            <Text style={styles.compareTagText}>EDGES</Text>
          </View>
          <View style={[styles.compareTag, styles.compareTagRight]}>
            <Text style={styles.compareTagTextMuted}>ORIGINAL</Text>
          </View>

          <Animated.View style={[styles.compareDivider, handleStyle]} pointerEvents="none">
            <View style={styles.compareDividerLine} />
            <View style={styles.compareHandle}>
              <Ionicons name="chevron-back" size={13} color="#000" />
              <Ionicons name="chevron-forward" size={13} color="#000" />
            </View>
          </Animated.View>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

function SlideItem({ item, active }: { item: SlideData; active: boolean }) {
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
        {item.key === "inspect" ? (
          <TextureCompareSlider active={active} />
        ) : (
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
        )}

        {item.tags && item.tags.length > 0 && (
          <Animated.View entering={FadeIn.delay(250).duration(600)} style={styles.tagRow}>
            {item.tags.map((t) => (
              <View key={t} style={[styles.tagPill, t === "Pro" ? styles.tagPillPro : styles.tagPillFree]}>
                {t === "Pro" && (
                  <Ionicons name="sparkles" size={11} color="#F59E0B" style={styles.tagIcon} />
                )}
                <Text style={[styles.tagText, t === "Pro" ? styles.tagTextPro : styles.tagTextFree]}>{t}</Text>
              </View>
            ))}
          </Animated.View>
        )}

        <Animated.View entering={FadeIn.delay(300).duration(600)}>
          <Text style={styles.slideTitle}>{item.title}</Text>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(500).duration(600)}>
          <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
        </Animated.View>

        {item.key === "report" && (
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
  const params = useLocalSearchParams<{ preview?: string }>();
  const isPreview = params.preview === "1";

  const isLast = currentIndex === SLIDES.length - 1;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const exitPreview = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/settings");
    }
  };

  const completeOnboarding = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    router.replace("/disclaimer");
  };

  const finish = () => {
    if (isPreview) {
      exitPreview();
    } else {
      completeOnboarding();
    }
  };

  const goNext = () => {
    if (isLast) {
      finish();
    } else {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    }
  };

  const skip = () => {
    finish();
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
        extraData={currentIndex}
        renderItem={({ item, index }) => <SlideItem item={item} active={index === currentIndex} />}
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
          <Text style={styles.ctaText}>{isLast ? (isPreview ? "Done" : "Get Started") : "Next"}</Text>
          <Ionicons name={isLast ? "arrow-forward" : "chevron-forward"} size={20} color="#fff" />
        </Pressable>
      </View>

      {!isLast && !isPreview && (
        <View style={[styles.topBar, { top: insets.top + webTopInset }]}>
          <Pressable onPress={skip} style={({ pressed }) => [styles.skipBtn, { opacity: pressed ? 0.5 : 0.7 }]}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </View>
      )}

      {isPreview && (
        <Pressable
          onPress={exitPreview}
          hitSlop={12}
          style={[styles.previewBack, { top: insets.top + webTopInset + 4 }]}
        >
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
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
  previewBack: {
    position: "absolute",
    left: 16,
    zIndex: 11,
    padding: 4,
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
  tagRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: -8,
  },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
  },
  tagPillFree: {
    backgroundColor: "rgba(16,185,129,0.15)",
    borderColor: "rgba(16,185,129,0.4)",
  },
  tagPillPro: {
    backgroundColor: "rgba(245,158,11,0.15)",
    borderColor: "rgba(245,158,11,0.4)",
  },
  tagIcon: {
    marginRight: 4,
  },
  tagText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  tagTextFree: {
    color: "#10B981",
  },
  tagTextPro: {
    color: "#F59E0B",
  },
  compareOuter: {
    alignItems: "center",
    justifyContent: "center",
  },
  compareCard: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  compareClip: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    overflow: "hidden",
  },
  compareTag: {
    position: "absolute",
    top: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  compareTagLeft: {
    left: 8,
  },
  compareTagRight: {
    right: 8,
  },
  compareTagText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.6,
    color: "#EC4899",
  },
  compareTagTextMuted: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.6,
    color: "rgba(255,255,255,0.75)",
  },
  compareDivider: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  compareDividerLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    left: -1,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  compareHandle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
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
