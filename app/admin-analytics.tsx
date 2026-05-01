import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
  TextInput,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";

const MODE_COLORS: Record<string, string> = {
  quick: "#FF3C31",
  deep: "#F59E0B",
  crossover: "#8B5CF6",
  bulk: "#10B981",
};

const MODE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  quick: "flash",
  deep: "layers",
  crossover: "git-compare",
  bulk: "copy",
};

async function fetchAnalytics() {
  const url = new URL("/api/admin/analytics", getApiUrl());
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch analytics");
  return res.json();
}

async function fetchFinancials() {
  const url = new URL("/api/admin/financials", getApiUrl());
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch financials");
  return res.json();
}

async function saveSetting(key: string, value: string) {
  const url = new URL("/api/admin/settings", getApiUrl());
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) throw new Error("Failed to save setting");
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, color ? { color } : {}]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
    </View>
  );
}

export default function AdminAnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"stats" | "finance">("stats");
  const [editingReplit, setEditingReplit] = useState(false);
  const [replitCostInput, setReplitCostInput] = useState("");
  const [editingPlatformFee, setEditingPlatformFee] = useState(false);
  const [platformFeeInput, setPlatformFeeInput] = useState("");
  const [editingMonths, setEditingMonths] = useState(false);
  const [monthsInput, setMonthsInput] = useState("");
  const [editingOtherCosts, setEditingOtherCosts] = useState(false);
  const [otherCostsInput, setOtherCostsInput] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/admin/analytics"],
    queryFn: fetchAnalytics,
    refetchInterval: 30000,
  });

  const { data: fin, isLoading: finLoading, refetch: finRefetch } = useQuery({
    queryKey: ["/api/admin/financials"],
    queryFn: fetchFinancials,
    refetchInterval: 60000,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), finRefetch()]);
    setRefreshing(false);
  };

  const saveReplitCost = async () => {
    const val = parseFloat(replitCostInput);
    if (isNaN(val) || val < 0) { Alert.alert("Invalid", "Enter a valid cost in GBP"); return; }
    try {
      await saveSetting("replit_monthly_gbp", val.toFixed(2));
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/financials"] });
      setEditingReplit(false);
    } catch { Alert.alert("Error", "Failed to save setting"); }
  };

  const savePlatformFee = async () => {
    const val = parseFloat(platformFeeInput);
    if (isNaN(val) || val < 0 || val > 100) { Alert.alert("Invalid", "Enter a percentage between 0 and 100"); return; }
    try {
      await saveSetting("platform_fee_pct", val.toFixed(1));
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/financials"] });
      setEditingPlatformFee(false);
    } catch { Alert.alert("Error", "Failed to save setting"); }
  };

  const saveMonthsBuilding = async () => {
    const val = parseFloat(monthsInput);
    if (isNaN(val) || val < 0) { Alert.alert("Invalid", "Enter number of months"); return; }
    try {
      await saveSetting("months_building", val.toFixed(0));
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/financials"] });
      setEditingMonths(false);
    } catch { Alert.alert("Error", "Failed to save setting"); }
  };

  const saveOtherCosts = async () => {
    const val = parseFloat(otherCostsInput);
    if (isNaN(val) || val < 0) { Alert.alert("Invalid", "Enter a valid amount in GBP"); return; }
    try {
      await saveSetting("other_costs_gbp", val.toFixed(2));
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/financials"] });
      setEditingOtherCosts(false);
    } catch { Alert.alert("Error", "Failed to save setting"); }
  };

  const totals = data?.totals;
  const byMode: { mode: string; count: string; completed: string; failed: string }[] = data?.byMode || [];
  const daily: { day: string; count: string; cards: string }[] = data?.daily || [];
  const recent: { job_id: string; mode: string; card_count: number; status: string; created_at: string; duration_secs: number | null }[] = data?.recent || [];
  const rc: Record<string, number> | null = data?.rc ?? null;
  const rcTiers: { curious: number; enthusiast: number; obsessed: number; other: number; productIds?: string[] } | null = data?.rcTiers ?? null;
  const costs: { byMode: Record<string, number>; totalUsd: number } | null = data?.costs ?? null;
  const revenue: { mrrUsd: number; revenueUsd: number; profitUsd: number; marginPct: number } | null = data?.revenue ?? null;

  const USD_TO_GBP = 0.79;
  const toGbp = (usd: number) => (usd * USD_TO_GBP).toFixed(2);

  const maxDaily = daily.length > 0 ? Math.max(...daily.map(d => parseInt(d.count))) : 1;

  const successRate = totals
    ? Math.round((parseInt(totals.completed) / Math.max(1, parseInt(totals.total))) * 100)
    : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Analytics</Text>
        <Pressable
          onPress={onRefresh}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="refresh" size={20} color={Colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.tabBar}>
        {(["stats", "finance"] as const).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
          >
            <Text style={[styles.tabBtnText, activeTab === tab && styles.tabBtnTextActive]}>
              {tab === "stats" ? "Stats" : "Finance"}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "finance" ? (
        finLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.loadingText}>Loading financials…</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + webBottomInset + 40 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          >
            {fin ? (
              <>
                {/* ── Revenue Card ── */}
                <Text style={styles.sectionTitle}>Revenue ({fin.month})</Text>
                <View style={styles.card}>
                  <View style={[styles.profitRow, styles.rowBorder]}>
                    <View>
                      <Text style={styles.profitLabel}>Gross MRR</Text>
                      <Text style={styles.profitSub}>
                        {fin.tiers.curious} Curious · {fin.tiers.enthusiast} Enthusiast · {fin.tiers.obsessed} Obsessed
                      </Text>
                    </View>
                    <Text style={[styles.profitValue, { color: "#34D399" }]}>£{fin.revenue.grossMrrGbp.toFixed(2)}</Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      setPlatformFeeInput(fin.revenue.platformFeePct.toString());
                      setEditingPlatformFee(true);
                    }}
                    style={[styles.profitRow, styles.rowBorder]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.profitLabel}>Platform Fee ({fin.revenue.platformFeePct}%)</Text>
                      <Text style={styles.profitSub}>Apple SBP=15% · Standard=30% · Tap to edit</Text>
                    </View>
                    {editingPlatformFee ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <TextInput
                          style={[styles.finInput, { width: 50 }]}
                          value={platformFeeInput}
                          onChangeText={setPlatformFeeInput}
                          keyboardType="decimal-pad"
                          autoFocus
                          onBlur={savePlatformFee}
                          onSubmitEditing={savePlatformFee}
                        />
                        <Text style={styles.profitValue}>%</Text>
                      </View>
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text style={[styles.profitValue, { color: "#F87171" }]}>-£{fin.revenue.platformFeeGbp.toFixed(2)}</Text>
                        <Ionicons name="pencil" size={12} color={Colors.textMuted} />
                      </View>
                    )}
                  </Pressable>
                  {fin.revenue.rcFeeGbp > 0 && (
                    <View style={[styles.profitRow, styles.rowBorder]}>
                      <Text style={styles.profitLabel}>RevenueCat Fee (1%)</Text>
                      <Text style={[styles.profitValue, { color: "#F87171" }]}>-£{fin.revenue.rcFeeGbp.toFixed(2)}</Text>
                    </View>
                  )}
                  <View style={styles.profitRow}>
                    <Text style={[styles.profitLabel, { fontFamily: "Inter_700Bold" }]}>Net MRR</Text>
                    <Text style={[styles.profitValue, { color: "#34D399", fontSize: 18 }]}>£{fin.revenue.netMrrGbp.toFixed(2)}</Text>
                  </View>
                </View>

                {/* ── Costs Card ── */}
                <Text style={styles.sectionTitle}>Costs</Text>
                <View style={styles.card}>
                  <View style={[styles.profitRow, styles.rowBorder]}>
                    <View>
                      <Text style={styles.profitLabel}>AI Spend (this month)</Text>
                      <Text style={styles.profitSub}>{fin.costs.aiCallsThisMonth} calls logged</Text>
                    </View>
                    <Text style={[styles.profitValue, { color: "#F87171" }]}>
                      {fin.costs.aiCallsThisMonth > 0 ? `-£${fin.costs.aiThisMonthGbp.toFixed(2)}` : "—"}
                    </Text>
                  </View>
                  {fin.costs.ai3MonthAvgGbp !== null && (
                    <View style={[styles.profitRow, styles.rowBorder]}>
                      <Text style={styles.profitLabel}>AI Spend (3-month avg)</Text>
                      <Text style={[styles.profitValue, { color: Colors.textSecondary }]}>£{fin.costs.ai3MonthAvgGbp.toFixed(2)}</Text>
                    </View>
                  )}
                  <Pressable
                    onPress={() => {
                      setReplitCostInput(fin.costs.replitMonthlyGbp.toString());
                      setEditingReplit(true);
                    }}
                    style={[styles.profitRow, styles.rowBorder]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.profitLabel}>Replit (monthly)</Text>
                      <Text style={styles.profitSub}>Tap to edit</Text>
                    </View>
                    {editingReplit ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={styles.profitValue}>£</Text>
                        <TextInput
                          style={styles.finInput}
                          value={replitCostInput}
                          onChangeText={setReplitCostInput}
                          keyboardType="decimal-pad"
                          autoFocus
                          onBlur={saveReplitCost}
                          onSubmitEditing={saveReplitCost}
                        />
                      </View>
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text style={[styles.profitValue, { color: "#F87171" }]}>-£{fin.costs.replitMonthlyGbp.toFixed(2)}</Text>
                        <Ionicons name="pencil" size={12} color={Colors.textMuted} />
                      </View>
                    )}
                  </Pressable>
                  <View style={styles.profitRow}>
                    <Text style={[styles.profitLabel, { fontFamily: "Inter_700Bold" }]}>Monthly Costs</Text>
                    <Text style={[styles.profitValue, { color: "#F87171", fontSize: 18 }]}>-£{fin.costs.totalGbp.toFixed(2)}</Text>
                  </View>
                </View>

                {/* ── Investment to Date ── */}
                <Text style={styles.sectionTitle}>Investment to Date</Text>
                <View style={styles.card}>
                  {/* Months building — drives all calculated costs */}
                  <Pressable
                    onPress={() => { setMonthsInput(fin.costsToDate.monthsBuilding.toString()); setEditingMonths(true); }}
                    style={[styles.profitRow, styles.rowBorder]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.profitLabel}>Months Building</Text>
                      <Text style={styles.profitSub}>Drives Replit + Apple licence calculations · Tap to set</Text>
                    </View>
                    {editingMonths ? (
                      <TextInput
                        style={[styles.finInput, { width: 50 }]}
                        value={monthsInput}
                        onChangeText={setMonthsInput}
                        keyboardType="number-pad"
                        autoFocus
                        onBlur={saveMonthsBuilding}
                        onSubmitEditing={saveMonthsBuilding}
                      />
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text style={[styles.profitValue, { color: fin.costsToDate.monthsBuilding > 0 ? Colors.text : Colors.textMuted }]}>
                          {fin.costsToDate.monthsBuilding > 0 ? `${fin.costsToDate.monthsBuilding} mo` : "Not set"}
                        </Text>
                        <Ionicons name="pencil" size={12} color={Colors.textMuted} />
                      </View>
                    )}
                  </Pressable>
                  {/* AI costs — automatic from database */}
                  <View style={[styles.profitRow, styles.rowBorder]}>
                    <View>
                      <Text style={styles.profitLabel}>AI API Costs</Text>
                      <Text style={styles.profitSub}>{fin.costsToDate.aiAllTimeCalls} calls · from database</Text>
                    </View>
                    <Text style={[styles.profitValue, { color: fin.costsToDate.aiTotalGbp > 0 ? "#F87171" : Colors.textMuted }]}>
                      {fin.costsToDate.aiTotalGbp > 0 ? `-£${fin.costsToDate.aiTotalGbp.toFixed(2)}` : "—"}
                    </Text>
                  </View>
                  {/* Replit — calculated */}
                  <View style={[styles.profitRow, styles.rowBorder]}>
                    <View>
                      <Text style={styles.profitLabel}>Replit Subscription</Text>
                      <Text style={styles.profitSub}>£{fin.costs.replitMonthlyGbp}/mo × {fin.costsToDate.monthsBuilding} months</Text>
                    </View>
                    <Text style={[styles.profitValue, { color: fin.costsToDate.replitTotalGbp > 0 ? "#F87171" : Colors.textMuted }]}>
                      {fin.costsToDate.replitTotalGbp > 0 ? `-£${fin.costsToDate.replitTotalGbp.toFixed(2)}` : "—"}
                    </Text>
                  </View>
                  {/* Apple Developer licence — calculated */}
                  <View style={[styles.profitRow, styles.rowBorder]}>
                    <View>
                      <Text style={styles.profitLabel}>Apple Developer</Text>
                      <Text style={styles.profitSub}>£99/year × {Math.ceil(fin.costsToDate.monthsBuilding / 12) || 0} year{Math.ceil(fin.costsToDate.monthsBuilding / 12) !== 1 ? "s" : ""}</Text>
                    </View>
                    <Text style={[styles.profitValue, { color: fin.costsToDate.appleLicenceGbp > 0 ? "#F87171" : Colors.textMuted }]}>
                      {fin.costsToDate.appleLicenceGbp > 0 ? `-£${fin.costsToDate.appleLicenceGbp.toFixed(2)}` : "—"}
                    </Text>
                  </View>
                  {/* Google Play — one-time fixed */}
                  <View style={[styles.profitRow, styles.rowBorder]}>
                    <View>
                      <Text style={styles.profitLabel}>Google Play</Text>
                      <Text style={styles.profitSub}>One-time registration</Text>
                    </View>
                    <Text style={[styles.profitValue, { color: fin.costsToDate.googlePlayGbp > 0 ? "#F87171" : Colors.textMuted }]}>
                      {fin.costsToDate.googlePlayGbp > 0 ? `-£${fin.costsToDate.googlePlayGbp.toFixed(2)}` : "—"}
                    </Text>
                  </View>
                  {/* Other costs — editable */}
                  <Pressable
                    onPress={() => { setOtherCostsInput(fin.costsToDate.otherCostsGbp.toString()); setEditingOtherCosts(true); }}
                    style={[styles.profitRow, styles.rowBorder]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.profitLabel}>Other Costs</Text>
                      <Text style={styles.profitSub}>Tools, assets, one-offs · Tap to edit</Text>
                    </View>
                    {editingOtherCosts ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={styles.profitValue}>£</Text>
                        <TextInput
                          style={styles.finInput}
                          value={otherCostsInput}
                          onChangeText={setOtherCostsInput}
                          keyboardType="decimal-pad"
                          autoFocus
                          onBlur={saveOtherCosts}
                          onSubmitEditing={saveOtherCosts}
                        />
                      </View>
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text style={[styles.profitValue, { color: fin.costsToDate.otherCostsGbp > 0 ? "#F87171" : Colors.textMuted }]}>
                          {fin.costsToDate.otherCostsGbp > 0 ? `-£${fin.costsToDate.otherCostsGbp.toFixed(2)}` : "None"}
                        </Text>
                        <Ionicons name="pencil" size={12} color={Colors.textMuted} />
                      </View>
                    )}
                  </Pressable>
                  {/* Total */}
                  <View style={styles.profitRow}>
                    <Text style={[styles.profitLabel, { fontFamily: "Inter_700Bold" }]}>Total Invested</Text>
                    <Text style={[styles.profitValue, { color: "#F87171", fontSize: 18 }]}>
                      -£{fin.costsToDate.totalInvestedGbp.toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* ── P&L Card ── */}
                <Text style={styles.sectionTitle}>Profit & Loss</Text>
                <View style={[styles.plCard, { borderColor: fin.pl.isProfit ? "rgba(52,211,153,0.3)" : "rgba(255,60,49,0.3)" }]}>
                  <View style={styles.plBig}>
                    <Text style={[styles.plAmount, { color: fin.pl.isProfit ? "#34D399" : "#FF3C31" }]}>
                      {fin.pl.isProfit ? "+" : ""}£{fin.pl.profitGbp.toFixed(2)}
                    </Text>
                    <Text style={styles.plLabel}>
                      {fin.pl.isProfit ? "Profit" : "Loss"} this month
                    </Text>
                    <Text style={[styles.plMargin, { color: fin.pl.marginPct >= 60 ? "#34D399" : fin.pl.marginPct >= 30 ? "#F59E0B" : "#FF3C31" }]}>
                      {fin.pl.marginPct}% margin
                    </Text>
                  </View>
                  <View style={[styles.profitRow, styles.rowBorder, { borderTopWidth: 1 }]}>
                    <Text style={styles.profitLabel}>Net MRR</Text>
                    <Text style={[styles.profitValue, { color: "#34D399" }]}>£{fin.revenue.netMrrGbp.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.profitRow, fin.pl.breakevenMonths !== null ? styles.rowBorder : {}]}>
                    <Text style={styles.profitLabel}>Monthly Costs</Text>
                    <Text style={[styles.profitValue, { color: "#F87171" }]}>-£{fin.costs.totalGbp.toFixed(2)}</Text>
                  </View>
                  {fin.pl.breakevenMonths !== null && (
                    <View style={styles.profitRow}>
                      <View>
                        <Text style={styles.profitLabel}>Investment Payback</Text>
                        <Text style={styles.profitSub}>£{fin.costsToDate?.totalInvestedGbp?.toFixed(0) ?? "?"} total ÷ £{fin.pl.profitGbp.toFixed(0)}/mo</Text>
                      </View>
                      <Text style={[styles.profitValue, { color: "#F59E0B" }]}>
                        {fin.pl.breakevenMonths} month{fin.pl.breakevenMonths !== 1 ? "s" : ""}
                      </Text>
                    </View>
                  )}
                </View>

                {/* ── Per-grade economics ── */}
                {(fin.perGrade.avgRevenueGbp !== null || fin.perGrade.avgAiCostGbp !== null) && (
                  <>
                    <Text style={styles.sectionTitle}>Per-Grade Economics</Text>
                    <View style={styles.card}>
                      {fin.perGrade.avgRevenueGbp !== null && (
                        <View style={[styles.profitRow, styles.rowBorder]}>
                          <Text style={styles.profitLabel}>Avg Revenue / Grade</Text>
                          <Text style={[styles.profitValue, { color: "#34D399" }]}>£{fin.perGrade.avgRevenueGbp.toFixed(4)}</Text>
                        </View>
                      )}
                      {fin.perGrade.avgAiCostGbp !== null && (
                        <View style={[styles.profitRow, styles.rowBorder]}>
                          <Text style={styles.profitLabel}>Avg AI Cost / Grade</Text>
                          <Text style={[styles.profitValue, { color: "#F87171" }]}>£{fin.perGrade.avgAiCostGbp.toFixed(4)}</Text>
                        </View>
                      )}
                      {fin.perGrade.avgRevenueGbp !== null && fin.perGrade.avgAiCostGbp !== null && (
                        <View style={styles.profitRow}>
                          <Text style={[styles.profitLabel, { fontFamily: "Inter_700Bold" }]}>AI Margin / Grade</Text>
                          <Text style={[styles.profitValue, {
                            color: fin.perGrade.avgRevenueGbp > fin.perGrade.avgAiCostGbp ? "#34D399" : "#FF3C31"
                          }]}>
                            £{(fin.perGrade.avgRevenueGbp - fin.perGrade.avgAiCostGbp).toFixed(4)}
                          </Text>
                        </View>
                      )}
                    </View>
                    {fin.costs.aiCallsThisMonth === 0 && (
                      <Text style={styles.profitNote}>No AI calls logged yet this month. Per-grade data will populate after grading activity.</Text>
                    )}
                  </>
                )}
              </>
            ) : (
              <View style={styles.center}>
                <Text style={styles.errorText}>Failed to load financials</Text>
              </View>
            )}
          </ScrollView>
        )
      ) : isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.loadingText}>Loading analytics…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="warning-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.errorText}>Failed to load analytics</Text>
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + webBottomInset + 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          {rc && (
            <>
              <Text style={styles.sectionTitle}>Revenue & Subscriptions</Text>
              <View style={styles.revenueCard}>
                <View style={styles.revenuePrimaryRow}>
                  <View style={styles.revenuePrimary}>
                    <Text style={styles.revenueCurrency}>£</Text>
                    <Text style={styles.revenueMRR}>{rc.mrr != null ? Math.round(rc.mrr * USD_TO_GBP) : "—"}</Text>
                    <Text style={styles.revenueMRRLabel}>MRR</Text>
                  </View>
                  <View style={styles.revenueDivider} />
                  <View style={styles.revenuePrimary}>
                    <Text style={styles.revenueCurrency}>£</Text>
                    <Text style={styles.revenueMRR}>{rc.revenue != null ? Math.round(rc.revenue * USD_TO_GBP) : "—"}</Text>
                    <Text style={styles.revenueMRRLabel}>28-Day Revenue</Text>
                  </View>
                </View>

                <View style={styles.revenueMetricsRow}>
                  {[
                    { label: "Active Subs", value: rc.active_subscriptions ?? 0, color: "#34D399", icon: "ribbon" as const },
                    { label: "New Customers", value: rc.new_customers ?? 0, color: "#60A5FA", icon: "person-add" as const },
                    { label: "Active Users", value: rc.active_users ?? 0, color: "#F59E0B", icon: "people" as const },
                    { label: "Active Trials", value: rc.active_trials ?? 0, color: Colors.textMuted, icon: "time" as const },
                  ].map((m, i) => (
                    <View key={i} style={styles.revenueMetric}>
                      <Ionicons name={m.icon} size={14} color={m.color} />
                      <Text style={[styles.revenueMetricValue, { color: m.color }]}>{m.value}</Text>
                      <Text style={styles.revenueMetricLabel}>{m.label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {rcTiers !== null && (
                <>
                  <Text style={styles.sectionTitle}>Subscribers by Tier</Text>
                  <View style={styles.tiersCard}>
                    {([
                      { key: "curious", label: "Grade Curious", color: "#60A5FA", icon: "sparkles" as const },
                      { key: "enthusiast", label: "Grade Enthusiast", color: "#F59E0B", icon: "flame" as const },
                      { key: "obsessed", label: "Grade Obsessed", color: "#A78BFA", icon: "diamond" as const },
                    ] as const).map((tier, i) => (
                      <View key={tier.key} style={[styles.tierRow, styles.rowBorder]}>
                        <View style={[styles.tierIconWrap, { backgroundColor: tier.color + "18" }]}>
                          <Ionicons name={tier.icon} size={16} color={tier.color} />
                        </View>
                        <Text style={styles.tierLabel}>{tier.label}</Text>
                        <Text style={[styles.tierCount, { color: tier.color }]}>
                          {rcTiers[tier.key]}
                        </Text>
                      </View>
                    ))}
                    {(rcTiers.other ?? 0) > 0 && (
                      <View style={styles.tierRow}>
                        <View style={[styles.tierIconWrap, { backgroundColor: Colors.textMuted + "18" }]}>
                          <Ionicons name="gift-outline" size={16} color={Colors.textMuted} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.tierLabel}>Other / Promo</Text>
                          <Text style={styles.tierSub}>Non-standard product IDs</Text>
                        </View>
                        <Text style={[styles.tierCount, { color: Colors.textMuted }]}>
                          {rcTiers.other}
                        </Text>
                      </View>
                    )}
                  </View>
                  {(() => {
                    const identified = rcTiers.curious + rcTiers.enthusiast + rcTiers.obsessed + (rcTiers.other ?? 0);
                    const total = rc?.active_subscriptions ?? 0;
                    const diff = total - identified;
                    if (diff > 0) {
                      return (
                        <Text style={styles.tierWarning}>
                          ⚠ {diff} active sub{diff !== 1 ? "s" : ""} not yet identified — cache refreshes every 10 min
                        </Text>
                      );
                    }
                    return null;
                  })()}
                </>
              )}

              {revenue && costs && (
                <>
                  <Text style={styles.sectionTitle}>Profit Estimate</Text>
                  <View style={styles.card}>
                    <View style={[styles.profitRow, styles.rowBorder]}>
                      <Text style={styles.profitLabel}>MRR (Revenue)</Text>
                      <Text style={[styles.profitValue, { color: "#34D399" }]}>£{toGbp(revenue.mrrUsd)}</Text>
                    </View>
                    <View style={[styles.profitRow, styles.rowBorder]}>
                      <View>
                        <Text style={styles.profitLabel}>AI Costs (estimated)</Text>
                        <Text style={styles.profitSub}>
                          {Object.entries(costs.byMode).map(([mode, cost]) => `${mode} £${toGbp(cost)}`).join(" · ")}
                        </Text>
                      </View>
                      <Text style={[styles.profitValue, { color: "#FF3C31" }]}>-£{toGbp(costs.totalUsd)}</Text>
                    </View>
                    <View style={styles.profitRow}>
                      <Text style={[styles.profitLabel, { fontFamily: "Inter_700Bold" }]}>Est. Profit</Text>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[styles.profitValue, { color: revenue.profitUsd >= 0 ? "#34D399" : "#FF3C31", fontSize: 18 }]}>
                          £{toGbp(revenue.profitUsd)}
                        </Text>
                        <Text style={[styles.profitMargin, { color: revenue.marginPct >= 70 ? "#34D399" : revenue.marginPct >= 40 ? "#F59E0B" : "#FF3C31" }]}>
                          {revenue.marginPct}% margin
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.profitNote}>AI costs estimated based on Claude Sonnet pricing. Actual costs may vary.</Text>
                </>
              )}
            </>
          )}

          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.statsGrid}>
            <StatCard label="Total Grades" value={totals?.total ?? "—"} />
            <StatCard label="Today" value={totals?.today ?? "—"} color={Colors.primary} />
            <StatCard label="This Week" value={totals?.this_week ?? "—"} />
            <StatCard label="This Month" value={totals?.this_month ?? "—"} />
            <StatCard label="Total Cards" value={totals?.total_cards ?? "—"} sub="inc. bulk" />
            <StatCard label="Success Rate" value={`${successRate}%`} color={successRate >= 90 ? "#34D399" : successRate >= 70 ? "#F59E0B" : "#FF3C31"} />
          </View>

          <Text style={styles.sectionTitle}>By Mode</Text>
          <View style={styles.card}>
            {byMode.length === 0 ? (
              <Text style={styles.emptyText}>No data yet</Text>
            ) : byMode.map((row, i) => {
              const color = MODE_COLORS[row.mode] || Colors.textMuted;
              const icon = MODE_ICONS[row.mode] || "ellipse";
              const total = parseInt(row.count);
              const failed = parseInt(row.failed);
              return (
                <View key={row.mode} style={[styles.modeRow, i < byMode.length - 1 && styles.rowBorder]}>
                  <View style={[styles.modeIcon, { backgroundColor: color + "18" }]}>
                    <Ionicons name={icon} size={16} color={color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text style={styles.modeName}>{row.mode.charAt(0).toUpperCase() + row.mode.slice(1)}</Text>
                      <Text style={[styles.modeCount, { color }]}>{total}</Text>
                    </View>
                    <MiniBar value={total} max={parseInt(byMode[0]?.count) || 1} color={color} />
                    {failed > 0 && <Text style={styles.modeFailed}>{failed} failed</Text>}
                  </View>
                </View>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>Last 30 Days</Text>
          <View style={styles.card}>
            {daily.length === 0 ? (
              <Text style={styles.emptyText}>No data yet</Text>
            ) : (
              <View>
                <View style={styles.chartRow}>
                  {daily.map((d, i) => {
                    const count = parseInt(d.count);
                    const pct = maxDaily > 0 ? count / maxDaily : 0;
                    const barH = Math.max(4, pct * 80);
                    const dayLabel = new Date(d.day).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                    return (
                      <View key={i} style={styles.chartCol}>
                        <Text style={styles.chartCountLabel}>{count > 0 ? count : ""}</Text>
                        <View style={[styles.chartBar, { height: barH, backgroundColor: Colors.primary + "CC" }]} />
                        {(i === 0 || i === daily.length - 1 || i === Math.floor(daily.length / 2)) && (
                          <Text style={styles.chartDayLabel} numberOfLines={1}>{dayLabel}</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          <Text style={styles.sectionTitle}>Recent Jobs</Text>
          <View style={styles.card}>
            {recent.length === 0 ? (
              <Text style={styles.emptyText}>No jobs yet</Text>
            ) : recent.map((job, i) => {
              const color = MODE_COLORS[job.mode] || Colors.textMuted;
              const isOk = job.status === "completed";
              const dur = job.duration_secs ? `${Math.round(job.duration_secs)}s` : "—";
              const time = new Date(job.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
              const date = new Date(job.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
              return (
                <View key={job.job_id} style={[styles.recentRow, i < recent.length - 1 && styles.rowBorder]}>
                  <View style={[styles.modePill, { backgroundColor: color + "18" }]}>
                    <Text style={[styles.modePillText, { color }]}>{job.mode}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.recentJobId} numberOfLines={1}>{job.job_id}</Text>
                    <Text style={styles.recentMeta}>{date} {time} · {dur}{job.card_count > 1 ? ` · ${job.card_count} cards` : ""}</Text>
                  </View>
                  <Ionicons
                    name={isOk ? "checkmark-circle" : job.status === "failed" ? "close-circle" : "time"}
                    size={18}
                    color={isOk ? "#34D399" : job.status === "failed" ? "#FF3C31" : Colors.textMuted}
                  />
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: Colors.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textMuted },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textMuted },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: Colors.surface, borderRadius: 12 },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  scroll: { paddingHorizontal: 16, gap: 10 },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 8,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 14,
    width: "31%",
    flexGrow: 1,
    alignItems: "center",
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 2,
  },
  statSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
    opacity: 0.6,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: "hidden",
  },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  modeIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  modeName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  modeCount: { fontFamily: "Inter_700Bold", fontSize: 14 },
  modeFailed: { fontFamily: "Inter_400Regular", fontSize: 11, color: "#FF3C31", marginTop: 2 },
  barTrack: { height: 6, backgroundColor: Colors.surfaceBorder, borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    padding: 20,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 16,
    gap: 3,
    minHeight: 120,
  },
  chartCol: { flex: 1, alignItems: "center", gap: 2 },
  chartBar: { width: "100%", borderRadius: 3, minHeight: 4 },
  chartCountLabel: { fontFamily: "Inter_700Bold", fontSize: 8, color: Colors.textMuted },
  chartDayLabel: { fontFamily: "Inter_400Regular", fontSize: 7, color: Colors.textMuted, textAlign: "center" },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    paddingHorizontal: 14,
  },
  modePill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  modePillText: { fontFamily: "Inter_700Bold", fontSize: 11 },
  recentJobId: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textSecondary },
  recentMeta: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  revenueCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.25)",
    overflow: "hidden",
  },
  revenuePrimaryRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  revenuePrimary: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 20,
    gap: 2,
  },
  revenueDivider: {
    width: 1,
    backgroundColor: Colors.surfaceBorder,
  },
  revenueCurrency: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#34D399",
  },
  revenueMRR: {
    fontFamily: "Inter_700Bold",
    fontSize: 32,
    color: Colors.text,
    lineHeight: 36,
  },
  revenueMRRLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  revenueMetricsRow: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  revenueMetric: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  revenueMetricValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  revenueMetricLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: Colors.textMuted,
    textAlign: "center",
  },
  profitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    paddingHorizontal: 16,
  },
  profitLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  profitSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  profitValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  profitMargin: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    marginTop: 2,
  },
  profitNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
    paddingHorizontal: 20,
    lineHeight: 16,
  },
  tiersCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: "hidden",
  },
  tierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    paddingHorizontal: 16,
  },
  tierIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tierLabel: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  tierCount: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
  },
  tierSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  tierWarning: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#F59E0B",
    textAlign: "center",
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
  },
  tabBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textMuted,
  },
  tabBtnTextActive: {
    color: "#fff",
  },
  plCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  plBig: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 4,
  },
  plAmount: {
    fontFamily: "Inter_700Bold",
    fontSize: 42,
    lineHeight: 48,
  },
  plLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  plMargin: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    marginTop: 4,
  },
  finInput: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary,
    minWidth: 60,
    paddingVertical: 2,
  },
});
