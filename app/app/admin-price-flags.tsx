import React, { useState, useCallback, useEffect } from "react";
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
  Image,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

type FlagStatus = "pending" | "ai_processing" | "needs_admin" | "resolved" | "no_fix";
type FilterTab = "needs_admin" | "completed";

interface SuggestedPrices {
  psa10?: number; psa9?: number; psa8?: number; psa7?: number;
  bgs10?: number; bgs95?: number; bgs9?: number; bgs8?: number;
  ace10?: number; ace9?: number;
  tag10?: number; tag9?: number;
  cgc10?: number; cgc95?: number; cgc9?: number;
  raw?: number;
}

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
  suggested_prices: SuggestedPrices | null;
  suggested_card: string | null;
  created_at: string;
  resolved_at: string | null;
  card_image_url: string | null;
}

const STATUS_CONFIG: Record<FlagStatus, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending:        { label: "Pending",        color: "#6b7280", icon: "time-outline" },
  ai_processing:  { label: "AI Analysing",   color: "#8B5CF6", icon: "sync-outline" },
  needs_admin:    { label: "Needs Review",   color: "#F59E0B", icon: "alert-circle-outline" },
  resolved:       { label: "Resolved",       color: "#10B981", icon: "checkmark-circle-outline" },
  no_fix:         { label: "No Fix Found",   color: "#ef4444", icon: "close-circle-outline" },
};

const PREVIEW_GRADE_ROWS: { key: keyof SuggestedPrices; label: string }[] = [
  { key: "psa10",  label: "PSA 10" },
  { key: "psa9",   label: "PSA 9" },
  { key: "psa8",   label: "PSA 8" },
  { key: "psa7",   label: "PSA 7" },
  { key: "bgs95",  label: "BGS 9.5" },
  { key: "bgs9",   label: "BGS 9" },
  { key: "ace10",  label: "ACE 10" },
  { key: "tag10",  label: "TAG 10" },
  { key: "cgc10",  label: "CGC 10" },
  { key: "raw",    label: "Raw / NM" },
];

function fmt(usd: number | undefined) {
  if (!usd || usd <= 0) return "—";
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
  const [applyingManual, setApplyingManual] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualPrices, setManualPrices] = useState({
    psa10: "", psa9: "", psa8: "", psa7: "", raw: "",
  });
  // When admin has dismissed a preview (wants to send another note)
  const [previewDismissed, setPreviewDismissed] = useState(false);

  const statusCfg = STATUS_CONFIG[flag.status] ?? STATUS_CONFIG.pending;
  const isCompleted = flag.status === "resolved" || flag.status === "no_fix";
  const isAnalysing = flag.status === "ai_processing";
  const hasPreview = !previewDismissed && !!flag.suggested_prices && flag.status === "needs_admin";

  // Poll while AI is analysing
  useEffect(() => {
    if (!isAnalysing) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const url = new URL(`/api/admin/price-flags?status=needs_admin`, getApiUrl());
        const res = await fetch(url.toString());
        const body = await res.json();
        const updated: PriceFlag | undefined = body.flags?.find((f: PriceFlag) => f.id === flag.id);
        if (updated && !cancelled) {
          setFlag(updated);
          setPreviewDismissed(false);
          qc.invalidateQueries({ queryKey: ["/api/admin/price-flags"] });
        }
      } catch (_) {}
    };

    const interval = setInterval(poll, 2500);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isAnalysing, flag.id, qc]);

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
      // Stay on screen — show analysing state, poll for results
      setFlag(f => ({ ...f, status: "ai_processing", suggested_prices: null, suggested_card: null }));
      setPreviewDismissed(false);
      qc.invalidateQueries({ queryKey: ["/api/admin/price-flags"] });
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSending(false);
    }
  }, [adminText, flag.id, qc]);

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
        body.fixed ? "Prices Updated" : "No Match Found",
        body.fixed
          ? "Cache updated with the confirmed prices. Pull to refresh on the profit screen to see them."
          : "PokeTrace returned no usable data. Try sending more context."
      );
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setApplyingFix(false);
    }
  }, [flag.id, qc]);

  const handleManualPrices = useCallback(async () => {
    const prices: Record<string, number> = {};
    const keys: (keyof typeof manualPrices)[] = ["psa10", "psa9", "psa8", "psa7", "raw"];
    for (const k of keys) {
      const v = parseFloat(manualPrices[k]);
      if (!isNaN(v) && v > 0) prices[k] = v;
    }
    if (Object.keys(prices).length === 0) {
      Alert.alert("No Prices Entered", "Enter at least one grade price in USD.");
      return;
    }
    setApplyingManual(true);
    try {
      const url = new URL(`/api/admin/price-flags/${flag.id}/manual-prices`, getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Server error");
      setFlag(f => ({
        ...f,
        status: "resolved",
        resolution_method: "manual_prices",
        correction_applied: true,
        resolved_at: new Date().toISOString(),
      }));
      setShowManualForm(false);
      setManualPrices({ psa10: "", psa9: "", psa8: "", psa7: "", raw: "" });
      qc.invalidateQueries({ queryKey: ["/api/admin/price-flags"] });
      Alert.alert(
        "Prices Set",
        `Cache updated for "${body.cacheKey}". Pull to refresh on the profit screen to see the corrected prices.`
      );
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setApplyingManual(false);
    }
  }, [manualPrices, flag.id, qc]);

  const gradeRows = flag.flagged_grades.map(g => ({
    label: g,
    value: flag.flagged_values[g],
  }));

  const previewRows = PREVIEW_GRADE_ROWS.filter(
    r => flag.suggested_prices && (flag.suggested_prices[r.key] ?? 0) > 0
  );

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
        {/* Card image + info side by side */}
        <View style={det.section}>
          <Text style={det.sectionTitle}>Card Details</Text>
          <View style={det.cardDetailRow}>
            {flag.card_image_url ? (
              <Image
                source={{ uri: flag.card_image_url }}
                style={det.cardImage}
                resizeMode="contain"
              />
            ) : (
              <View style={det.cardImagePlaceholder}>
                <Ionicons name="image-outline" size={28} color={Colors.textMuted} />
              </View>
            )}
            <View style={{ flex: 1 }}>
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

        {/* AI Analysing spinner */}
        {isAnalysing && (
          <View style={det.section}>
            <View style={det.analysingBox}>
              <ActivityIndicator size="small" color="#8B5CF6" />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[det.noteText, { color: "#8B5CF6", fontFamily: "Inter_600SemiBold" }]}>
                  Claude is looking up prices…
                </Text>
                <Text style={[det.noteText, { color: Colors.textMuted, fontSize: 12 }]}>
                  Querying PokeTrace with a refined search. This usually takes 5–15 seconds.
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* AI Analysis */}
        {!isAnalysing && (
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
        )}

        {/* Corrected search suggestion */}
        {!isAnalysing && flag.corrected_search && !hasPreview && (
          <View style={det.section}>
            <Text style={det.sectionTitle}>Suggested Search Strategy</Text>
            <View style={[det.noteBox, { backgroundColor: "rgba(16,185,129,0.08)", borderColor: "rgba(16,185,129,0.3)" }]}>
              <Text style={[det.noteText, { color: "#10B981" }]}>{flag.corrected_search}</Text>
            </View>
          </View>
        )}

        {/* ── PRICE PREVIEW ── shown after admin sends a note and analysis completes */}
        {hasPreview && (
          <View style={det.section}>
            <Text style={det.sectionTitle}>Claude Found These Prices</Text>
            <View style={det.previewCard}>
              {flag.suggested_card && (
                <View style={det.previewCardHeader}>
                  <Ionicons name="card-outline" size={15} color="#8B5CF6" />
                  <Text style={det.previewCardLabel}>{flag.suggested_card}</Text>
                </View>
              )}
              {flag.corrected_search && (
                <Text style={det.previewStrategy}>{flag.corrected_search}</Text>
              )}
              <View style={det.previewGradeList}>
                {previewRows.map(r => (
                  <View key={r.key} style={det.previewGradeRow}>
                    <Text style={det.previewGradeLabel}>{r.label}</Text>
                    <Text style={det.previewGradeValue}>
                      {fmt(flag.suggested_prices?.[r.key])}
                    </Text>
                  </View>
                ))}
                {previewRows.length === 0 && (
                  <Text style={[det.noteText, { color: Colors.textMuted }]}>
                    No price data found for this search.
                  </Text>
                )}
              </View>

              <Text style={det.previewNote}>
                These are eBay sold averages in USD from PokeTrace. Confirm to overwrite the cached prices.
              </Text>
            </View>

            {/* Confirm / Reject */}
            {previewRows.length > 0 && !isCompleted && (
              <Pressable
                onPress={handleApplyFix}
                disabled={applyingFix}
                style={({ pressed }) => [det.confirmBtn, (pressed || applyingFix) && { opacity: 0.6 }]}
              >
                {applyingFix ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                )}
                <Text style={det.confirmBtnTxt}>
                  {applyingFix ? "Applying…" : "Confirm — Apply These Prices"}
                </Text>
              </Pressable>
            )}

            {!isCompleted && (
              <Pressable
                onPress={() => setPreviewDismissed(true)}
                style={({ pressed }) => [det.rejectBtn, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="close-circle-outline" size={16} color={Colors.textMuted} />
                <Text style={det.rejectBtnTxt}>That's wrong — send another note</Text>
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
                    : flag.resolution_method === "manual_prices"
                    ? "Prices set manually by admin"
                    : flag.resolution_method === "admin_applied"
                    ? "AI fix confirmed and applied by admin"
                    : "Manually resolved by admin"}
                  {flag.resolved_at ? ` · ${timeAgo(flag.resolved_at)}` : ""}
                </Text>
              </View>
            </View>
          </View>
        ) : !isAnalysing && !hasPreview ? (
          /* Admin response — only shown when not analysing and no pending preview */
          <View style={det.section}>
            <Text style={det.sectionTitle}>Your Response to Claude</Text>
            <Text style={det.sectionSub}>
              Describe what the correct card is — e.g. "This is a Team Rocket Dark Blastoise, the £300 version, not Legendary Collection"
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
        ) : null}

        {/* ── MANUAL PRICE OVERRIDE ── always visible, for when PokeTrace data is irretrievably wrong */}
        {!isAnalysing && (
          <View style={det.section}>
            <Pressable
              onPress={() => setShowManualForm(v => !v)}
              style={det.manualToggle}
            >
              <Ionicons
                name="pencil-outline"
                size={15}
                color={Colors.textMuted}
              />
              <Text style={det.manualToggleTxt}>Set Prices Manually</Text>
              <Ionicons
                name={showManualForm ? "chevron-up" : "chevron-down"}
                size={14}
                color={Colors.textMuted}
              />
            </Pressable>

            {showManualForm && (
              <View style={det.manualForm}>
                <Text style={det.manualFormNote}>
                  Enter correct eBay sold prices in USD. Leave blank to keep as-is. Use an exchange rate site to convert from your local currency.
                </Text>
                <View style={det.manualGrid}>
                  {([
                    { key: "psa10" as const, label: "PSA 10" },
                    { key: "psa9"  as const, label: "PSA 9" },
                    { key: "psa8"  as const, label: "PSA 8" },
                    { key: "psa7"  as const, label: "PSA 7" },
                    { key: "raw"   as const, label: "Raw / NM" },
                  ]).map(({ key, label }) => (
                    <View key={key} style={det.manualInputRow}>
                      <Text style={det.manualInputLabel}>{label}</Text>
                      <View style={det.manualInputWrap}>
                        <Text style={det.manualInputSym}>$</Text>
                        <TextInput
                          style={det.manualInput}
                          value={manualPrices[key]}
                          onChangeText={v => setManualPrices(p => ({ ...p, [key]: v }))}
                          placeholder="0.00"
                          placeholderTextColor={Colors.textMuted}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>
                  ))}
                </View>

                <Pressable
                  onPress={handleManualPrices}
                  disabled={applyingManual}
                  style={({ pressed }) => [det.manualApplyBtn, (pressed || applyingManual) && { opacity: 0.6 }]}
                >
                  {applyingManual ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="save-outline" size={16} color="#fff" />
                  )}
                  <Text style={det.manualApplyBtnTxt}>
                    {applyingManual ? "Saving…" : "Apply Manual Prices"}
                  </Text>
                </Pressable>
              </View>
            )}
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
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    scanned: number; claudeReviewed: number; flagged: number;
  } | null>(null);

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

  const handleScanCache = useCallback(async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const url = new URL("/api/admin/scan-cache", getApiUrl());
      const res = await fetch(url.toString(), { method: "POST" });
      if (!res.ok) throw new Error("Scan failed");
      const body = await res.json();
      setScanResult({ scanned: body.scanned, claudeReviewed: body.claudeReviewed, flagged: body.flagged });
      if (body.flagged > 0) {
        refetch();
      }
    } catch (e: any) {
      Alert.alert("Scan Error", e.message);
    } finally {
      setScanning(false);
    }
  }, [refetch]);

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
        <Pressable
          onPress={handleScanCache}
          disabled={scanning}
          hitSlop={10}
          style={[st.scanBtn, scanning && { opacity: 0.5 }]}
        >
          {scanning
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <Ionicons name="scan-outline" size={22} color={Colors.primary} />
          }
        </Pressable>
      </View>

      {/* Scan result banner */}
      {scanResult && (
        <View style={st.scanBanner}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#10B981" />
          <Text style={st.scanBannerTxt}>
            Scanned {scanResult.scanned} cached prices
            {scanResult.claudeReviewed > 0 ? ` · Claude reviewed ${scanResult.claudeReviewed}` : ""}
            {" · "}
            {scanResult.flagged > 0
              ? `${scanResult.flagged} new issue${scanResult.flagged !== 1 ? "s" : ""} found`
              : "All prices look healthy"}
          </Text>
          <Pressable onPress={() => setScanResult(null)} hitSlop={8}>
            <Ionicons name="close" size={14} color={Colors.textMuted} />
          </Pressable>
        </View>
      )}

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
  scanBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  scanBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 8, padding: 10,
    backgroundColor: "#10B98118", borderRadius: 10,
    borderWidth: 1, borderColor: "#10B98140",
  },
  scanBannerTxt: { flex: 1, fontSize: 12, color: Colors.text, lineHeight: 16 },
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
  cardDetailRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  cardImage: { width: 90, height: 126, borderRadius: 6 },
  cardImagePlaceholder: {
    width: 90, height: 126, borderRadius: 6,
    backgroundColor: Colors.surface, borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: "center", justifyContent: "center",
  },
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
  infoLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    flex: 1,
  },
  infoValue: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 2,
    textAlign: "right",
  },
  noteBox: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 14,
  },
  noteText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  analysingBox: {
    backgroundColor: "rgba(139,92,246,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.3)",
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },

  // Price preview
  previewCard: {
    backgroundColor: "rgba(139,92,246,0.06)",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(139,92,246,0.35)",
    padding: 16,
    gap: 12,
  },
  previewCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  previewCardLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#8B5CF6",
    flex: 1,
  },
  previewStrategy: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  previewGradeList: {
    gap: 2,
  },
  previewGradeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(139,92,246,0.12)",
  },
  previewGradeLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  previewGradeValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  previewNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10B981",
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 10,
  },
  confirmBtnTxt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
  rejectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginTop: 4,
  },
  rejectBtnTxt: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },

  textInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
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
    marginBottom: 12,
  },
  sendBtnTxt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
  resolveRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  resolveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  resolveBtnGreen: {
    borderColor: "rgba(16,185,129,0.4)",
    backgroundColor: "rgba(16,185,129,0.06)",
  },
  resolveBtnRed: {
    borderColor: "rgba(239,68,68,0.4)",
    backgroundColor: "rgba(239,68,68,0.06)",
  },
  resolveBtnTxt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  resolutionBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  resolutionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  resolutionSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  applyFixBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(16,185,129,0.4)",
    backgroundColor: "rgba(16,185,129,0.06)",
    alignSelf: "flex-start",
  },
  applyFixTxt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#10B981",
  },

  manualToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  manualToggleTxt: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textMuted,
  },
  manualForm: {
    marginTop: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 14,
    gap: 14,
  },
  manualFormNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 17,
  },
  manualGrid: {
    gap: 2,
  },
  manualInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  manualInputLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
    width: 72,
  },
  manualInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flex: 1,
    maxWidth: 160,
  },
  manualInputSym: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    marginRight: 4,
  },
  manualInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
    padding: 0,
  },
  manualApplyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
  },
  manualApplyBtnTxt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
});
