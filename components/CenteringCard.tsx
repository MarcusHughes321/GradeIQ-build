import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  LayoutChangeEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import type { CenteringMeasurement } from "@/lib/types";

interface CenteringCardProps {
  centering: CenteringMeasurement;
  onCenteringChange: (centering: CenteringMeasurement) => void;
}

function formatRatio(value: number): string {
  const other = 100 - value;
  return `${value}/${other}`;
}

function getCenteringColor(value: number): string {
  if (value <= 52) return "#10B981";
  if (value <= 55) return "#34D399";
  if (value <= 60) return "#F59E0B";
  if (value <= 65) return "#FB923C";
  return "#EF4444";
}

function getCenteringLabel(value: number): string {
  if (value <= 52) return "Excellent";
  if (value <= 55) return "Good";
  if (value <= 60) return "Acceptable";
  if (value <= 65) return "Below Average";
  return "Poor";
}

interface SliderRowProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  axis: "L/R" | "T/B";
}

function SliderRow({ label, value, onChange, axis }: SliderRowProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const color = getCenteringColor(value);
  const ratio = formatRatio(value);
  const pct = ((value - 50) / 45) * 100;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      if (trackWidth > 0) {
        const x = evt.nativeEvent.locationX;
        const newVal = Math.round(50 + (x / trackWidth) * 45);
        onChange(Math.max(50, Math.min(95, newVal)));
      }
    },
    onPanResponderMove: (evt) => {
      if (trackWidth > 0) {
        const x = evt.nativeEvent.locationX;
        const newVal = Math.round(50 + (x / trackWidth) * 45);
        onChange(Math.max(50, Math.min(95, newVal)));
      }
    },
  });

  const leftLabel = axis === "L/R" ? "L" : "T";
  const rightLabel = axis === "L/R" ? "R" : "B";

  return (
    <View style={sliderStyles.row}>
      <View style={sliderStyles.labelRow}>
        <Text style={sliderStyles.label}>{label}</Text>
        <Text style={[sliderStyles.ratio, { color }]}>{ratio}</Text>
      </View>
      <View style={sliderStyles.sliderContainer}>
        <Text style={sliderStyles.axisLabel}>{leftLabel}</Text>
        <View
          style={sliderStyles.track}
          onLayout={onLayout}
          {...panResponder.panHandlers}
        >
          <View style={sliderStyles.trackBackground}>
            <View style={[sliderStyles.perfectZone, { left: "0%", width: "11%" }]} />
          </View>
          <View
            style={[
              sliderStyles.thumb,
              {
                left: `${pct}%`,
                backgroundColor: color,
              },
            ]}
          />
          {value > 50 && (
            <View
              style={[
                sliderStyles.fillBar,
                {
                  width: `${pct}%`,
                  backgroundColor: color + "40",
                },
              ]}
            />
          )}
        </View>
        <Text style={sliderStyles.axisLabel}>{rightLabel}</Text>
      </View>
    </View>
  );
}

export default function CenteringCard({ centering, onCenteringChange }: CenteringCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localCentering, setLocalCentering] = useState<CenteringMeasurement>(centering);

  const worstValue = Math.max(
    localCentering.frontLeftRight,
    localCentering.frontTopBottom,
    localCentering.backLeftRight,
    localCentering.backTopBottom
  );
  const overallColor = getCenteringColor(worstValue);
  const overallLabel = getCenteringLabel(worstValue);

  const handleChange = (key: keyof CenteringMeasurement, val: number) => {
    const updated = { ...localCentering, [key]: val };
    setLocalCentering(updated);
  };

  const handleSave = () => {
    onCenteringChange(localCentering);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setLocalCentering(centering);
    setIsEditing(false);
  };

  const c = isEditing ? localCentering : centering;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconCircle, { backgroundColor: overallColor + "20" }]}>
            <Ionicons name="scan-outline" size={18} color={overallColor} />
          </View>
          <View>
            <Text style={styles.title}>Centering Analysis</Text>
            <Text style={[styles.verdict, { color: overallColor }]}>{overallLabel}</Text>
          </View>
        </View>
        {!isEditing ? (
          <Pressable
            onPress={() => setIsEditing(true)}
            style={({ pressed }) => [styles.editBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="pencil" size={16} color={Colors.primary} />
            <Text style={styles.editBtnText}>Adjust</Text>
          </Pressable>
        ) : (
          <View style={styles.editActions}>
            <Pressable
              onPress={handleCancel}
              style={({ pressed }) => [styles.actionBtn, styles.cancelBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Ionicons name="close" size={16} color={Colors.textMuted} />
            </Pressable>
            <Pressable
              onPress={handleSave}
              style={({ pressed }) => [styles.actionBtn, styles.saveBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Front</Text>
      <SliderRow
        label="Left / Right"
        value={c.frontLeftRight}
        onChange={(val) => isEditing && handleChange("frontLeftRight", val)}
        axis="L/R"
      />
      <SliderRow
        label="Top / Bottom"
        value={c.frontTopBottom}
        onChange={(val) => isEditing && handleChange("frontTopBottom", val)}
        axis="T/B"
      />

      <View style={styles.spacer} />

      <Text style={styles.sectionLabel}>Back</Text>
      <SliderRow
        label="Left / Right"
        value={c.backLeftRight}
        onChange={(val) => isEditing && handleChange("backLeftRight", val)}
        axis="L/R"
      />
      <SliderRow
        label="Top / Bottom"
        value={c.backTopBottom}
        onChange={(val) => isEditing && handleChange("backTopBottom", val)}
        axis="T/B"
      />

      {isEditing && (
        <View style={styles.editHint}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.editHintText}>
            Drag the sliders to adjust centering. 50/50 is perfect centering. Tap the checkmark to save.
          </Text>
        </View>
      )}
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  row: {
    gap: 6,
    paddingVertical: 6,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  ratio: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  sliderContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  axisLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: Colors.textMuted,
    width: 14,
    textAlign: "center",
  },
  track: {
    flex: 1,
    height: 28,
    justifyContent: "center",
  },
  trackBackground: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceBorder,
    overflow: "hidden",
  },
  perfectZone: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(16, 185, 129, 0.3)",
    borderRadius: 3,
  },
  fillBar: {
    position: "absolute",
    left: 0,
    top: 11,
    height: 6,
    borderRadius: 3,
  },
  thumb: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    marginLeft: -9,
    top: 5,
    borderWidth: 2,
    borderColor: "#fff",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  verdict: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    marginTop: 1,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: Colors.primary + "15",
  },
  editBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.primary,
  },
  editActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    backgroundColor: Colors.surfaceBorder,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: 14,
  },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
    marginBottom: 2,
  },
  spacer: {
    height: 10,
  },
  editHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  editHintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 16,
    flex: 1,
  },
});
