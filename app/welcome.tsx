import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Linking,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";

const WELCOME_KEY = "gradeiq_welcome_seen";
const marceusLogo = require("@/assets/images/marceus-welcome.jpg");

interface FeatureRow {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}

const FEATURES: FeatureRow[] = [
  { icon: "scan", text: "AI grade estimates for PSA, BGS, ACE, TAG & CGC" },
  { icon: "cash", text: "See your card's market value at every grade" },
  { icon: "git-compare", text: "Every company's standards built in — find where your card's worth most" },
  { icon: "swap-horizontal", text: "Crossover grades for cards already in a slab" },
];

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ preview?: string }>();
  const isPreview = params.preview === "1";
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 16;

  const closePreview = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/settings");
    }
  };

  const handleContinue = async () => {
    if (isPreview) {
      closePreview();
      return;
    }
    try {
      await AsyncStorage.setItem(WELCOME_KEY, "true");
    } catch (e) {
      console.warn("[welcome] Could not save welcome flag:", e);
    }
    router.replace("/onboarding");
  };

  return (
    <View style={styles.container}>
      {isPreview && (
        <Pressable
          onPress={closePreview}
          hitSlop={12}
          style={[styles.previewBack, { top: insets.top + webTopInset + 4 }]}
        >
          <Ionicons name="chevron-back" size={26} color={Colors.text} />
        </Pressable>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: insets.top + webTopInset + 24,
          paddingBottom: insets.bottom + webBottomInset + 110,
          paddingHorizontal: 24,
        }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      >
        <Animated.View entering={FadeIn.duration(600)} style={styles.logoArea}>
          <View style={styles.logoGlow} />
          <Image source={marceusLogo} style={styles.logo} contentFit="cover" />
        </Animated.View>

        <Animated.Text entering={FadeInDown.delay(150).duration(600)} style={styles.title}>
          <Text style={{ color: Colors.text }}>Welcome to Grade.</Text>
          <Text style={{ color: Colors.primary }}>IQ</Text>
        </Animated.Text>

        <Animated.Text entering={FadeInDown.delay(250).duration(600)} style={styles.subtitle}>
          A quick note from the person who made it
        </Animated.Text>

        <Animated.View entering={FadeInDown.delay(350).duration(600)} style={styles.card}>
          <Text style={styles.body}>
            Hey, I'm Marceus — a collector, just like you.
          </Text>
          <Text style={[styles.body, styles.bodySpaced]}>
            I made Grade.IQ because I wanted a simple way to pre-grade my own cards before sending
            them off. So I built the app I always wished I had.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(450).duration(600)} style={styles.card}>
          <Text style={styles.sectionLabel}>What you can do here</Text>
          <View style={styles.featureList}>
            {FEATURES.map((f) => (
              <View key={f.text} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <Ionicons name={f.icon} size={16} color={Colors.primary} />
                </View>
                <Text style={styles.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(550).duration(600)} style={styles.card}>
          <Text style={styles.body}>
            I've never made an app before, so there will be bugs along the way. I'm fully committed
            to fixing them as they come up.
          </Text>
          <Text style={[styles.body, styles.bodySpaced]}>
            If you ever want to reach me, find me on Instagram — or use the Feature Request form in
            Settings. Enjoy the app, and thank you for any feedback you share. It genuinely helps.
          </Text>

          <Pressable
            onPress={() => Linking.openURL("https://instagram.com/marceus.tcg")}
            style={({ pressed }) => [styles.igLink, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="logo-instagram" size={18} color="#E1306C" />
            <Text style={styles.igText}>@marceus.tcg</Text>
          </Pressable>

          <Text style={styles.signature}>— Marceus</Text>
        </Animated.View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + webBottomInset },
        ]}
      >
        <Pressable
          onPress={handleContinue}
          style={({ pressed }) => [
            styles.ctaBtn,
            { transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <Text style={styles.ctaText}>{isPreview ? "Close" : "Get Started"}</Text>
          <Ionicons name={isPreview ? "checkmark" : "arrow-forward"} size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  previewBack: {
    position: "absolute",
    left: 12,
    zIndex: 10,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  logoArea: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  logoGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Colors.primary,
    opacity: 0.22,
  },
  logo: {
    width: 132,
    height: 132,
    borderRadius: 30,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 30,
    textAlign: "center",
    lineHeight: 38,
  },
  subtitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 22,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.text,
    lineHeight: 23,
  },
  bodySpaced: {
    marginTop: 12,
    color: Colors.textSecondary,
  },
  sectionLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  featureList: {
    gap: 14,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(255, 60, 49, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
    flex: 1,
    lineHeight: 20,
  },
  igLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "rgba(225, 48, 108, 0.12)",
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  igText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#E1306C",
  },
  signature: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
    marginTop: 18,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: Colors.primary,
  },
  ctaText: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: "#fff",
  },
});
