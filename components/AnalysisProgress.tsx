import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";

const STAGES = [
  { label: "Uploading images", icon: "cloud-upload" as const, duration: 2000 },
  { label: "Analyzing centering", icon: "scan" as const, duration: 4000 },
  { label: "Checking corners & edges", icon: "search" as const, duration: 5000 },
  { label: "Evaluating surface condition", icon: "eye" as const, duration: 4000 },
  { label: "Calculating grades", icon: "calculator" as const, duration: 3000 },
  { label: "Finalizing results", icon: "checkmark-circle" as const, duration: 2000 },
];

const TOTAL_ESTIMATED_TIME = STAGES.reduce((sum, s) => sum + s.duration, 0);

interface AnalysisProgressProps {
  visible: boolean;
}

export default function AnalysisProgress({ visible }: AnalysisProgressProps) {
  const [percentage, setPercentage] = useState(0);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const stageOpacity = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    if (visible) {
      startTimeRef.current = Date.now();
      setPercentage(0);
      setCurrentStageIndex(0);
      progressAnim.setValue(0);
      fadeAnim.setValue(0);

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();

      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        const rawProgress = Math.min(elapsed / TOTAL_ESTIMATED_TIME, 0.95);
        const smoothProgress = rawProgress < 0.8
          ? rawProgress
          : 0.8 + (rawProgress - 0.8) * 0.5;
        const pct = Math.round(smoothProgress * 100);
        setPercentage(pct);

        let accumulated = 0;
        let stageIdx = 0;
        for (let i = 0; i < STAGES.length; i++) {
          accumulated += STAGES[i].duration;
          if (elapsed < accumulated) {
            stageIdx = i;
            break;
          }
          if (i === STAGES.length - 1) {
            stageIdx = STAGES.length - 1;
          }
        }
        setCurrentStageIndex(stageIdx);

        Animated.timing(progressAnim, {
          toValue: smoothProgress,
          duration: 200,
          useNativeDriver: false,
        }).start();
      }, 100);
    } else {
      if (percentage > 0) {
        setPercentage(100);
        setCurrentStageIndex(STAGES.length - 1);
        Animated.timing(progressAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        }).start();

        setTimeout(() => {
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }).start();
        }, 400);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [visible]);

  if (!visible && percentage === 0) return null;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const currentStage = STAGES[currentStageIndex];

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <View style={styles.card}>
        <Animated.View style={[styles.iconWrap, { transform: [{ scale: pulseAnim }] }]}>
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientEnd]}
            style={styles.iconGradient}
          >
            <Ionicons name={currentStage.icon} size={32} color="#fff" />
          </LinearGradient>
        </Animated.View>

        <Text style={styles.percentText}>{percentage}%</Text>
        <Text style={styles.stageLabel}>{currentStage.label}...</Text>

        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]}>
            <LinearGradient
              colors={[Colors.gradientStart, Colors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>

        <View style={styles.stepsRow}>
          {STAGES.map((stage, i) => (
            <View key={i} style={styles.stepDot}>
              <View
                style={[
                  styles.dot,
                  i <= currentStageIndex && styles.dotActive,
                  i === currentStageIndex && styles.dotCurrent,
                ]}
              />
            </View>
          ))}
        </View>

        <Text style={styles.estimateText}>
          {percentage < 95
            ? `Estimated ${Math.max(1, Math.ceil((TOTAL_ESTIMATED_TIME - (Date.now() - startTimeRef.current)) / 1000))}s remaining`
            : "Almost done..."}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    width: "80%",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  iconWrap: {
    marginBottom: 20,
  },
  iconGradient: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  percentText: {
    fontFamily: "Inter_700Bold",
    fontSize: 40,
    color: Colors.text,
    marginBottom: 4,
  },
  stageLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  progressTrack: {
    width: "100%",
    height: 8,
    backgroundColor: Colors.surfaceBorder,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 16,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    overflow: "hidden",
  },
  stepsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  stepDot: {
    alignItems: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surfaceBorder,
  },
  dotActive: {
    backgroundColor: Colors.primary,
  },
  dotCurrent: {
    backgroundColor: Colors.gradientEnd,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  estimateText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
});
