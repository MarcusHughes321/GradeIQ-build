import React from "react";
import { View, Text, StyleSheet, Pressable, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";

interface Props {
  visible: boolean;
  onClose: () => void;
}

const FEATURES = [
  { icon: "pricetag-outline" as const, label: "Real eBay last-sold prices for every graded tier (PSA, BGS, ACE, TAG & CGC)" },
  { icon: "calculator-outline" as const, label: "Profit Analysis — see exactly how much you'd make at each grade after fees" },
  { icon: "stats-chart-outline" as const, label: "Market Liquidity score — know how quickly a graded copy actually sells" },
];

export default function ValuesUpgradeSheet({ visible, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={st.backdrop} onPress={onClose}>
        <Pressable style={st.sheet} onPress={e => e.stopPropagation()}>
          {/* Handle */}
          <View style={st.handle} />

          {/* Icon */}
          <View style={st.iconWrap}>
            <Ionicons name="lock-closed" size={26} color={Colors.primary} />
          </View>

          <Text style={st.title}>Pro feature</Text>
          <Text style={st.subtitle}>
            Graded market prices, Profit Analysis and Liquidity scoring are available on any paid plan.
          </Text>

          {/* Feature list */}
          <View style={st.features}>
            {FEATURES.map((f, i) => (
              <View key={i} style={st.featureRow}>
                <View style={st.featureIconWrap}>
                  <Ionicons name={f.icon} size={15} color={Colors.primary} />
                </View>
                <Text style={st.featureText}>{f.label}</Text>
              </View>
            ))}
          </View>

          {/* CTA */}
          <Pressable
            style={({ pressed }) => [st.cta, { opacity: pressed ? 0.85 : 1 }]}
            onPress={() => { onClose(); setTimeout(() => router.push("/paywall"), 300); }}
          >
            <Text style={st.ctaText}>View Plans</Text>
          </Pressable>

          <Pressable style={({ pressed }) => [st.later, { opacity: pressed ? 0.6 : 1 }]} onPress={onClose}>
            <Text style={st.laterText}>Maybe later</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#111111",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "#ffffff12",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ffffff30",
    marginBottom: 20,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#FF3C3115",
    borderWidth: 1,
    borderColor: "#FF3C3130",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: "#ffffff",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  features: { width: "100%", gap: 12, marginBottom: 24 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  featureIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#FF3C3115",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  featureText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#d1d5db",
    lineHeight: 19,
  },
  cta: {
    width: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  ctaText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#ffffff" },
  later: { paddingVertical: 8 },
  laterText: { fontFamily: "Inter_400Regular", fontSize: 14, color: "#6b7280" },
});
