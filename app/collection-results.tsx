import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Alert,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  Animated,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useSettings } from "@/lib/settings-context";
import { CURRENCIES } from "@/lib/settings";
import { useQuery } from "@tanstack/react-query";

const FALLBACK_RATES: Record<string, number> = {
  GBP: 0.79, EUR: 0.93, AUD: 1.53, CAD: 1.36, JPY: 149, USD: 1,
};

type Condition = "Mint" | "Near Mint" | "Light Played" | "Played" | "Heavy Played" | "Damaged";

const CONDITION_COLORS: Record<string, string> = {
  "Mint": "#10B981",
  "Near Mint": "#3B82F6",
  "Light Played": "#F59E0B",
  "Played": "#F97316",
  "Heavy Played": "#EF4444",
  "Damaged": "#9CA3AF",
};

const CONDITION_SHORT: Record<string, string> = {
  "Mint": "M",
  "Near Mint": "NM",
  "Light Played": "LP",
  "Played": "PL",
  "Heavy Played": "HP",
  "Damaged": "D",
};

const LANG_LABELS: Record<string, string> = {
  en: "EN", ja: "JP", ko: "KO", zh: "ZH",
};

interface CollectionCard {
  index: number;
  status: "pending" | "processing" | "done" | "failed" | "limit_reached";
  cardName?: string;
  setName?: string;
  cardNumber?: string;
  language?: string;
  condition?: string;
  conditionNotes?: string;
  nmPriceUsd?: number | null;
  conditionPriceUsd?: number | null;
  error?: string;
}

interface JobData {
  status: "processing" | "completed" | "failed";
  totalCards: number;
  completedCards: number;
  cards: CollectionCard[];
}

function useExchangeRates() {
  const { data: rates } = useQuery<Record<string, number>>({
    queryKey: ["/api/exchange-rates"],
    staleTime: 5 * 60 * 1000,
  });
  return rates ?? {};
}

export default function CollectionResultsScreen() {
  const insets = useSafeAreaInsets();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editCard, setEditCard] = useState<CollectionCard | null>(null);
  const [editName, setEditName] = useState("");
  const [editSet, setEditSet] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [editLang, setEditLang] = useState("en");
  const [updating, setUpdating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [removedIndexes, setRemovedIndexes] = useState<Set<number>>(new Set());

  const { settings } = useSettings();
  const rates = useExchangeRates();
  const currency = settings.currency ?? "USD";
  const currencyDef = CURRENCIES.find((c) => c.code === currency) ?? CURRENCIES.find((c) => c.code === "USD")!;
  const currencySymbol = currencyDef.symbol;
  const usdRate = rates["USD"] ?? 1;
  const currencyRate = currency === "USD" ? 1 : (rates[currency] ?? FALLBACK_RATES[currency] ?? 1) / usdRate;
  const eurRate = (rates["EUR"] ?? FALLBACK_RATES["EUR"] ?? 0.93) / usdRate;

  const fmtPrice = (usd: number | null | undefined, isJp?: boolean, priceEur?: number | null) => {
    if (usd == null) return "—";
    // JP cards stored as EUR
    if (isJp && priceEur != null) {
      const local = priceEur * (currencyRate / eurRate);
      if (currencySymbol === "¥") return `${currencySymbol}${Math.round(local)}`;
      return `${currencySymbol}${local.toFixed(2)}`;
    }
    const local = usd * currencyRate;
    if (currencySymbol === "¥") return `${currencySymbol}${Math.round(local)}`;
    return `${currencySymbol}${local.toFixed(2)}`;
  };

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const url = new URL(`/api/collection/job/${jobId}`, getApiUrl()).toString();
      const resp = await fetch(url);
      if (!resp.ok) return;
      const data: JobData = await resp.json();
      setJobData(data);
      setLoading(false);
    } catch {}
  }, [jobId]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  const doneCards = (jobData?.cards.filter((c) => c.status === "done") ?? []).filter((c) => !removedIndexes.has(c.index));
  const failedCards = jobData?.cards.filter((c) => c.status === "failed" || c.status === "limit_reached") ?? [];

  const removeCard = (index: number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRemovedIndexes((prev) => new Set([...prev, index]));
  };

  const totalNMUsd = doneCards.reduce((sum, c) => sum + (c.nmPriceUsd ?? 0), 0);
  const totalConditionUsd = doneCards.reduce((sum, c) => sum + (c.conditionPriceUsd ?? 0), 0);

  const conditionCounts = doneCards.reduce<Record<string, number>>((acc, c) => {
    const cond = c.condition ?? "Unknown";
    acc[cond] = (acc[cond] ?? 0) + 1;
    return acc;
  }, {});
  const COND_ORDER = ["Mint", "Near Mint", "Light Played", "Played", "Heavy Played", "Damaged"];
  const activeConditions = COND_ORDER.filter((c) => (conditionCounts[c] ?? 0) > 0);

  const openEdit = (card: CollectionCard) => {
    setEditCard(card);
    setEditName(card.cardName ?? "");
    setEditSet(card.setName ?? "");
    setEditNumber(card.cardNumber ?? "");
    setEditLang(card.language ?? "en");
  };

  const saveEdit = async () => {
    if (!editCard || !jobId) return;
    setUpdating(true);
    try {
      const url = new URL(`/api/collection/job/${jobId}/card/${editCard.index}`, getApiUrl()).toString();
      const resp = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardName: editName.trim(),
          setName: editSet.trim(),
          cardNumber: editNumber.trim(),
          language: editLang,
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.card) {
        setJobData((prev) => {
          if (!prev) return prev;
          const updated = [...prev.cards];
          updated[editCard.index] = data.card;
          return { ...prev, cards: updated };
        });
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setEditCard(null);
    } catch (err: any) {
      Alert.alert("Update Failed", err.message);
    } finally {
      setUpdating(false);
    }
  };

  const exportCSV = async () => {
    if (doneCards.length === 0) return;
    setExporting(true);
    try {
      const header = ["Card Name", "Set Name", "Card Number", "Language", "Condition", `NM Price (${currency})`, `Condition Price (${currency})`];
      const rows = doneCards.map((c) => {
        const isJp = c.language === "ja" || c.language === "ko" || c.language === "zh";
        const nmLocal = c.nmPriceUsd != null ? (c.nmPriceUsd * currencyRate).toFixed(2) : "";
        const condLocal = c.conditionPriceUsd != null ? (c.conditionPriceUsd * currencyRate).toFixed(2) : "";
        return [
          `"${(c.cardName ?? "").replace(/"/g, '""')}"`,
          `"${(c.setName ?? "").replace(/"/g, '""')}"`,
          `"${(c.cardNumber ?? "").replace(/"/g, '""')}"`,
          LANG_LABELS[c.language ?? "en"] ?? (c.language ?? "EN"),
          c.condition ?? "",
          nmLocal,
          condLocal,
        ].join(",");
      });
      const csv = [header.join(","), ...rows].join("\n");
      const filename = `collection-scan-${Date.now()}.csv`;

      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const path = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(path, csv, { encoding: "utf8" as any });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(path, { mimeType: "text/csv", dialogTitle: "Export Collection CSV" });
        } else {
          Alert.alert("Export Ready", `Saved to: ${path}`);
        }
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("Export Failed", err.message);
    } finally {
      setExporting(false);
    }
  };

  const renderCard = ({ item, index }: { item: CollectionCard; index: number }) => {
    const condColor = CONDITION_COLORS[item.condition ?? ""] ?? Colors.textMuted;
    const condShort = CONDITION_SHORT[item.condition ?? ""] ?? "—";

    const renderRightActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
      const scale = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [1, 0.5],
        extrapolate: "clamp",
      });
      return (
        <Pressable
          style={st.swipeDeleteBtn}
          onPress={() => removeCard(item.index)}
        >
          <Animated.View style={{ transform: [{ scale }] }}>
            <Ionicons name="trash-outline" size={22} color="#fff" />
          </Animated.View>
        </Pressable>
      );
    };

    return (
      <Swipeable
        renderRightActions={renderRightActions}
        onSwipeableOpen={() => removeCard(item.index)}
        rightThreshold={60}
        overshootRight={false}
      >
        <View style={st.cardRow}>
          <View style={st.cardRowNum}>
            <Text style={st.cardRowNumText}>{item.index + 1}</Text>
          </View>
          <View style={st.cardRowBody}>
            <View style={st.cardRowTop}>
              <Text style={st.cardName} numberOfLines={1}>{item.cardName ?? "Unknown Card"}</Text>
              <View style={[st.condBadge, { backgroundColor: condColor + "22" }]}>
                <Text style={[st.condBadgeText, { color: condColor }]}>{condShort}</Text>
              </View>
            </View>
            <Text style={st.cardMeta} numberOfLines={1}>
              {[item.setName, item.cardNumber ? `#${item.cardNumber}` : null, LANG_LABELS[item.language ?? "en"]].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <View style={st.cardRowPrice}>
            <Text style={st.priceMain}>
              {item.conditionPriceUsd != null ? fmtPrice(item.conditionPriceUsd) : "—"}
            </Text>
            {item.nmPriceUsd != null && item.nmPriceUsd !== item.conditionPriceUsd ? (
              <Text style={st.priceNM}>NM {fmtPrice(item.nmPriceUsd)}</Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => openEdit(item)}
            style={({ pressed }) => [st.editBtn, { opacity: pressed ? 0.5 : 1 }]}
            hitSlop={8}
          >
            <Ionicons name="create-outline" size={18} color={Colors.textMuted} />
          </Pressable>
        </View>
      </Swipeable>
    );
  };

  const renderFailed = ({ item }: { item: CollectionCard }) => (
    <View style={[st.cardRow, st.cardRowFailed]}>
      <View style={st.cardRowNum}>
        <Text style={st.cardRowNumText}>{item.index + 1}</Text>
      </View>
      <View style={st.cardRowBody}>
        <Text style={st.failedText}>
          {item.status === "limit_reached" ? "Scan limit reached" : "Scan failed"}
        </Text>
      </View>
      <Ionicons name="close-circle-outline" size={18} color={Colors.textMuted} />
    </View>
  );

  if (loading) {
    return (
      <View style={[st.container, { paddingTop: insets.top, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={st.header}>
        <Pressable
          onPress={() => router.replace("/(tabs)/grade")}
          style={({ pressed }) => [st.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={st.headerTitle}>Collection Report</Text>
        <Pressable
          onPress={exportCSV}
          disabled={exporting || doneCards.length === 0}
          style={({ pressed }) => [st.exportBtn, { opacity: pressed || doneCards.length === 0 ? 0.5 : 1 }]}
        >
          {exporting ? (
            <ActivityIndicator size="small" color="#3B82F6" />
          ) : (
            <>
              <Ionicons name="download-outline" size={16} color="#3B82F6" />
              <Text style={st.exportBtnText}>CSV</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Summary strip */}
      <View style={st.summaryStrip}>
        <View style={st.summaryItem}>
          <Text style={st.summaryNum}>{doneCards.length}</Text>
          <Text style={st.summaryLabel}>Cards</Text>
        </View>
        <View style={st.summaryDivider} />
        <View style={st.summaryItem}>
          <Text style={[st.summaryNum, { color: Colors.textSecondary }]}>{fmtPrice(totalNMUsd)}</Text>
          <Text style={st.summaryLabel}>NM Total</Text>
        </View>
        <View style={st.summaryDivider} />
        <View style={st.summaryItem}>
          <Text style={[st.summaryNum, { color: "#3B82F6" }]}>{fmtPrice(totalConditionUsd)}</Text>
          <Text style={st.summaryLabel}>As-Is Total</Text>
        </View>
      </View>

      {/* Condition breakdown */}
      {activeConditions.length > 0 && (
        <View style={st.condBreakdownRow}>
          {activeConditions.map((cond) => (
            <View key={cond} style={st.condBreakdownItem}>
              <View style={[st.condBreakdownDot, { backgroundColor: CONDITION_COLORS[cond] }]} />
              <Text style={[st.condBreakdownShort, { color: CONDITION_COLORS[cond] }]}>
                {CONDITION_SHORT[cond]}
              </Text>
              <Text style={st.condBreakdownCount}>{conditionCounts[cond]}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Swipe hint */}
      {doneCards.length > 0 && (
        <View style={st.swipeHintRow}>
          <Ionicons name="arrow-back-outline" size={12} color={Colors.textMuted} />
          <Text style={st.swipeHintText}>Swipe left on a card to remove it from the report</Text>
        </View>
      )}

      {/* Card list */}
      <FlatList
        data={doneCards}
        keyExtractor={(item) => `card-${item.index}`}
        renderItem={renderCard}
        contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          failedCards.length > 0 ? (
            <View style={{ gap: 8, marginTop: 8 }}>
              <Text style={st.failedHeader}>{failedCards.length} card{failedCards.length !== 1 ? "s" : ""} not scanned</Text>
              {failedCards.map((c) => <View key={c.index}>{renderFailed({ item: c })}</View>)}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={st.emptyState}>
            <Ionicons name="alert-circle-outline" size={36} color={Colors.textMuted} />
            <Text style={st.emptyText}>No cards were scanned successfully.</Text>
          </View>
        }
      />

      {/* Bottom action */}
      <View style={[st.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={({ pressed }) => [st.newScanBtn, { opacity: pressed ? 0.8 : 1 }]}
          onPress={() => router.replace("/collection-scan")}
        >
          <Ionicons name="scan-outline" size={18} color="#fff" />
          <Text style={st.newScanBtnText}>New Scan</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [st.csvBtn, doneCards.length === 0 && st.csvBtnDisabled, { opacity: pressed ? 0.8 : 1 }]}
          onPress={exportCSV}
          disabled={doneCards.length === 0 || exporting}
        >
          <Ionicons name="download-outline" size={18} color={doneCards.length === 0 ? Colors.textMuted : "#3B82F6"} />
          <Text style={[st.csvBtnText, doneCards.length === 0 && st.csvBtnTextDisabled]}>Export CSV</Text>
        </Pressable>
      </View>

      {/* Edit modal */}
      <Modal visible={!!editCard} transparent animationType="slide" onRequestClose={() => setEditCard(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={st.editOverlay} onPress={() => setEditCard(null)} />
          <View style={[st.editSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={st.editHandle} />
            <Text style={st.editTitle}>Correct Card Details</Text>
            <Text style={st.editSub}>Update the details and we'll re-fetch the price.</Text>

            <View style={st.editField}>
              <Text style={st.editLabel}>Card Name</Text>
              <TextInput
                style={st.editInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="e.g. Charizard"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
              />
            </View>

            <View style={st.editField}>
              <Text style={st.editLabel}>Set Name</Text>
              <TextInput
                style={st.editInput}
                value={editSet}
                onChangeText={setEditSet}
                placeholder="e.g. Base Set"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
              />
            </View>

            <View style={st.editFieldRow}>
              <View style={[st.editField, { flex: 1 }]}>
                <Text style={st.editLabel}>Card Number</Text>
                <TextInput
                  style={st.editInput}
                  value={editNumber}
                  onChangeText={setEditNumber}
                  placeholder="e.g. 4/102"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                />
              </View>
              <View style={[st.editField, { width: 100 }]}>
                <Text style={st.editLabel}>Language</Text>
                <View style={st.langPills}>
                  {["en", "ja", "ko", "zh"].map((lang) => (
                    <Pressable
                      key={lang}
                      style={[st.langPill, editLang === lang && st.langPillActive]}
                      onPress={() => setEditLang(lang)}
                    >
                      <Text style={[st.langPillText, editLang === lang && st.langPillTextActive]}>
                        {LANG_LABELS[lang]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [st.saveBtn, { opacity: pressed ? 0.8 : 1 }]}
              onPress={saveEdit}
              disabled={updating}
            >
              {updating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={st.saveBtnText}>Update & Re-fetch Price</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40,
  },
  headerTitle: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: Colors.text,
    textAlign: "center",
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    width: 60,
    justifyContent: "flex-end",
  },
  exportBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#3B82F6",
  },
  summaryStrip: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 14,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  summaryNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  summaryLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: 4,
  },
  legendRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 10,
    flexWrap: "wrap",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  condBreakdownRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexWrap: "wrap",
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  condBreakdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  condBreakdownDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  condBreakdownShort: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  condBreakdownCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  swipeHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
  },
  swipeHintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  swipeDeleteBtn: {
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    width: 72,
    marginVertical: 0,
    borderRadius: 12,
    marginLeft: 8,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 12,
    gap: 10,
  },
  cardRowFailed: {
    opacity: 0.5,
  },
  cardRowNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardRowNumText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: Colors.textMuted,
  },
  cardRowBody: {
    flex: 1,
    gap: 2,
  },
  cardRowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardName: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  condBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  condBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
  },
  cardMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  cardNotes: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: "italic",
    marginTop: 1,
  },
  cardRowPrice: {
    alignItems: "flex-end",
    gap: 1,
  },
  priceMain: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  priceNM: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  editBtn: {
    padding: 4,
  },
  failedHeader: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
    paddingHorizontal: 4,
  },
  failedText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 10,
    padding: 16,
    paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  newScanBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#3B82F6",
  },
  newScanBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
  csvBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#3B82F6",
  },
  csvBtnDisabled: {
    borderColor: Colors.surfaceBorder,
  },
  csvBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#3B82F6",
  },
  csvBtnTextDisabled: {
    color: Colors.textMuted,
  },
  // Edit modal
  editOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  editSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 14,
  },
  editHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceBorder,
    alignSelf: "center",
    marginBottom: 4,
  },
  editTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: Colors.text,
  },
  editSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: -8,
  },
  editField: {
    gap: 6,
  },
  editFieldRow: {
    flexDirection: "row",
    gap: 10,
  },
  editLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  editInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  langPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 2,
  },
  langPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  langPillActive: {
    backgroundColor: "rgba(59,130,246,0.15)",
    borderColor: "#3B82F6",
  },
  langPillText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
  },
  langPillTextActive: {
    color: "#3B82F6",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#3B82F6",
    marginTop: 4,
  },
  saveBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});
