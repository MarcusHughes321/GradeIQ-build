import React, { useState, useEffect } from "react";
import { Tabs } from "expo-router";
import { Platform, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGrading } from "@/lib/grading-context";
import { useSubscription } from "@/lib/subscription";
import { getApiUrl } from "@/lib/query-client";

function useAdminFlagCount(isAdmin: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) { setCount(0); return; }

    let cancelled = false;
    const fetch_ = async () => {
      try {
        const url = new URL("/api/admin/price-flags/count", getApiUrl());
        const res = await fetch(url.toString());
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) setCount(body.needsReview ?? 0);
      } catch { /* non-fatal */ }
    };

    fetch_();
    const id = setInterval(fetch_, 60_000); // poll every 60s
    return () => { cancelled = true; clearInterval(id); };
  }, [isAdmin]);

  return count;
}

export default function TabLayout() {
  const { hasCompletedJob, hasActiveJob } = useGrading();
  const { isAdminMode } = useSubscription();
  const showHomeBadge = hasCompletedJob || hasActiveJob;
  const flagCount = useAdminFlagCount(isAdminMode);
  const insets = useSafeAreaInsets();

  // Tab bar content height (icons + labels) + bottom safe area so content
  // sits above Android nav buttons and iOS home indicator.
  const tabBarHeight = Platform.OS === "web" ? 84 : 50 + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Platform.OS === "web" ? Colors.surface : "transparent",
          borderTopColor: Colors.surfaceBorder,
          borderTopWidth: 1,
          position: "absolute",
          elevation: 0,
          height: tabBarHeight,
          paddingTop: 8,
          paddingBottom: Platform.OS === "web" ? 0 : insets.bottom,
        },
        tabBarBackground: () =>
          Platform.OS !== "web" ? (
            <BlurView
              intensity={80}
              tint="dark"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            />
          ) : null,
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 11,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="home" size={size} color={color} />
              {showHomeBadge && (
                <View style={[
                  tabBadgeStyles.dot,
                  { backgroundColor: hasCompletedJob ? "#10B981" : Colors.primary },
                ]} />
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="grade"
        options={{
          title: "Features",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="values"
        options={{
          title: "Values",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="settings-outline" size={size} color={color} />
              {isAdminMode && flagCount > 0 && (
                <View style={tabBadgeStyles.countBadge}>
                  <Text style={tabBadgeStyles.countTxt}>
                    {flagCount > 9 ? "9+" : String(flagCount)}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const tabBadgeStyles = StyleSheet.create({
  dot: {
    position: "absolute",
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  countBadge: {
    position: "absolute",
    top: -5,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  countTxt: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    color: "#fff",
    lineHeight: 12,
  },
});
