import React from "react";
import { Tabs } from "expo-router";
import { Platform, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { BlurView } from "expo-blur";
import { useGrading } from "@/lib/grading-context";

export default function TabLayout() {
  const { hasCompletedJob, hasActiveJob } = useGrading();
  const showHomeBadge = hasCompletedJob || hasActiveJob;

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
          height: Platform.OS === "web" ? 84 : 85,
          paddingTop: 8,
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
          title: "Grade",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="camera" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
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
});
