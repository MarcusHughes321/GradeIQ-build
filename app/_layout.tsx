import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";
import { Asset } from "expo-asset";
import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { SettingsProvider } from "@/lib/settings-context";
import { SubscriptionProvider } from "@/lib/subscription";
import { GradingProvider } from "@/lib/grading-context";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { StatusBar } from "expo-status-bar";
import Colors from "@/constants/colors";
import { getSettings } from "@/lib/settings";

// Require font files at module level so Metro bundles them
const IONICONS_TTF = require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf");
const MCT_TTF = require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf");
const FEATHER_TTF = require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ttf");

SplashScreen.preventAutoHideAsync();

const ONBOARDING_KEY = "gradeiq_onboarding_complete";
const DISCLAIMER_KEY = "gradeiq_disclaimer_accepted";
const WHATS_NEW_KEY = "gradeiq_whats_new_version";
const CURRENT_VERSION = "1.0.6";

/**
 * On Android, Expo Go bundles its own (possibly outdated) icon fonts in assets/fonts/.
 * expo-font's loadAsync skips fonts already found via getLoadedFonts(), which scans assets.
 * We bypass this by calling the native ExpoFontLoader directly, which always calls
 * ReactFontManager.setTypeface() regardless of any "already loaded" state.
 */
async function forceRegisterIconFontsAndroid() {
  try {
    // Download the correct font files from our npm package via Metro's asset server
    const [ioniconsAsset, mctAsset, featherAsset] = await Asset.loadAsync([
      IONICONS_TTF, MCT_TTF, FEATHER_TTF,
    ]);

    // Import the native module directly to bypass expo-font's isLoaded check
    const ExpoFontLoader = require("expo-font/build/ExpoFontLoader").default;

    const registerFont = async (name: string, asset: typeof ioniconsAsset) => {
      if (!asset.localUri) return;
      try {
        await ExpoFontLoader.loadAsync(name, asset.localUri);
        console.log(`[fonts] Force-registered: ${name}`);
      } catch (e) {
        console.warn(`[fonts] Force-register failed for ${name}:`, e);
      }
    };

    // Register under both v15 lowercase names AND old PascalCase names
    await Promise.all([
      registerFont("ionicons", ioniconsAsset),
      registerFont("Ionicons", ioniconsAsset),
      registerFont("material-community", mctAsset),
      registerFont("MaterialCommunityIcons", mctAsset),
      registerFont("feather", featherAsset),
      registerFont("Feather", featherAsset),
    ]);
  } catch (e) {
    console.warn("[fonts] forceRegisterIconFontsAndroid error:", e);
  }
}

function RootLayoutNav() {
  const [checkedOnboarding, setCheckedOnboarding] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(ONBOARDING_KEY),
      AsyncStorage.getItem(DISCLAIMER_KEY),
      AsyncStorage.getItem(WHATS_NEW_KEY),
      getSettings(),
    ]).then(([onboardingVal, disclaimerVal, seenVersion, settings]) => {
      if (onboardingVal !== "true") {
        router.replace("/onboarding");
      } else if (disclaimerVal !== "true") {
        router.replace("/disclaimer");
      } else if (settings.enabledCompanies.length === 0) {
        router.replace("/company-select");
      } else if (seenVersion !== CURRENT_VERSION) {
        AsyncStorage.setItem(WHATS_NEW_KEY, CURRENT_VERSION);
        setTimeout(() => router.push("/whats-new"), 400);
      }
      setCheckedOnboarding(true);
    }).catch((e) => {
      console.warn("[layout] Onboarding check failed:", e);
      setCheckedOnboarding(true);
    });
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
      <Stack.Screen name="company-select" options={{ animation: "fade" }} />
      <Stack.Screen name="results" />
      <Stack.Screen name="bulk" />
      <Stack.Screen name="bulk-results" />
      <Stack.Screen name="deep-grade-info" />
      <Stack.Screen name="paywall" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      <Stack.Screen name="terms" />
      <Stack.Screen name="about" />
      <Stack.Screen name="feedback" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="disclaimer" options={{ animation: "fade" }} />
      <Stack.Screen name="whats-new" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      <Stack.Screen name="admin-analytics" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    async function loadResources() {
      try {
        // On Android: force-register icon fonts by calling native module directly.
        // This bypasses expo-font's "already loaded" skip that uses Expo Go's
        // bundled (potentially outdated) fonts, ensuring our v15 fonts are used.
        if (Platform.OS === "android") {
          await forceRegisterIconFontsAndroid();
        }

        // Load all fonts (Inter + icon fonts for non-Android) via expo-font
        await Font.loadAsync({
          Inter_400Regular,
          Inter_500Medium,
          Inter_600SemiBold,
          Inter_700Bold,
          ...(Platform.OS !== "android" ? {
            "ionicons": IONICONS_TTF,
            "Ionicons": IONICONS_TTF,
            "material-community": MCT_TTF,
            "MaterialCommunityIcons": MCT_TTF,
            "feather": FEATHER_TTF,
            "Feather": FEATHER_TTF,
          } : {}),
        });

        console.log("[fonts] Ready. isLoaded(ionicons)=", Font.isLoaded("ionicons"));
      } catch (e) {
        console.warn("[fonts] Font loading error:", e);
      } finally {
        setAppReady(true);
        SplashScreen.hideAsync();
      }
    }
    loadResources();
  }, []);

  if (!appReady) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <SubscriptionProvider>
            <GradingProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                  <StatusBar style="light" />
                  <RootLayoutNav />
              </GestureHandlerRootView>
            </GradingProvider>
          </SubscriptionProvider>
        </SettingsProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
