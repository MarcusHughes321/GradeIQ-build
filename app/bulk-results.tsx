import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
} from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getGradings } from "@/lib/storage";
import type { SavedGrading } from "@/lib/types";
import GradeCircle from "@/components/GradeCircle";
import CompanyLabel from "@/components/CompanyLabel";
import { useSettings } from "@/lib/settings-context";

function getGradeColor(grade: number): string {
  if (grade >= 9) return "#10B981";
  if (grade >= 7) return "#F59E0B";
  return "#EF4444";
}

function BulkResultItem({ item, enabledCompanies }: { item: SavedGrading; enabledCompanies: string[] }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.resultItem, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
      onPress={() =>
        router.push({
          pathname: "/results",
          params: { gradingId: item.id },
        })
      }
    >
      <View style={styles.resultTopRow}>
        <Text style={styles.cardName} numberOfLines={1}>
          {item.result.cardName || "Unknown Card"}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </View>
      <View style={styles.resultMiddleRow}>
        <Image source={{ uri: item.frontImage }} style={styles.thumbnail} contentFit="cover" />
        <View style={styles.resultInfo}>
          <Text style={styles.setInfo} numberOfLines={1}>
            {[item.result.setName, item.result.setNumber].filter(Boolean).join(" - ") || "Pokemon Card"}
          </Text>
          <Text style={styles.condition} numberOfLines={1}>
            {item.result.overallCondition}
          </Text>
        </View>
      </View>
      <View style={styles.resultGrades}>
        {enabledCompanies.includes("PSA") && <GradeCircle grade={item.result.psa.grade} size={34} label="PSA" />}
        {enabledCompanies.includes("Beckett") && <GradeCircle grade={item.result.beckett.overallGrade} size={34} label="BGS" />}
        {enabledCompanies.includes("Ace") && <GradeCircle grade={item.result.ace.overallGrade} size={34} label="ACE" />}
        {enabledCompanies.includes("TAG") && item.result.tag && <GradeCircle grade={item.result.tag.overallGrade} size={34} label="TAG" />}
        {enabledCompanies.includes("CGC") && item.result.cgc && <GradeCircle grade={item.result.cgc.grade} size={34} label="CGC" />}
      </View>
    </Pressable>
  );
}

export default function BulkResultsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { settings } = useSettings();
  const enabledCompanies = settings.enabledCompanies;
  const gradingIds = (params.gradingIds as string || "").split(",").filter(Boolean);
  const failedCount = parseInt(params.failedCount as string || "0", 10);
  const failedImages = (params.failedImages as string || "").split("|||").filter(Boolean);

  const [gradings, setGradings] = useState<SavedGrading[]>([]);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  useFocusEffect(
    useCallback(() => {
      loadGradings();
    }, [])
  );

  const loadGradings = async () => {
    const allGradings = await getGradings();
    const matched = gradingIds
      .map((id) => allGradings.find((g) => g.id === id))
      .filter(Boolean) as SavedGrading[];
    setGradings(matched);
  };

  const successCount = gradings.length;
  const totalCount = successCount + failedCount;

  const avgPsa = gradings.length > 0
    ? Math.round((gradings.reduce((s, g) => s + g.result.psa.grade, 0) / gradings.length) * 10) / 10
    : 0;
  const avgBgs = gradings.length > 0
    ? Math.round((gradings.reduce((s, g) => s + g.result.beckett.overallGrade, 0) / gradings.length) * 10) / 10
    : 0;
  const avgAce = gradings.length > 0
    ? Math.round((gradings.reduce((s, g) => s + g.result.ace.overallGrade, 0) / gradings.length) * 10) / 10
    : 0;
  const tagCards = gradings.filter(g => g.result.tag);
  const avgTag = tagCards.length > 0
    ? Math.round((tagCards.reduce((s, g) => s + g.result.tag!.overallGrade, 0) / tagCards.length) * 10) / 10
    : 0;
  const cgcCards = gradings.filter(g => g.result.cgc);
  const avgCgc = cgcCards.length > 0
    ? Math.round((cgcCards.reduce((s, g) => s + g.result.cgc!.grade, 0) / cgcCards.length) * 10) / 10
    : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace("/")}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Bulk Results</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={gradings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <BulkResultItem item={item} enabledCompanies={enabledCompanies} />}
        ListHeaderComponent={
          <View style={styles.summarySection}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Batch Complete</Text>
              <Text style={styles.summarySubtitle}>
                {successCount} of {totalCount} cards graded successfully
                {failedCount > 0 ? ` (${failedCount} failed)` : ""}
              </Text>

              <View style={styles.avgRow}>
                {enabledCompanies.includes("PSA") && (
                  <>
                    <View style={styles.avgItem}>
                      <View style={styles.avgLabelRow}><Text style={styles.avgLabel}>Avg </Text><CompanyLabel company="PSA" fontSize={11} fontFamily="Inter_500Medium" /></View>
                      <Text style={[styles.avgValue, { color: getGradeColor(avgPsa) }]}>{avgPsa}</Text>
                    </View>
                    {(enabledCompanies.includes("Beckett") || enabledCompanies.includes("Ace") || enabledCompanies.includes("TAG") || enabledCompanies.includes("CGC")) && <View style={styles.avgDivider} />}
                  </>
                )}
                {enabledCompanies.includes("Beckett") && (
                  <>
                    <View style={styles.avgItem}>
                      <View style={styles.avgLabelRow}><Text style={styles.avgLabel}>Avg </Text><CompanyLabel company="BGS" fontSize={11} fontFamily="Inter_500Medium" /></View>
                      <Text style={[styles.avgValue, { color: getGradeColor(avgBgs) }]}>{avgBgs}</Text>
                    </View>
                    {(enabledCompanies.includes("Ace") || enabledCompanies.includes("TAG") || enabledCompanies.includes("CGC")) && <View style={styles.avgDivider} />}
                  </>
                )}
                {enabledCompanies.includes("Ace") && (
                  <>
                    <View style={styles.avgItem}>
                      <View style={styles.avgLabelRow}><Text style={styles.avgLabel}>Avg </Text><CompanyLabel company="ACE" fontSize={11} fontFamily="Inter_500Medium" /></View>
                      <Text style={[styles.avgValue, { color: getGradeColor(avgAce) }]}>{avgAce}</Text>
                    </View>
                    {((enabledCompanies.includes("TAG") && tagCards.length > 0) || (enabledCompanies.includes("CGC") && cgcCards.length > 0)) && <View style={styles.avgDivider} />}
                  </>
                )}
                {enabledCompanies.includes("TAG") && tagCards.length > 0 && (
                  <>
                    <View style={styles.avgItem}>
                      <View style={styles.avgLabelRow}><Text style={styles.avgLabel}>Avg </Text><CompanyLabel company="TAG" fontSize={11} fontFamily="Inter_500Medium" /></View>
                      <Text style={[styles.avgValue, { color: getGradeColor(avgTag) }]}>{avgTag}</Text>
                    </View>
                    {(enabledCompanies.includes("CGC") && cgcCards.length > 0) && <View style={styles.avgDivider} />}
                  </>
                )}
                {enabledCompanies.includes("CGC") && cgcCards.length > 0 && (
                  <View style={styles.avgItem}>
                    <View style={styles.avgLabelRow}><Text style={styles.avgLabel}>Avg </Text><CompanyLabel company="CGC" fontSize={11} fontFamily="Inter_500Medium" /></View>
                    <Text style={[styles.avgValue, { color: getGradeColor(avgCgc) }]}>{avgCgc}</Text>
                  </View>
                )}
              </View>
            </View>

            <Text style={styles.listTitle}>Graded Cards</Text>
          </View>
        }
        ListFooterComponent={
          failedCount > 0 ? (
            <View style={styles.failedSection}>
              <Text style={styles.failedTitle}>Failed Cards ({failedCount})</Text>
              <Text style={styles.failedSubtitle}>These cards could not be graded</Text>
              {failedImages.map((uri, idx) => (
                <View key={idx} style={styles.failedItem}>
                  <Image source={{ uri }} style={styles.failedThumbnail} contentFit="cover" />
                  <View style={styles.failedInfo}>
                    <Text style={styles.failedCardLabel}>Card {idx + 1}</Text>
                    <Text style={styles.failedReason}>Grading failed — try again individually</Text>
                  </View>
                  <View style={styles.failedBadge}>
                    <Ionicons name="close-circle" size={22} color="#EF4444" />
                  </View>
                </View>
              ))}
              {failedImages.length === 0 && failedCount > 0 && (
                <View style={styles.failedItem}>
                  <View style={styles.failedInfo}>
                    <Text style={styles.failedCardLabel}>{failedCount} card{failedCount > 1 ? "s" : ""} failed</Text>
                    <Text style={styles.failedReason}>Try grading individually for better results</Text>
                  </View>
                </View>
              )}
            </View>
          ) : null
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + webBottomInset + 20 }]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />
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
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  summarySection: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 20,
  },
  summaryTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
    marginBottom: 4,
  },
  summarySubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 18,
  },
  avgRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  avgItem: {
    alignItems: "center",
    gap: 4,
  },
  avgLabelRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
  },
  avgLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
  },
  avgValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
  },
  avgDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.surfaceBorder,
  },
  listTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
    marginBottom: 12,
  },
  listContent: {
    gap: 0,
  },
  resultItem: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 14,
    gap: 10,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  resultTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  resultMiddleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  thumbnail: {
    width: 48,
    height: 67,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
  },
  resultInfo: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
    flex: 1,
  },
  setInfo: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  condition: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  resultGrades: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    gap: 4,
  },
  failedSection: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  failedTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#EF4444",
    marginBottom: 4,
  },
  failedSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 12,
  },
  failedItem: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#EF444433",
  },
  failedThumbnail: {
    width: 50,
    height: 70,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
  },
  failedInfo: {
    flex: 1,
    gap: 3,
  },
  failedCardLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  failedReason: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  failedBadge: {
    paddingRight: 4,
  },
});
