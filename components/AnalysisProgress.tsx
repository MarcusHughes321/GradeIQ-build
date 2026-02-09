import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";

const STAGES = [
  { label: "Uploading images", icon: "cloud-upload" as const, pct: 10 },
  { label: "Analyzing centering", icon: "scan" as const, pct: 25 },
  { label: "Checking corners & edges", icon: "search" as const, pct: 45 },
  { label: "Evaluating surface condition", icon: "eye" as const, pct: 65 },
  { label: "Calculating grades", icon: "calculator" as const, pct: 80 },
  { label: "Finalizing results", icon: "checkmark-circle" as const, pct: 90 },
];

interface AnalysisProgressProps {
  visible: boolean;
}

export default function AnalysisProgress({ visible }: AnalysisProgressProps) {
  const [percentage, setPercentage] = useState(0);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    if (visible) {
      startTimeRef.current = Date.now();
      setPercentage(0);
      setCurrentStageIndex(0);
      setElapsedSecs(0);
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
        const secs = Math.floor(elapsed / 1000);
        setElapsedSecs(secs);

        let pct: number;
        let stageIdx: number;

        if (elapsed < 5000) {
          pct = (elapsed / 5000) * 10;
          stageIdx = 0;
        } else if (elapsed < 12000) {
          pct = 10 + ((elapsed - 5000) / 7000) * 15;
          stageIdx = 1;
        } else if (elapsed < 22000) {
          pct = 25 + ((elapsed - 12000) / 10000) * 20;
          stageIdx = 2;
        } else if (elapsed < 32000) {
          pct = 45 + ((elapsed - 22000) / 10000) * 20;
          stageIdx = 3;
        } else if (elapsed < 42000) {
          pct = 65 + ((elapsed - 32000) / 10000) * 15;
          stageIdx = 4;
        } else {
          const extraTime = elapsed - 42000;
          const remaining = 10 * (1 - Math.exp(-extraTime / 30000));
          pct = 80 + remaining;
          stageIdx = 5;
        }

        pct = Math.min(pct, 92);
        const roundedPct = Math.round(pct);

        setPercentage(roundedPct);
        setCurrentStageIndex(stageIdx);

        Animated.timing(progressAnim, {
          toValue: pct / 100,
          duration: 200,
          useNativeDriver: false,
        }).start();
      }, 150);
    } else {
      if (percentage > 0 && startTimeRef.current > 0) {
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

  const getStatusText = () => {
    if (percentage >= 90) {
      return "Waiting for AI response...";
    }
    if (elapsedSecs < 5) {
      return "This usually takes 15-30 seconds";
    }
    return `${elapsedSecs}s elapsed`;
  };

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

        <Text style={styles.estimateText}>{getStatusText()}</Text>
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
