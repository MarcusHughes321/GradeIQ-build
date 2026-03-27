import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { useSubscription } from "@/lib/subscription";

type CompanyId = "PSA" | "BGS" | "ACE" | "CGC" | "TAG";

interface GradeData {
  grade: number;
  gradedValueGBP: number;
  profitGBP: number;
  isProfitable: boolean;
}

interface CompanyData {
  id: CompanyId;
  name: string;
  submissionFeeGBP: number;
  turnaround: string;
  grades: GradeData[];
  minProfitableGrade: number | null;
}

interface ProfitData {
  card: {
    id: string;
    name: string;
    setName: string;
    number: string;
    imageUrl: string | null;
  };
  rawPriceGBP: number | null;
  noPriceData: boolean;
  companies: CompanyData[];
  priceLastUpdated?: string;
}

const COMPANIES: CompanyId[] = ["PSA", "BGS", "ACE", "CGC", "TAG"];

const AMBER = "#F59E0B";
const GREEN = "#34D399";
const RED = "#EF4444";

function gradeLabel(grade: number): string {
  if (grade === 8.5) return "8.5";
  if (grade === 9.5) return "9.5";
  return String(grade);
}

export default function CardProfitScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const { cardId, cardName } = useLocalSearchParams<{ cardId: string; cardName?: string }>();
  const { isSubscribed, isAdminMode, isGateEnabled } = useSubscription();
  const isPaid = isAdminMode || !isGateEnabled || isSubscribed;

  const [selectedCompany, setSelectedCompany] = useState<CompanyId>("PSA");

  const { data, isLoading, error } = useQuery<ProfitData>({
    queryKey: ["/api/cards/profit", cardId],
    queryFn: async () => {
      const resp = await apiRequest("GET", `/api/cards/profit?cardId=${encodeURIComponent(cardId || "")}`);
      return resp.json();
    },
    enabled: !!cardId,
    staleTime: 5 * 60 * 1000,
  });

  const activeCompany = data?.companies.find((c) => c.id === selectedCompany);

  const formatGBP = (amount: number) => {
    if (Math.abs(amount) >= 1000) {
      return `£${(amount / 1000).toFixed(1)}k`;
    }
    return `£${amount.toFixed(2)}`;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1 }]}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.navTitle} numberOfLines={1}>Card Values</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading price data…</Text>
        </View>
      )}

      {!isLoading && error && (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={36} color={Colors.error} />
          <Text style={styles.errorText}>Failed to load card data</Text>
          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go back</Text>
          </Pressable>
        </View>
      )}

      {!isLoading && data && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + webBottomInset + 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Card Header */}
          <View style={styles.cardHeader}>
            {data.card.imageUrl ? (
              <Image
                source={{ uri: data.card.imageUrl }}
                style={styles.cardImage}
                contentFit="contain"
              />
            ) : (
              <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
                <Ionicons name="image-outline" size={32} color={Colors.textMuted} />
              </View>
            )}
            <View style={styles.cardMeta}>
              <Text style={styles.cardName}>{data.card.name || cardName}</Text>
              <Text style={styles.cardSet}>{data.card.setName}</Text>
              {data.card.number ? (
                <Text style={styles.cardNumber}>#{data.card.number}</Text>
              ) : null}

              {data.noPriceData ? (
                <View style={styles.noPriceBadge}>
                  <Text style={styles.noPriceText}>No price data</Text>
                </View>
              ) : (
                <View style={styles.rawPriceBadge}>
                  <Text style={styles.rawPriceLabel}>Raw market value</Text>
                  <Text style={styles.rawPriceValue}>
                    {data.rawPriceGBP != null ? formatGBP(data.rawPriceGBP) : "—"}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {data.noPriceData ? (
            <View style={styles.noPriceContainer}>
              <Ionicons name="information-circle-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.noPriceTitle}>No TCGPlayer price data available</Text>
              <Text style={styles.noPriceBody}>
                This card doesn't have market pricing data on TCGPlayer. Try searching for a different version or printing.
              </Text>
            </View>
          ) : (
            <>
              {/* Company Pill Selector */}
              <View style={styles.pillRow}>
                {COMPANIES.map((company) => {
                  const companyData = data.companies.find((c) => c.id === company);
                  const isActive = selectedCompany === company;
                  return (
                    <Pressable
                      key={company}
                      style={({ pressed }) => [
                        styles.pill,
                        isActive && styles.pillActive,
                        { opacity: pressed ? 0.8 : 1 },
                      ]}
                      onPress={() => setSelectedCompany(company)}
                    >
                      <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                        {company}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Company Details */}
              {activeCompany && (
                <View style={styles.companyDetails}>
                  {isPaid && (
                    <View style={styles.companyMeta}>
                      <View style={styles.companyMetaItem}>
                        <Ionicons name="cash-outline" size={14} color={Colors.textMuted} />
                        <Text style={styles.companyMetaText}>
                          Submission: £{activeCompany.submissionFeeGBP}
                        </Text>
                      </View>
                      <View style={styles.companyMetaItem}>
                        <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                        <Text style={styles.companyMetaText}>{activeCompany.turnaround}</Text>
                      </View>
                    </View>
                  )}

                  {/* Grade Cards */}
                  <View style={styles.gradeStack}>
                    {activeCompany.grades.map((grade) => {
                      const isMinProfit = grade.grade === activeCompany.minProfitableGrade;
                      const isAboveMin =
                        activeCompany.minProfitableGrade !== null &&
                        grade.grade > activeCompany.minProfitableGrade &&
                        grade.isProfitable;
                      const isLoss = !grade.isProfitable;

                      let borderColor = RED;
                      let bgColor = "rgba(239,68,68,0.08)";
                      let profitColor = RED;
                      let gradeTextColor = Colors.textSecondary;

                      if (isMinProfit) {
                        borderColor = AMBER;
                        bgColor = "rgba(245,158,11,0.12)";
                        profitColor = AMBER;
                        gradeTextColor = Colors.text;
                      } else if (isAboveMin) {
                        borderColor = GREEN;
                        bgColor = "rgba(52,211,153,0.08)";
                        profitColor = GREEN;
                        gradeTextColor = Colors.text;
                      }

                      const cardStyle = [
                        styles.gradeCard,
                        { backgroundColor: bgColor, borderColor },
                        isMinProfit && styles.gradeCardHighlight,
                      ];

                      return (
                        <View key={grade.grade} style={cardStyle}>
                          <View style={styles.gradeCardLeft}>
                            <Text style={[styles.gradeLabel, { color: gradeTextColor }]}>
                              Grade {gradeLabel(grade.grade)}
                            </Text>
                            {isMinProfit && (
                              <View style={styles.minProfitBadge}>
                                <Text style={styles.minProfitBadgeText}>Min. profit grade</Text>
                              </View>
                            )}
                          </View>

                          <View style={styles.gradeCardRight}>
                            <Text style={[styles.gradedValue, { color: gradeTextColor }]}>
                              {formatGBP(grade.gradedValueGBP)}
                            </Text>
                            {isPaid ? (
                              <Text style={[styles.profitLabel, { color: profitColor }]}>
                                {grade.profitGBP >= 0 ? "+" : ""}
                                {formatGBP(grade.profitGBP)} profit
                              </Text>
                            ) : (
                              <View style={styles.blurredProfit}>
                                <View style={styles.blurBlock} />
                                <Text style={[styles.profitStatus, { color: profitColor }]}>
                                  {isLoss ? "Loss" : isMinProfit ? "Break even" : "Profit"}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  {/* Free user upgrade prompt */}
                  {!isPaid && (
                    <Pressable
                      style={({ pressed }) => [styles.upgradeCard, { opacity: pressed ? 0.9 : 1 }]}
                      onPress={() => router.push("/paywall")}
                    >
                      <View style={styles.upgradeLeft}>
                        <Ionicons name="diamond" size={18} color="#F59E0B" />
                        <View style={styles.upgradeText}>
                          <Text style={styles.upgradeTitle}>Unlock exact profit figures</Text>
                          <Text style={styles.upgradeBody}>See precise £ amounts for every grade</Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                    </Pressable>
                  )}

                  {data.priceLastUpdated && (
                    <Text style={styles.priceNote}>{data.priceLastUpdated}</Text>
                  )}
                </View>
              )}
            </>
          )}

          {/* Grade This Card CTA — paid only */}
          {isPaid && (
            <Pressable
              style={({ pressed }) => [styles.gradeCta, { opacity: pressed ? 0.9 : 1 }]}
              onPress={() => router.push("/(tabs)/grade")}
            >
              <Ionicons name="scan-outline" size={20} color="#fff" />
              <Text style={styles.gradeCtaText}>Grade This Card</Text>
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: Colors.text,
    flex: 1,
    textAlign: "center",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  loadingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.error,
    textAlign: "center",
  },
  backLink: {
    marginTop: 8,
  },
  backLinkText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: Colors.primary,
  },
  scroll: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  cardImage: {
    width: 80,
    height: 112,
    borderRadius: 6,
  },
  cardImagePlaceholder: {
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  cardMeta: {
    flex: 1,
    gap: 4,
    justifyContent: "center",
  },
  cardName: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
    lineHeight: 24,
  },
  cardSet: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  cardNumber: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 6,
  },
  rawPriceBadge: {
    alignSelf: "flex-start",
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginTop: 4,
  },
  rawPriceLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  rawPriceValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  noPriceBadge: {
    alignSelf: "flex-start",
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginTop: 6,
  },
  noPriceText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textMuted,
  },
  noPriceContainer: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 48,
    gap: 12,
  },
  noPriceTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: Colors.text,
    textAlign: "center",
  },
  noPriceBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  pillRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
    flexWrap: "wrap",
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  pillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  pillTextActive: {
    color: "#fff",
  },
  companyDetails: {
    paddingHorizontal: 16,
    gap: 16,
  },
  companyMeta: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  companyMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  companyMetaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  gradeStack: {
    gap: 8,
  },
  gradeCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  gradeCardHighlight: {
    paddingVertical: 18,
  },
  gradeCardLeft: {
    gap: 4,
  },
  gradeLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.textSecondary,
  },
  minProfitBadge: {
    backgroundColor: "rgba(245,158,11,0.2)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  minProfitBadgeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: AMBER,
  },
  gradeCardRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  gradedValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  profitLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  blurredProfit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  blurBlock: {
    width: 60,
    height: 14,
    borderRadius: 4,
    backgroundColor: Colors.surfaceBorder,
    opacity: 0.8,
  },
  profitStatus: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  upgradeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 4,
    justifyContent: "space-between",
  },
  upgradeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  upgradeText: {
    gap: 2,
  },
  upgradeTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  upgradeBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  priceNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 4,
  },
  gradeCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
  },
  gradeCtaText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
  },
});
