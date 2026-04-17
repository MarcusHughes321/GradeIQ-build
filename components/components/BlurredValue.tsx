import React from "react";
import { View, Pressable, StyleSheet, ViewStyle } from "react-native";
import { router } from "expo-router";

interface BlurredValueProps {
  children: React.ReactNode;
  blurred: boolean;
  containerStyle?: ViewStyle;
}

/**
 * Wraps any content so that, when blurred=true, the real value is hidden behind
 * a smear overlay and the user is sent to the paywall on tap.
 * When blurred=false it is transparent — children render normally.
 *
 * Usage:
 *   <BlurredValue blurred={!hasAccess} containerStyle={{ flex: 2 }}>
 *     <Text style={styles.price}>{fmtSym(price)}</Text>
 *   </BlurredValue>
 */
export function BlurredValue({ children, blurred, containerStyle }: BlurredValueProps) {
  if (!blurred) {
    if (containerStyle) {
      return <View style={containerStyle}>{children}</View>;
    }
    return <>{children}</>;
  }

  return (
    <Pressable
      onPress={() => router.push("/paywall" as any)}
      style={containerStyle}
      hitSlop={6}
    >
      {/* Render at opacity 0 so the element takes up the exact same layout space */}
      <View style={{ opacity: 0 }} accessible={false} importantForAccessibility="no-hide-descendants">
        {children}
      </View>
      {/* Smear overlay — matches the hidden content's bounds */}
      <View style={styles.smear} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  smear: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(78, 78, 100, 0.92)",
    borderRadius: 5,
    margin: 1,
  },
});
