import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, Platform, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Accelerometer from "expo-sensors/build/Accelerometer";
import Colors from "@/constants/colors";

interface SpiritLevelProps {
  visible: boolean;
}

interface TiltData {
  x: number;
  y: number;
}

const LEVEL_THRESHOLD = 2;
const BUBBLE_RANGE = 40;

export default function SpiritLevel({ visible }: SpiritLevelProps) {
  const [tilt, setTilt] = useState<TiltData>({ x: 0, y: 0 });
  const [isLevel, setIsLevel] = useState(false);
  const [sensorAvailable, setSensorAvailable] = useState(true);
  const subscriptionRef = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible || Platform.OS === "web") {
      setSensorAvailable(Platform.OS !== "web");
      return;
    }

    try {
      Accelerometer.setUpdateInterval(100);

      subscriptionRef.current = Accelerometer.addListener(
        (data: { x: number; y: number; z: number }) => {
          const tiltX = Math.round(Math.atan2(data.x, data.z) * (180 / Math.PI));
          const tiltY = Math.round(Math.atan2(data.y, data.z) * (180 / Math.PI));
          setTilt({ x: tiltX, y: tiltY });

          const level =
            Math.abs(tiltX) <= LEVEL_THRESHOLD &&
            Math.abs(tiltY) <= LEVEL_THRESHOLD;
          setIsLevel(level);
        }
      );
    } catch {
      setSensorAvailable(false);
    }

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
    };
  }, [visible]);

  useEffect(() => {
    if (isLevel) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isLevel]);

  if (!visible) return null;

  if (!sensorAvailable) {
    return null;
  }

  const bubbleX = Math.max(-BUBBLE_RANGE, Math.min(BUBBLE_RANGE, tilt.x * 3));
  const bubbleY = Math.max(-BUBBLE_RANGE, Math.min(BUBBLE_RANGE, -tilt.y * 3));

  const levelColor = isLevel ? "#10B981" : Colors.primary;
  const statusText = isLevel ? "Level" : "Tilt to align";

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.levelCircle,
          {
            borderColor: levelColor,
            transform: [{ scale: isLevel ? pulseAnim : 1 }],
          },
        ]}
      >
        <View style={styles.crosshairH} />
        <View style={styles.crosshairV} />
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: levelColor,
              transform: [
                { translateX: bubbleX },
                { translateY: bubbleY },
              ],
            },
          ]}
        />
        <View
          style={[
            styles.centerDot,
            { borderColor: levelColor },
          ]}
        />
      </Animated.View>
      <View style={styles.statusRow}>
        <Ionicons
          name={isLevel ? "checkmark-circle" : "navigate-outline"}
          size={14}
          color={levelColor}
        />
        <Text style={[styles.statusText, { color: levelColor }]}>
          {statusText}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 6,
  },
  levelCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    overflow: "hidden",
  },
  crosshairH: {
    position: "absolute",
    width: "100%",
    height: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  crosshairV: {
    position: "absolute",
    width: 1,
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  bubble: {
    width: 14,
    height: 14,
    borderRadius: 7,
    opacity: 0.9,
  },
  centerDot: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    opacity: 0.5,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statusText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
});
