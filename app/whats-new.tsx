import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  FlatList,
  Dimensions,
  ListRenderItemInfo,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";

const { width } = Dimensions.get("window");

type Slide = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  gradientColors: [string, string];
  accentColor: string;
  title: string;
  subtitle: string;
  description: string;
  isCta?: boolean;
  bullets?: { icon: keyof typeof Ionicons.glyphMap; text: string }[];
};

const SLIDES: Slide[] = [
  {
    id: "intro",
    icon: "sparkles",
    gradientColors: ["#8B5CF6", "#6D28D9"],
    accentColor: "#8B5CF6",
    title: "What's New",
    subtitle: "Grade.IQ v1.0.11",
    description:
      "High-resolution card images across the whole app, plus the full Values hub to help you grade smarter and profit more.",
  },
  {
    id: "top-picks",
    icon: "trophy",
    gradientColors: ["#F59E0B", "#B45309"],
    accentColor: "#F59E0B",
    title: "Top Grading Picks",
    subtitle: "Curated daily, just for you",
    description:
      "A daily feed of cards scored by profit potential. Real eBay data, not guesswork — so you know exactly what you stand to make before you grade.",
    bullets: [
      { icon: "refresh", text: "Refreshed every day" },
      { icon: "bar-chart", text: "Ranked by profit potential" },
      { icon: "pricetag", text: "Raw vs graded price at a glance" },
    ],
  },
  {
    id: "profit",
    icon: "trending-up",
    gradientColors: ["#10B981", "#047857"],
    accentColor: "#10B981",
    title: "Full Profit Breakdown",
    subtitle: "Real eBay sold prices",
    description:
      "Tap any card to see last-sold eBay prices for every grade — PSA, BGS, ACE, TAG and CGC — with 30-day averages, price ranges, and trend sparklines.",
    bullets: [
      { icon: "logo-usd", text: "Actual sold prices, not listings" },
      { icon: "analytics", text: "30-day trends & price ranges" },
      { icon: "calculator", text: "Grading cost factored in automatically" },
    ],
  },
  {
    id: "liquidity",
    icon: "water",
    gradientColors: ["#3B82F6", "#1D4ED8"],
    accentColor: "#3B82F6",
    title: "Liquidity Scores",
    subtitle: "Know before you grade",
    description:
      "Each grade shows a liquidity score and sale count so you know which grades actually sell — and which ones sit in your binder.",
    bullets: [
      { icon: "speedometer", text: "Liquidity score per grade" },
      { icon: "people", text: "Real sale counts from eBay" },
      { icon: "checkmark-circle", text: "Tap any grade row to update" },
    ],
  },
  {
    id: "cta",
    icon: "albums",
    gradientColors: ["#FF3C31", "#B91C1C"],
    accentColor: "#FF3C31",
    title: "Your Grading\nIntelligence Hub",
    subtitle: "All in the Values tab",
    description:
      "Browse sets, discover top picks, analyse profit margins, and make smarter grading decisions — everything in one place.",
    isCta: true,
  },
];

function SlideItem({ item, index }: { item: Slide; index: number }) {
  const insets = useSafeAreaInsets();
  const webTop = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.slide, { width, paddingTop: insets.top + webTop + 60 }]}>
      <LinearGradient
        colors={item.gradientColors}
        style={styles.iconWrap}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Ionicons name={item.icon} size={52} color="#fff" />
      </LinearGradient>

      <Text style={[styles.subtitle, { color: item.accentColor }]}>{item.subtitle}</Text>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.description}>{item.description}</Text>

      {item.bullets && (
        <View style={styles.bullets}>
          {item.bullets.map((b, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={[styles.bulletIcon, { backgroundColor: item.accentColor + "1A" }]}>
                <Ionicons name={b.icon} size={15} color={item.accentColor} />
              </View>
              <Text style={styles.bulletText}>{b.text}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function WhatsNewScreen() {
  const insets = useSafeAreaInsets();
  const webBottom = Platform.OS === "web" ? 34 : 0;
  const flatListRef = useRef<FlatList<Slide>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { from } = useLocalSearchParams<{ from?: string }>();

  const dismiss = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  const goToValues = () => {
    if (router.canGoBack()) {
      router.back();
    }
    setTimeout(() => router.push("/(tabs)/values"), 50);
  };

  const next = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      setCurrentIndex(currentIndex + 1);
    } else {
      goToValues();
    }
  };

  const isLast = currentIndex === SLIDES.length - 1;
  const currentSlide = SLIDES[currentIndex];

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 12 }]}>
        <View style={{ width: 52 }} />
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === currentIndex && [styles.dotActive, { backgroundColor: currentSlide.accentColor }],
              ]}
            />
          ))}
        </View>
        <Pressable
          onPress={dismiss}
          style={({ pressed }) => [styles.skipBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <FlatList<Slide>
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }: ListRenderItemInfo<Slide>) => (
          <SlideItem item={item} index={index} />
        )}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(idx);
        }}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        bounces={false}
      />

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + webBottom + 16 },
        ]}
      >
        {isLast ? (
          <Pressable
            onPress={goToValues}
            style={({ pressed }) => [styles.ctaBtn, { opacity: pressed ? 0.85 : 1, backgroundColor: currentSlide.accentColor }]}
          >
            <Text style={styles.ctaBtnText}>Explore Values</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
          </Pressable>
        ) : (
          <Pressable
            onPress={next}
            style={({ pressed }) => [
              styles.nextBtn,
              { opacity: pressed ? 0.85 : 1, borderColor: currentSlide.accentColor + "50" },
            ]}
          >
            <Text style={[styles.nextBtnText, { color: currentSlide.accentColor }]}>Next</Text>
            <Ionicons name="chevron-forward" size={18} color={currentSlide.accentColor} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  dots: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceBorder,
  },
  dotActive: {
    width: 20,
    borderRadius: 3,
    height: 6,
  },
  skipBtn: {
    width: 52,
    alignItems: "flex-end",
  },
  skipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: Colors.textMuted,
  },
  slide: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 32,
    paddingBottom: 20,
    gap: 16,
  },
  iconWrap: {
    width: 110,
    height: 110,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  subtitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: Colors.text,
    textAlign: "center",
    lineHeight: 34,
  },
  description: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  bullets: {
    alignSelf: "stretch",
    gap: 10,
    marginTop: 8,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  bulletIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  bulletText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    alignItems: "stretch",
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingVertical: 16,
    gap: 4,
  },
  ctaBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: "#fff",
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: 1.5,
    backgroundColor: Colors.surface,
    gap: 4,
  },
  nextBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
  },
});
