import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

type FlagStatus = "pending" | "ai_processing" | "needs_admin" | "resolved" | "no_fix";
type FilterTab = "needs_admin" | "completed";

interface PriceFlag {
  id: number;
  card_name: string;
  set_name: string | null;
  set_code: string | null;
  card_number: string | null;
  card_lang: string;
  company: string;
  flagged_grades: string[];
  flagged_values: Record<string, number>;
  user_note: string | null;
  status: FlagStatus;
  ai_analysis: string | null;
  admin_response: string | null;
  corrected_search: string | null;
  clean_search_term: string | null;
  correction_applied: boolean;
  resolution_method: string | null;
  created_at: string;
  resolved_at: string | null;
}

const STATUS_CONFIG: Record<FlagStatus, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending:        { label: "Pending",        color: "#6b7280", icon: "time-outline" },
  ai_processing:  { label: "AI Analysing",   color: "#8B5CF6", icon: "sync-outline" },
  needs_admin:    { label: "Needs Review",   color: "#F59E0B", icon: "alert-circle-outline" },
  resolved:       { label: "Resolved",       color: "#10B981", icon: "checkmark-circle-outline" },
  no_fix:         { label: "No Fix Found",   color: "#ef4444", icon: "close-circle-outline" },
};

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function FlagDetail({ flag: initialFlag, onClose }: { flag: PriceFlag; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [flag, setFlag] = useState(initialFlag);
  const [adminText, setAdminText] = useState(flag.admin_response ?? "");
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [applyingFix, setApplyingFix] = useState(false);
  const statusCfg = STATUS_CONFIG[flag.status] ?? STATUS_CONFIG.pending;
  const isCompleted = flag.status === "resolved" || flag.status === "no_fix";

  const handleSend = useCallback(async () => {
    const trimmed = adminText.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      const url = new URL(`/api/admin/price-flags/${flag.id}/respond`, getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminResponse: trimmed }),
      });
      if (!res.ok) throw new Error("Server error");
      qc.invalidateQueries({ queryKey: ["/api/admin/price-flags"] });
      Alert.alert("Sent", "Admin response submitted. Claude will re-analyse shortly.");
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSending(false);
    }
  }, [adminText, flag.id, onClose, qc]);

  const handleResolve = useCallback((outcome: "resolved" | "no_fix") => {
    Alert.alert(
      outcome === "resolved" ? "Mark as Resolved" : "Mark as No Fix",
      outcome === "resolved"
        ? "Mark this flag as resolved — prices have been manually verified or corrected."
        : "Mark this as no fix available — the prices may still be inaccurate.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setResolving(true);
            try {
              const url = new URL(`/api/admin/price-flags/${flag.id}/resolve`, getApiUrl());
              const res = await fetch(url.toString(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ outcome }),
              });
              if (!res.ok) throw new Error("Server error");
              setFlag(f => ({ ...f, status: outcome, resolution_method: "admin", resolved_at: new Date().toISOString() }));
              qc.invalidateQueries({ queryKey: ["/api/admin/price-flags"] });
            } catch (e: any) {
              Alert.alert("Error", e.message);
            } finally {
              setResolving(false);
            }
          },
        },
      ]
    );
  }, [flag.id, qc]);

  const handleApplyFix = useCallback(async () => {
    if (!flag.clean_search_term) return;
    Alert.alert(
      "Apply Suggested Fix",
      `Re-run the PokeTrace search using "${flag.clean_search_term}" and update the price cache?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Apply",
          onPress: async () => {
            setApplyingFix(true);
            try {
              const url = new URL(`/api/admin/price-flags/${flag.id}/apply-fix`, getApiUrl());
              const res = await fetch(url.toString(), { method: "POST" });
              const body = await res.json();
              if (!res.ok) throw new Error(body.error ?? "Server error");
              const outcome: "resolved" | "no_fix" = body.status;
              setFlag(f => ({
                ...f,
                status: outcome,
                resolution_method: "admin_applied",
                correction_applied: body.fixed,
                resolved_at: new Date().toISOString(),
              }));
              qc.invalidateQueries({ queryKey: ["/api/admin/price-flags"] });
              Alert.alert(
                body.fixed ? "Price Updated" : "No Match Found",
                body.fixed
                  ? "Cache updated with corrected prices. They'll show next time the card's profit screen is loaded."
                  : "PokeTrace returned no usable data for that search. Try sending more context to Claude."
              );
            } catch (e: any) {
              Alert.alert("Error", e.message);
            } finally {
              setApplyingFix(false);
            }
          },
        },
      ]
    );
  }, [flag.id, flag.clean_search_term, qc]);

  const gradeRows = flag.flagged_grades.map(g => ({
    label: g,
    value: flag.flagged_values[g],
  }));

  return (
    <KeyboardAvoidingView
      style={[det.container, { paddingBottom: insets.bottom + 16 }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={[det.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onClose} hitSlop={10} style={det.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={det.title} numberOfLines={1}>{flag.card_name}</Text>
        <View style={[det.statusPill, { backgroundColor: statusCfg.color + "22" }]}>
          <Text style={[det.statusTxt, { color: statusCfg.color }]}>{statusCfg.label}</Text>
        </View>
      </View>

      <ScrollView style={det.scroll} contentContainerStyle={det.scrollContent}>
        {/* Card info */}
        <View style={det.section}>
          <Text style={det.sectionTitle}>Card Details</Text>
          <View style={det.infoCard}>
            <InfoRow label="Name" value={flag.card_name} />
            <InfoRow label="Set" value={flag.set_name ?? "—"} />
            {flag.set_code && <InfoRow label="Set Code" value={flag.set_code} />}
            {flag.card_number && <InfoRow label="Number" value={flag.card_number} />}
            <InfoRow label="Language" value={flag.card_lang === "ja" ? "Japanese" : "English"} />
            <InfoRow label="Company" value={flag.company} />
            <InfoRow label="Flagged" value={timeAgo(flag.created_at)} />
          </View>
        </View>

        {/* Flagged prices */}
        <View style={det.section}>
          <Text style={det.sectionTitle}>Flagged Prices</Text>
          <View style={det.infoCard}>
            {gradeRows.map(g => (
              <InfoRow
                key={g.label}
                label={g.label}
                value={g.value != null ? `$${g.value.toFixed(2)} USD` : "—"}
                accent
              />
            ))}
          </View>
        </View>

        {/* User note */}
        {flag.user_note && (
          <View style={det.section}>
            <Text style={det.sectionTitle}>User Note</Text>
            <View style={det.noteBox}>
              <Text style={det.noteText}>"{flag.user_note}"</Text>
            </View>
          </View>
        )}

        {/* AI Analysis */}
        <View style={det.section}>
          <Text style={det.sectionTitle}>AI Analysis</Text>
          <View style={det.noteBox}>
            {flag.ai_analysis ? (
              <Text style={det.noteText}>{flag.ai_analysis}</Text>
            ) : (
              <Text style={[det.noteText, { color: Colors.textMuted }]}>Waiting for AI analysis…</Text>
            )}
          </View>
        </View>

        {/* Corrected search suggestion */}
        {flag.corrected_search && (
          <View style={det.section}>
            <Text style={det.sectionTitle}>Suggested Search Strategy</Text>
            <View style={[det.noteBox, { backgroundColor: "rgba(16,185,129,0.08)", borderColor: "rgba(16,185,129,0.3)" }]}>
              <Text style={[det.noteText, { color: "#10B981" }]}>{flag.corrected_search}</Text>
            </View>
            {flag.clean_search_term && !isCompleted && (
              <Pressable
                onPress={handleApplyFix}
                disabled={applyingFix}
                style={({ pressed }) => [det.applyFixBtn, (pressed || applyingFix) && { opacity: 0.6 }]}
              >
                {applyingFix ? (
                  <ActivityIndicator size="small" color="#10B981" />
                ) : (
                  <Ionicons name="flash" size={15} color="#10B981" />
                )}
                <Text style={det.applyFixTxt}>
                  {applyingFix ? "Applying fix…" : "Apply Suggested Fix"}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Resolution banner for completed flags */}
        {isCompleted ? (
          <View style={det.section}>
            <View style={[det.resolutionBanner, {
              backgroundColor: flag.status === "resolved" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
              borderColor: flag.status === "resolved" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)",
            }]}>
              <Ionicons
                name={flag.status === "resolved" ? "checkmark-circle" : "close-circle"}
                size={20}
                color={flag.status === "resolved" ? "#10B981" : "#ef4444"}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[det.resolutionTitle, { color: flag.status === "resolved" ? "#10B981" : "#ef4444" }]}>
                  {flag.status === "resolved" ? "Price Corrected" : "No Fix Available"}
                </Text>
                <Text style={det.resolutionSub}>
                  {flag.resolution_method === "auto_fix"
                    ? `Auto-fixed by AI${flag.clean_search_term ? ` using "${flag.clean_search_term}"` : ""}`
                    : "Manually resolved by admin"}
                  {flag.resolved_at ? ` · ${timeAgo(flag.resolved_at)}` : ""}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          /* Admin response — only shown for flags still needing attention */
          <View style={det.section}>
            <Text style={det.sectionTitle}>Your Response to Claude</Text>
            <Text style={det.sectionSub}>
              Provide context to guide the AI — e.g. "This is a Base Set Shadowless, not Base Set Unlimited"
            </Text>
            <TextInput
              style={det.textInput}
              value={adminText}
              onChangeText={setAdminText}
              placeholder="Type your hint here…"
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Pressable
              onPress={handleSend}
              disabled={sending || !adminText.trim()}
              style={({ pressed }) => [
                det.sendBtn,
                (pressed || sending || !adminText.trim()) && { opacity: 0.5 },
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={16} color="#fff" />
              )}
              <Text style={det.sendBtnTxt}>{sending ? "Sending…" : "Send to Claude"}</Text>
            </Pressable>

            {/* Manual resolve buttons */}
            <View style={det.resolveRow}>
              <Pressable
                onPress={() => handleResolve("resolved")}
                disabled={resolving}
                style={({ pressed }) => [det.resolveBtn, det.resolveBtnGreen, (pressed || resolving) && { opacity: 0.6 }]}
              >
                {resolving ? <ActivityIndicator size="small" color="#10B981" /> : <Ionicons name="checkmark-circle-outline" size={16} color="#10B981" />}
                <Text style={[det.resolveBtnTxt, { color: "#10B981" }]}>Mark Resolved</Text>
              </Pressable>
              <Pressable
                onPress={() => handleResolve("no_fix")}
                disabled={resolving}
                style={({ pressed }) => [det.resolveBtn, det.resolveBtnRed, (pressed || resolving) && { opacity: 0.6 }]}
              >
                <Ionicons name="close-circle-outline" size={16} color="#ef4444" />
                <Text style={[det.resolveBtnTxt, { color: "#ef4444" }]}>No Fix Available</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={det.infoRow}>
      <Text style={det.infoLabel}>{label}</Text>
      <Text style={[det.infoValue, accent && { color: Colors.text, fontFamily: "Inter_600SemiBold" }]}>
        {value}
      </Text>
    </View>
  );
}

export default function AdminPriceFlagsScreen() {
  const insets = useSafeAreaInsets();
  const webTop = Platform.OS === "web" ? 67 : 0;
  const [filterTab, setFilterTab] = useState<FilterTab>("needs_admin");
  const [selectedFlag, setSelectedFlag] = useState<PriceFlag | null>(null);

  const { data, isLoading, refetch } = useQuery<{ flags: PriceFlag[] }>({
    queryKey: ["/api/admin/price-flags", filterTab],
    queryFn: async () => {
      const url = new URL(`/api/admin/price-flags?status=${filterTab}`, getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load flags");
      return res.json();
    },
    staleTime: 30 * 1000,
  });

  const flags = data?.flags ?? [];

  if (selectedFlag) {
    return <FlagDetail flag={selectedFlag} onClose={() => setSelectedFlag(null)} />;
  }

  return (
    <View style={[st.container, { paddingTop: webTop }]}>
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={st.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={st.title}>Price Flags</Text>
        <View style={st.headerRight} />
      </View>

      {/* Filter toggle */}
      <View style={st.filterRow}>
        {(["needs_admin", "completed"] as const).map(f => (
          <Pressable
            key={f}
            onPress={() => setFilterTab(f)}
            style={[st.filterBtn, filterTab === f && st.filterBtnActive]}
          >
            <Text style={[st.filterBtnTxt, filterTab === f && st.filterBtnTxtActive]}>
              {f === "needs_admin" ? "Needs Review" : "Completed"}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={st.scroll}
        contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={Colors.textMuted} />}
      >
        {isLoading ? (
          <ActivityIndicator color={Colors.textMuted} style={{ marginTop: 48 }} />
        ) : flags.length === 0 ? (
          <View style={st.emptyState}>
            <Ionicons
              name={filterTab === "needs_admin" ? "checkmark-circle-outline" : "archive-outline"}
              size={40}
              color={Colors.textMuted}
            />
            <Text style={st.emptyTxt}>
              {filterTab === "needs_admin" ? "No flags waiting for review" : "No completed flags yet"}
            </Text>
          </View>
        ) : (
          flags.map(flag => {
            const cfg = STATUS_CONFIG[flag.status] ?? STATUS_CONFIG.pending;
            return (
              <Pressable
                key={flag.id}
                onPress={() => setSelectedFlag(flag)}
                style={({ pressed }) => [st.flagCard, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={st.flagCardTop}>
                  <View style={st.flagCardLeft}>
                    <Text style={st.flagCardName} numberOfLines={1}>{flag.card_name}</Text>
                    {flag.set_name && (
                      <Text style={st.flagCardSet} numberOfLines={1}>{flag.set_name}</Text>
                    )}
                  </View>
                  <View style={[st.flagStatusPill, { backgroundColor: cfg.color + "22" }]}>
                    <Ionicons name={cfg.icon} size={12} color={cfg.color} />
                    <Text style={[st.flagStatusTxt, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>
                <View style={st.flagCardMeta}>
                  <Text style={st.flagCardMetaTxt}>{flag.company}</Text>
                  <Text style={st.flagCardMetaDot}>·</Text>
                  <Text style={st.flagCardMetaTxt}>
                    {flag.flagged_grades.length} grade{flag.flagged_grades.length !== 1 ? "s" : ""} flagged
                  </Text>
                  <Text style={st.flagCardMetaDot}>·</Text>
                  <Text style={st.flagCardMetaTxt}>{timeAgo(flag.created_at)}</Text>
                </View>
                {flag.user_note && (
                  <Text style={st.flagCardNote} numberOfLines={2}>"{flag.user_note}"</Text>
                )}
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={st.flagCardChevron} />
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 17, color: Colors.text, textAlign: "center" },
  headerRight: { width: 40 },
  filterRow: {
    flexDirection: "row",
    padding: 12,
    gap: 8,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    alignItems: "center",
    backgroundColor: Colors.surface,
  },
  filterBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: "rgba(255,60,49,0.08)",
  },
  filterBtnTxt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textMuted,
  },
  filterBtnTxtActive: { color: Colors.primary },
  scroll: { flex: 1 },
  scrollContent: { padding: 12, gap: 10 },
  emptyState: { alignItems: "center", paddingTop: 64, gap: 12 },
  emptyTxt: { fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.textMuted },
  flagCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 14,
    gap: 6,
  },
  flagCardTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  flagCardLeft: { flex: 1, gap: 2 },
  flagCardName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  flagCardSet: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textMuted },
  flagStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  flagStatusTxt: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  flagCardMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  flagCardMetaTxt: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  flagCardMetaDot: { color: Colors.textMuted, fontSize: 12 },
  flagCardNote: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textMuted, fontStyle: "italic" },
  flagCardChevron: { position: "absolute", right: 14, top: "50%" },
});

const det = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    textAlign: "center",
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusTxt: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 4 },
  section: { marginBottom: 16 },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  sectionSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 8,
    lineHeight: 18,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  infoLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  infoValue: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", flex: 1, marginLeft: 12 },
  noteBox: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 14,
  },
  noteText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  textInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    padding: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    minHeight: 100,
    marginBottom: 10,
  },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  sendBtnTxt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
  resolutionBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  resolutionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  resolutionSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  resolveRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  resolveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 11,
  },
  resolveBtnGreen: {
    borderColor: "rgba(16,185,129,0.4)",
    backgroundColor: "rgba(16,185,129,0.07)",
  },
  resolveBtnRed: {
    borderColor: "rgba(239,68,68,0.4)",
    backgroundColor: "rgba(239,68,68,0.07)",
  },
  resolveBtnTxt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  applyFixBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(16,185,129,0.5)",
    backgroundColor: "rgba(16,185,129,0.08)",
    paddingVertical: 11,
  },
  applyFixTxt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#10B981",
  },
});
