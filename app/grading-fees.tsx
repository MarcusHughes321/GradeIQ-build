import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Linking } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

type CompanyKey = "psa" | "bgs" | "cgc" | "ace" | "tag";

interface FeeTier {
  name: string;
  price: string;
  turnaround: string;
  maxValue?: string;
  minCards?: number;
  note?: string;
}

interface LabelOption {
  name: string;
  price: string;
  description: string;
}

interface CompanyFees {
  key: CompanyKey;
  label: string;
  color: string;
  currency: string;
  lastUpdated: string;
  sourceUrl: string;
  sourceLabel: string;
  tiers: FeeTier[];
  labels?: LabelOption[];
  notes?: string;
}

const COMPANY_FEES: CompanyFees[] = [
  {
    key: "psa",
    label: "PSA",
    color: "#1E56A0",
    currency: "USD",
    lastUpdated: "Feb 2026",
    sourceUrl: "https://www.psacard.com/services/tradingcardgrading",
    sourceLabel: "psacard.com",
    tiers: [
      {
        name: "Value Bulk",
        price: "$21.99",
        turnaround: "65+ business days",
        maxValue: "$200",
        minCards: 20,
        note: "PSA Collectors Club membership required",
      },
      {
        name: "Value",
        price: "$27.99",
        turnaround: "45–65 business days",
        maxValue: "$500",
      },
      {
        name: "Value Plus",
        price: "$44.99",
        turnaround: "30–45 business days",
        maxValue: "$500",
      },
      {
        name: "Value Max",
        price: "$59.99",
        turnaround: "20–30 business days",
        maxValue: "$500",
      },
      {
        name: "Regular",
        price: "$79.99",
        turnaround: "~10 business days",
        maxValue: "$999",
      },
      {
        name: "Express",
        price: "$149.99",
        turnaround: "~5 business days",
        maxValue: "$2,499",
      },
      {
        name: "Super Express",
        price: "$299.99",
        turnaround: "~2 business days",
        maxValue: "$4,999",
      },
      {
        name: "Walk-Through",
        price: "$499.99",
        turnaround: "Same day",
        maxValue: "$9,999",
      },
    ],
    notes: "Prices exclude shipping, insurance and handling. Membership can reduce fees.",
  },
  {
    key: "bgs",
    label: "BGS",
    color: "#1A1A2E",
    currency: "USD",
    lastUpdated: "2025",
    sourceUrl: "https://www.beckett.com/grading-pricing-turnaroundtimes",
    sourceLabel: "beckett.com",
    tiers: [
      {
        name: "Economy",
        price: "$20",
        turnaround: "20–25 business days",
        maxValue: "$499",
        note: "Add $15 for sub-grades",
      },
      {
        name: "Standard",
        price: "$30",
        turnaround: "10–15 business days",
        maxValue: "$999",
        note: "Add $20 for sub-grades",
      },
      {
        name: "Express",
        price: "$100",
        turnaround: "5–7 business days",
        maxValue: "$1,499",
        note: "Add $50 for sub-grades",
      },
      {
        name: "Super Express",
        price: "$125",
        turnaround: "1–3 business days",
        note: "Add $125 for sub-grades",
      },
    ],
    notes: "BGS provides 4 sub-grade scores (centering, corners, edges, surface). Sub-grades add to the base fee.",
  },
  {
    key: "cgc",
    label: "CGC",
    color: "#00AEEF",
    currency: "USD",
    lastUpdated: "Jan 2026",
    sourceUrl: "https://www.cgccomics.com/cards/submit/",
    sourceLabel: "cgccomics.com",
    tiers: [
      {
        name: "Bulk",
        price: "$15",
        turnaround: "~40 days",
        maxValue: "$500",
      },
      {
        name: "Economy",
        price: "$18",
        turnaround: "~20 days",
        maxValue: "$1,000",
      },
      {
        name: "Standard",
        price: "$55",
        turnaround: "~10 days",
        maxValue: "$3,000",
      },
      {
        name: "Express",
        price: "$100",
        turnaround: "~5 days",
        maxValue: "$10,000",
      },
    ],
    notes: "Prices reflect the January 2026 update. CGC uses a 10-point scale with half-point grades.",
  },
  {
    key: "ace",
    label: "ACE",
    color: "#C62828",
    currency: "GBP",
    lastUpdated: "Jul 2025",
    sourceUrl: "https://acegrading.com/services",
    sourceLabel: "acegrading.com",
    tiers: [
      {
        name: "Basic",
        price: "£12",
        turnaround: "~80 business days",
        minCards: 20,
        note: "Min 20 cards, max 50 per submission",
      },
      {
        name: "Standard",
        price: "£15",
        turnaround: "~30 business days",
        minCards: 10,
        note: "Min 10 cards, max 50 per submission",
      },
      {
        name: "Premier",
        price: "£18",
        turnaround: "~15 business days",
        minCards: 5,
        note: "Min 5 cards, max 50 per submission",
      },
      {
        name: "Ultra",
        price: "£25",
        turnaround: "~5 business days",
        note: "Max 50 cards per submission",
      },
      {
        name: "Luxury",
        price: "£50",
        turnaround: "~2 business days",
        note: "Max 50 cards per submission",
      },
    ],
    labels: [
      {
        name: "Standard Label",
        price: "Included",
        description: "Clean white ACE label with card details and grade. Included in all tiers.",
      },
      {
        name: "Colour Match",
        price: "+£1 per card",
        description: "Label coloured to match the card's palette. A subtle upgrade over the standard white label.",
      },
      {
        name: "Custom Ace Label",
        price: "+£3 per card",
        description: "Fully custom artwork label designed around your specific card. Applied by ACE's design team.",
      },
    ],
    notes: "Turnaround times start from the first full business day after receipt. Shipping is not included.",
  },
  {
    key: "tag",
    label: "TAG",
    color: "#FF6B00",
    currency: "USD",
    lastUpdated: "2025",
    sourceUrl: "https://taggrading.com/pages/pricing",
    sourceLabel: "taggrading.com",
    tiers: [
      {
        name: "Basic",
        price: "$22",
        turnaround: "45+ business days",
        minCards: 10,
        note: "Min 10 cards. DIG Standard report",
      },
      {
        name: "Standard",
        price: "$39",
        turnaround: "~15 business days",
        note: "Includes TAG Score & DIG+ report",
      },
      {
        name: "Express",
        price: "$59",
        turnaround: "~5 business days",
        note: "Includes TAG Score & DIG+ report",
      },
      {
        name: "Super Express",
        price: "$99",
        turnaround: "~2 business days",
        note: "Includes TAG Score & DIG+ report",
      },
    ],
    notes: "All tiers include raw card images, HD slab images, UV protection and QR-accessible DIG grading reports.",
  },
];

const COMPANY_COLORS: Record<CompanyKey, string> = {
  psa: "#1E56A0",
  bgs: "#4A4A8A",
  cgc: "#00AEEF",
  ace: "#C62828",
  tag: "#FF6B00",
};

export default function GradingFeesScreen() {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<CompanyKey>("psa");

  const company = COMPANY_FEES.find(c => c.key === selected)!;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Grading Fees</Text>
          <Text style={styles.subtitle}>Service tiers & pricing by company</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {/* Company tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabContent}
      >
        {COMPANY_FEES.map(c => (
          <Pressable
            key={c.key}
            onPress={() => setSelected(c.key)}
            style={[
              styles.tab,
              selected === c.key && { backgroundColor: COMPANY_COLORS[c.key], borderColor: COMPANY_COLORS[c.key] },
            ]}
          >
            <Text style={[styles.tabLabel, selected === c.key && styles.tabLabelActive]}>
              {c.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: botPad + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Source link banner */}
        <Pressable
          onPress={() => Linking.openURL(company.sourceUrl)}
          style={({ pressed }) => [
            styles.sourceBanner,
            { borderColor: COMPANY_COLORS[selected] + "55", opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <View style={[styles.sourceBannerDot, { backgroundColor: COMPANY_COLORS[selected] }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.sourceBannerLabel}>Official source · {company.lastUpdated}</Text>
            <Text style={[styles.sourceBannerUrl, { color: COMPANY_COLORS[selected] }]}>
              {company.sourceLabel}
            </Text>
          </View>
          <Ionicons name="open-outline" size={15} color={COMPANY_COLORS[selected]} />
        </Pressable>

        {/* Disclaimer banner */}
        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.disclaimerText}>
            Prices shown are estimates. Always confirm the latest fees before submitting cards.
          </Text>
        </View>

        {/* Tier cards */}
        {company.tiers.map((tier, i) => (
          <View key={i} style={styles.tierCard}>
            <View style={styles.tierHeader}>
              <Text style={styles.tierName}>{tier.name}</Text>
              <Text style={[styles.tierPrice, { color: COMPANY_COLORS[selected] }]}>{tier.price}</Text>
            </View>
            <View style={styles.tierDetails}>
              <View style={styles.tierDetail}>
                <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.tierDetailText}>{tier.turnaround}</Text>
              </View>
              {tier.maxValue && (
                <View style={styles.tierDetail}>
                  <Ionicons name="pricetag-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.tierDetailText}>Max declared value: {tier.maxValue}</Text>
                </View>
              )}
              {tier.minCards && (
                <View style={styles.tierDetail}>
                  <Ionicons name="albums-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.tierDetailText}>Minimum {tier.minCards} cards</Text>
                </View>
              )}
              {tier.note && (
                <View style={styles.tierDetail}>
                  <Ionicons name="alert-circle-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.tierDetailText}>{tier.note}</Text>
                </View>
              )}
            </View>
          </View>
        ))}

        {/* Custom Labels section (ACE only) */}
        {company.labels && company.labels.length > 0 && (
          <View style={styles.labelsSection}>
            <View style={styles.labelsSectionHeader}>
              <Ionicons name="color-palette-outline" size={15} color={COMPANY_COLORS[selected]} />
              <Text style={[styles.labelsSectionTitle, { color: COMPANY_COLORS[selected] }]}>
                Custom Labels
              </Text>
            </View>
            {company.labels.map((lbl, i) => (
              <View
                key={i}
                style={[styles.labelCard, i === company.labels!.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={styles.labelCardHeader}>
                  <Text style={styles.labelName}>{lbl.name}</Text>
                  <Text style={[styles.labelPrice, { color: COMPANY_COLORS[selected] }]}>{lbl.price}</Text>
                </View>
                <Text style={styles.labelDesc}>{lbl.description}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Company notes */}
        {company.notes && (
          <View style={styles.notesBox}>
            <Text style={styles.notesText}>{company.notes}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    alignItems: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.text,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 1,
    fontFamily: "Inter_400Regular",
  },
  tabScroll: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  tabContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexDirection: "row",
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
  },
  tabLabelActive: {
    color: "#fff",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 10,
  },
  disclaimer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
  },
  disclaimerText: {
    fontSize: 12,
    color: Colors.textMuted,
    flex: 1,
    fontFamily: "Inter_400Regular",
  },
  tierCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  tierHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  tierName: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.text,
    fontFamily: "Inter_700Bold",
  },
  tierPrice: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  tierDetails: {
    gap: 5,
  },
  tierDetail: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  tierDetailText: {
    fontSize: 13,
    color: Colors.textMuted,
    flex: 1,
    fontFamily: "Inter_400Regular",
  },
  notesBox: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: Colors.surfaceBorder,
  },
  notesText: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
    fontFamily: "Inter_400Regular",
  },
  labelsSection: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  labelsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  labelsSectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  labelCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    gap: 4,
  },
  labelCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  labelName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  labelPrice: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  labelDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 17,
  },
  sourceBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  sourceBannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sourceBannerLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  sourceBannerUrl: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
});
