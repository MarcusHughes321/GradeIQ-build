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
    subtitle: "Grade.IQ v1.0.28",
    description:
      "A little polish to help you find your way around — replay the app tour whenever you like, and a cleaner, better-organized Settings menu.",
  },
  {
    id: "tour",
    icon: "compass",
    gradientColors: ["#06B6D4", "#0E7490"],
    accentColor: "#06B6D4",
    title: "Replay the App Tour",
    subtitle: "Anytime you like",
    description:
      "New here, or just want a refresher? The intro walkthrough now lives in Settings, so you can step through what Grade.IQ can do whenever you want.",
    bullets: [
      { icon: "compass-outline", text: "Find it under Settings → Guides" },
      { icon: "play-circle", text: "Step through the highlights again" },
      { icon: "close-circle", text: "Close any time — nothing resets" },
    ],
  },
  {
    id: "settings",
    icon: "list",
    gradientColors: ["#F59E0B", "#B45309"],
    accentColor: "#F59E0B",
    title: "A Cleaner Settings Menu",
    subtitle: "Everything in its place",
    description:
      "We split the long list into clear sections, so guides, app info, support, and the legal pages are all easy to find.",
    bullets: [
      { icon: "book-outline", text: "Guides — tour, standards & fees" },
      { icon: "information-circle-outline", text: "About, What's New & welcome" },
      { icon: "shield-checkmark-outline", text: "Support and Legal on their own" },
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
