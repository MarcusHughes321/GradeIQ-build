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
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
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

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/admin/analytics"],
    queryFn: fetchAnalytics,
    refetchInterval: 30000,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const totals = data?.totals;
  const byMode: { mode: string; count: string; completed: string; failed: string }[] = data?.byMode || [];
  const daily: { day: string; count: string; cards: string }[] = data?.daily || [];
  const recent: { job_id: string; mode: string; card_count: number; status: string; created_at: string; duration_secs: number | null }[] = data?.recent || [];

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

      {isLoading ? (
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
});
