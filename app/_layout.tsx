import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";
import React, { useEffect, useState } from "react";
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

SplashScreen.preventAutoHideAsync();

const ONBOARDING_KEY = "gradeiq_onboarding_complete";
const DISCLAIMER_KEY = "gradeiq_disclaimer_accepted";
const WHATS_NEW_KEY = "gradeiq_whats_new_version";
const CURRENT_VERSION = "1.0.7";

function RootLayoutNav() {
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
    }).catch((e) => {
      console.warn("[layout] Onboarding check failed:", e);
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
      <Stack.Screen name="grading-fees" options={{ headerShown: false }} />
      <Stack.Screen name="terms" />
      <Stack.Screen name="about" />
      <Stack.Screen name="feedback" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="disclaimer" options={{ animation: "fade" }} />
      <Stack.Screen name="whats-new" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      <Stack.Screen name="admin-analytics" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      <Stack.Screen name="admin-price-flags" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    async function loadResources() {
      try {
        // Icon fonts (Ionicons, MaterialCommunityIcons, Feather) are pre-bundled
        // inside Expo Go's native APK — loading them again via Metro can conflict.
        // In a production build they are bundled as native assets automatically.
        await Font.loadAsync({
          Inter_400Regular,
          Inter_500Medium,
          Inter_600SemiBold,
          Inter_700Bold,
        });
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
