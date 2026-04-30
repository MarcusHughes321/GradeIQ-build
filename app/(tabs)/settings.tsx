import React, { useState, useRef, useCallback } from "react";
import { View, Text, StyleSheet, Platform, Switch, ScrollView, Pressable, Alert, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSettings } from "@/lib/settings-context";
import { useSubscription } from "@/lib/subscription";
import { ALL_COMPANIES, CURRENCIES, type CompanyId, type CurrencyCode, type ProfitDisplay } from "@/lib/settings";
import CompanyLabel from "@/components/CompanyLabel";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, toggleCompany, setCurrency, setPreferredPicksCompany, setProfitDisplay } = useSettings();
  const {
    isGateEnabled, isSubscribed, monthlyUsageCount, monthlyLimit, remainingGrades,
    currentTier, tierInfo, isAdminMode, toggleAdminMode, restorePurchases,
    forceSyncSubscription, rcLoading, rcConfigured, rcAppUserId,
  } = useSubscription();
  const [restoring, setRestoring] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const lastTapRef = useRef(0);
  const [adminModalVisible, setAdminModalVisible] = useState(false);
  const [adminCodeInput, setAdminCodeInput] = useState("");
  const [adminVerifying, setAdminVerifying] = useState(false);

  const { data: flagCountData } = useQuery<{ needsReview: number }>({
    queryKey: ["/api/admin/price-flags/count"],
    queryFn: async () => {
      const url = new URL("/api/admin/price-flags/count", getApiUrl());
      const res = await fetch(url.toString());
      return res.json();
    },
    enabled: isAdminMode,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const pendingFlagCount = flagCountData?.needsReview ?? 0;

  const handleVersionTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 500) {
      const next = tapCount + 1;
      setTapCount(next);
      if (next >= 5) {
        setTapCount(0);
        if (isAdminMode) {
          Alert.alert(
            "Disable Admin Mode?",
            "You will return to your normal subscription tier.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Disable", onPress: toggleAdminMode },
            ]
          );
        } else {
          setAdminCodeInput("");
          setAdminModalVisible(true);
        }
      }
    } else {
      setTapCount(1);
    }
    lastTapRef.current = now;
  }, [tapCount, isAdminMode, toggleAdminMode]);
  const verifyAdminCode = async () => {
    if (!adminCodeInput.trim() || adminVerifying) return;
    setAdminVerifying(true);
    try {
      const url = new URL("/api/admin/verify", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminCodeInput }),
      });
      if (res.ok) {
        toggleAdminMode();
        setAdminModalVisible(false);
        setAdminCodeInput("");
        // Register this device's RC user ID as a permanent admin bypass on the server
        if (rcAppUserId) {
          const regUrl = new URL("/api/admin/register-device", getApiUrl());
          fetch(regUrl.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: adminCodeInput, rcUserId: rcAppUserId }),
          }).catch(() => {});
        }
        Alert.alert("Admin Mode Enabled", "You now have unlimited grading access.");
      } else {
        Alert.alert("Incorrect Code", "The code you entered is not valid.");
        setAdminCodeInput("");
      }
    } catch {
      Alert.alert("Error", "Could not verify code. Check your connection.");
    } finally {
      setAdminVerifying(false);
    }
  };

  const handleRestore = useCallback(async () => {
    if (!rcConfigured) {
      Alert.alert("Not Available", "Subscription management is only available on physical devices.");
      return;
    }
    setRestoring(true);
    try {
      const success = await restorePurchases();
      if (success) {
        Alert.alert("Purchases Restored", "Your subscription has been successfully restored.");
      } else {
        Alert.alert("Nothing to Restore", "No active subscription was found. If you believe this is an error, try again or contact support.");
      }
    } catch (e: any) {
      const detail = e?.message ? `\n\n(${e.message})` : "";
      Alert.alert("Restore Failed", `Something went wrong while restoring.${detail}`);
    } finally {
      setRestoring(false);
    }
  }, [rcConfigured, restorePurchases]);

  const handleForceSync = useCallback(async () => {
    if (!rcConfigured) {
      Alert.alert("Not Available", "Subscription service is not yet initialised.");
      return;
    }
    setSyncing(true);
    try {
      const success = await forceSyncSubscription();
      if (success) {
        Alert.alert("Sync Complete", "Your subscription has been detected and activated.");
      } else {
        Alert.alert("Nothing Found", "No active subscription was found. If you have purchased a plan, force-close the app and reopen it — it will reconnect automatically.");
      }
    } catch (e: any) {
      const detail = e?.message ? `\n\n(${e.message})` : "";
      Alert.alert("Sync Failed", `Could not sync subscription.${detail}`);
    } finally {
      setSyncing(false);
    }
  }, [rcConfigured, forceSyncSubscription]);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const enabledCount = settings.enabledCompanies.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={handleVersionTap}>
          <Text style={styles.headerTitle}>Settings</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: insets.bottom + webBottomInset + 100 }} contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Grading Companies</Text>
          <Text style={styles.sectionSubtitle}>
            Choose which grading companies to show in your results and dashboard
          </Text>
        </View>

        <View style={styles.companyList}>
          {ALL_COMPANIES.map((company) => {
            const enabled = settings.enabledCompanies.includes(company.id);
            const isLastEnabled = enabled && enabledCount <= 1;

            return (
              <CompanyRow
                key={company.id}
                id={company.id}
                label={company.label}
                shortLabel={company.shortLabel}
                color={company.color}
                enabled={enabled}
                disabled={isLastEnabled}
                onToggle={toggleCompany}
              />
            );
          })}
        </View>

        <Text style={styles.hint}>
          At least one grading company must remain enabled. More companies coming soon.
        </Text>

        {settings.enabledCompanies.length > 0 && (
          <>
            <View style={[styles.section, { marginTop: 32 }]}>
              <Text style={styles.sectionTitle}>Top Picks Company</Text>
              <Text style={styles.sectionSubtitle}>
                Which company's top grade profit should rank your Top Picks?
              </Text>
            </View>
            <View style={styles.picksCompanyRow}>
              {settings.enabledCompanies.map((id) => {
                const co = ALL_COMPANIES.find(c => c.id === id);
                if (!co) return null;
                const selected = settings.preferredPicksCompany === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setPreferredPicksCompany(id)}
                    style={({ pressed }) => [
                      styles.picksCompanyPill,
                      selected && styles.picksCompanyPillSelected,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <View style={[styles.picksCompanyDot, { backgroundColor: co.color }]} />
                    <Text style={[styles.picksCompanyText, selected && styles.picksCompanyTextSelected]}>
                      {co.shortLabel}
                    </Text>
                    {selected && (
                      <Ionicons name="checkmark" size={13} color={Colors.primary} style={{ marginLeft: 2 }} />
                    )}
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>
              Top Picks will be ranked by this company's best-grade profit. All companies still appear in card details.
            </Text>
          </>
        )}

        {/* ── Profit Display ── */}
        <View style={[styles.section, { marginTop: 32 }]}>
          <Text style={styles.sectionTitle}>Profit Display</Text>
          <Text style={styles.sectionSubtitle}>
            Show profit as a currency amount or as a percentage of the raw card price
          </Text>
        </View>
        <View style={styles.segmentRow}>
          {([
            { key: "value" as ProfitDisplay, icon: "cash-outline", label: "Value" },
            { key: "percentage" as ProfitDisplay, icon: "trending-up-outline", label: "%" },
            { key: "both" as ProfitDisplay, icon: "layers-outline", label: "Both" },
          ]).map(opt => {
            const active = (settings.profitDisplay ?? "value") === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setProfitDisplay(opt.key)}
                style={({ pressed }) => [
                  styles.segmentBtn,
                  active && styles.segmentBtnActive,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Ionicons name={opt.icon as any} size={16} color={active ? Colors.text : Colors.textMuted} />
                <Text style={[styles.segmentBtnText, active && styles.segmentBtnTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>
          {(settings.profitDisplay ?? "value") === "value"
            ? `Profit shown as a currency amount, e.g. +£150`
            : (settings.profitDisplay ?? "value") === "percentage"
            ? `Profit shown as a percentage of the raw price, e.g. +200%`
            : `Profit shown as both, e.g. +£150 (200%)`}
        </Text>

        <>
          <View style={[styles.section, { marginTop: 32 }]}>
            <Text style={styles.sectionTitle}>Currency</Text>
            <Text style={styles.sectionSubtitle}>
              Choose your preferred currency for market values
            </Text>
          </View>

          <View style={styles.companyList}>
            {CURRENCIES.map((c, i) => {
              const selected = (settings.currency || "GBP") === c.code;
              return (
                <React.Fragment key={c.code}>
                  {i > 0 && <View style={styles.menuDivider} />}
                  <Pressable
                    onPress={() => setCurrency(c.code)}
                    style={({ pressed }) => [styles.currencyRow, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text style={[styles.currencyLabel, selected && styles.currencySelected]}>{c.label}</Text>
                    {selected && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
                  </Pressable>
                </React.Fragment>
              );
            })}
          </View>

          <Text style={styles.hint}>
            Changing currency will recalculate all card values when you return to the Home tab.
          </Text>
        </>

        {isAdminMode && (
          <>
            <View style={[styles.section, { marginTop: 32 }]}>
              <Text style={styles.sectionTitle}>Admin</Text>
            </View>
            <View style={styles.companyList}>
              <Pressable
                onPress={() => router.push("/admin-analytics")}
                style={({ pressed }) => [styles.menuRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={styles.menuRowLeft}>
                  <Ionicons name="bar-chart-outline" size={20} color={Colors.primary} />
                  <Text style={styles.menuRowLabel}>Grading Analytics</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </Pressable>
              <View style={styles.menuDivider} />
              <Pressable
                onPress={() => router.push("/admin-price-flags")}
                style={({ pressed }) => [styles.menuRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={styles.menuRowLeft}>
                  <Ionicons name="flag-outline" size={20} color="#F59E0B" />
                  <Text style={styles.menuRowLabel}>Price Flags</Text>
                  {pendingFlagCount > 0 && (
                    <View style={styles.flagBadge}>
                      <Text style={styles.flagBadgeTxt}>{pendingFlagCount > 99 ? "99+" : pendingFlagCount}</Text>
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </Pressable>
              <View style={styles.menuDivider} />
              <Pressable
                onPress={() => router.push("/admin-card-variants")}
                style={({ pressed }) => [styles.menuRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={styles.menuRowLeft}>
                  <Ionicons name="ribbon-outline" size={20} color="#8b5cf6" />
                  <Text style={styles.menuRowLabel}>Card Variants</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </Pressable>
            </View>
          </>
        )}

        <View style={[styles.section, { marginTop: 32 }]}>
          <Text style={styles.sectionTitle}>About</Text>
        </View>

        <View style={styles.companyList}>
          <Pressable
            onPress={() => router.push("/whats-new")}
            style={({ pressed }) => [styles.menuRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={styles.menuRowLeft}>
              <Ionicons name="sparkles-outline" size={20} color="#8B5CF6" />
              <Text style={styles.menuRowLabel}>What's New</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable
            onPress={() => router.push("/about")}
            style={({ pressed }) => [styles.menuRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={styles.menuRowLeft}>
              <Ionicons name="heart-outline" size={20} color={Colors.primary} />
              <Text style={styles.menuRowLabel}>About Grade.IQ</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable
            onPress={() => router.push("/grading-standards")}
            style={({ pressed }) => [styles.menuRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={styles.menuRowLeft}>
              <Ionicons name="school-outline" size={20} color="#60A5FA" />
              <Text style={styles.menuRowLabel}>Grading Standards</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable
            onPress={() => router.push("/grading-fees")}
            style={({ pressed }) => [styles.menuRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={styles.menuRowLeft}>
              <Ionicons name="pricetag-outline" size={20} color="#F59E0B" />
              <Text style={styles.menuRowLabel}>Grading Fees</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable
            onPress={() => router.push("/feedback")}
            style={({ pressed }) => [styles.menuRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={styles.menuRowLeft}>
              <Ionicons name="chatbubble-outline" size={20} color="#10B981" />
              <Text style={styles.menuRowLabel}>Send Feedback</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable
            onPress={() => router.push("/terms")}
            style={({ pressed }) => [styles.menuRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={styles.menuRowLeft}>
              <Ionicons name="shield-checkmark-outline" size={20} color={Colors.primary} />
              <Text style={styles.menuRowLabel}>Terms & Disclaimer</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable
            onPress={() => router.push("/privacy")}
            style={({ pressed }) => [styles.menuRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={styles.menuRowLeft}>
              <Ionicons name="lock-closed-outline" size={20} color="#10B981" />
              <Text style={styles.menuRowLabel}>Privacy Policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </Pressable>
        </View>

        {isGateEnabled && (
          <>
            <View style={[styles.section, { marginTop: 32 }]}>
              <Text style={styles.sectionTitle}>Your Plan</Text>
            </View>

            <View style={styles.proCard}>
              <View style={styles.proCardHeader}>
                <View style={styles.proBadge}>
                  {rcLoading ? (
                    <ActivityIndicator size="small" color={Colors.textSecondary} />
                  ) : (
                    <Ionicons name={isSubscribed ? "diamond" : "time-outline"} size={16} color={isSubscribed ? "#F59E0B" : Colors.textSecondary} />
                  )}
                  <Text style={[styles.proBadgeText, isSubscribed && { color: "#F59E0B" }]}>
                    {rcLoading ? "Checking..." : tierInfo.name}
                  </Text>
                </View>
              </View>

              {!rcLoading && currentTier !== "obsessed" && (
                <>
                  <View style={styles.usageBar}>
                    <View style={styles.usageBarTrack}>
                      <View
                        style={[
                          styles.usageBarFill,
                          {
                            width: `${monthlyLimit ? (monthlyUsageCount / monthlyLimit) * 100 : 0}%`,
                            backgroundColor: (remainingGrades !== null && remainingGrades === 0) ? Colors.primary : "#10B981",
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.usageLabel}>
                      {remainingGrades ?? 0} of {monthlyLimit} grades remaining this month
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => router.push("/paywall")}
                    style={({ pressed }) => [styles.upgradeBtn, { opacity: pressed ? 0.85 : 1 }]}
                  >
                    <Ionicons name="diamond" size={16} color="#fff" />
                    <Text style={styles.upgradeBtnText}>
                      {isSubscribed ? "Upgrade Plan" : "View Plans"}
                    </Text>
                  </Pressable>
                </>
              )}

              {!rcLoading && currentTier === "obsessed" && (
                <Text style={styles.proActiveText}>
                  You have unlimited access to all grading features.
                </Text>
              )}

              <View style={styles.restoreRow}>
                <Pressable
                  onPress={handleForceSync}
                  disabled={syncing || restoring || rcLoading}
                  style={({ pressed }) => [styles.syncBtn, { opacity: (pressed || syncing || restoring || rcLoading) ? 0.5 : 1 }]}
                >
                  {syncing ? (
                    <ActivityIndicator size="small" color={Colors.textMuted} />
                  ) : null}
                  <Text style={styles.syncBtnText}>
                    {syncing ? "Syncing..." : "Sync Subscription"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleRestore}
                  disabled={restoring || rcLoading}
                  style={({ pressed }) => [styles.restoreBtn, { opacity: (pressed || restoring || rcLoading) ? 0.5 : 1 }]}
                >
                  {restoring ? (
                    <ActivityIndicator size="small" color={Colors.textMuted} />
                  ) : null}
                  <Text style={styles.restoreBtnText}>
                    {restoring ? "Restoring..." : "Restore Purchases"}
                  </Text>
                </Pressable>
              </View>

              {rcAppUserId ? (
                <View style={styles.debugCard}>
                  <Text style={styles.debugTitle}>Subscription Info</Text>
                  <Pressable
                    style={styles.debugItem}
                    onPress={() => {
                      Clipboard.setStringAsync(rcAppUserId);
                      Alert.alert("Copied", "Device ID copied to clipboard.");
                    }}
                  >
                    <Text style={styles.debugLabel}>Device ID</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 }}>
                      <Text style={styles.debugValue} numberOfLines={1} ellipsizeMode="middle">
                        {rcAppUserId}
                      </Text>
                      <Ionicons name="copy-outline" size={11} color={Colors.textMuted} />
                    </View>
                  </Pressable>
                  <View style={styles.debugItem}>
                    <Text style={styles.debugLabel}>Detected Plan</Text>
                    <Text style={styles.debugValue}>{tierInfo.name}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      {/* Admin code modal — replaces Alert.prompt which is iOS-only */}
      <Modal
        visible={adminModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAdminModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.7)" }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.adminModal}>
            <Text style={styles.adminModalTitle}>Enter Admin Code</Text>
            <Text style={styles.adminModalSubtitle}>Enter the secret code to unlock unlimited access.</Text>
            <TextInput
              style={styles.adminModalInput}
              value={adminCodeInput}
              onChangeText={setAdminCodeInput}
              secureTextEntry
              placeholder="Secret code"
              placeholderTextColor={Colors.textMuted}
              autoFocus
              onSubmitEditing={verifyAdminCode}
            />
            <View style={styles.adminModalBtns}>
              <Pressable
                onPress={() => { setAdminModalVisible(false); setAdminCodeInput(""); }}
                style={({ pressed }) => [styles.adminModalBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={styles.adminModalBtnCancel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={verifyAdminCode}
                style={({ pressed }) => [styles.adminModalBtn, styles.adminModalBtnPrimary, { opacity: pressed ? 0.7 : 1 }]}
              >
                {adminVerifying
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.adminModalBtnUnlock}>Unlock</Text>
                }
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function CompanyRow({
  id,
  label,
  shortLabel,
  color,
  enabled,
  disabled,
  onToggle,
}: {
  id: CompanyId;
  label: string;
  shortLabel: string;
  color: string;
  enabled: boolean;
  disabled: boolean;
  onToggle: (id: CompanyId) => void;
}) {
  return (
    <View style={[styles.companyRow, !enabled && styles.companyRowDisabled]}>
      <View style={styles.companyInfo}>
        <View style={{ width: 40, opacity: enabled ? 1 : 0.4 }}><CompanyLabel company={shortLabel} fontSize={16} /></View>
        <Text style={[styles.companyLabel, !enabled && styles.companyLabelDisabled]}>{label}</Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={() => {
          if (!disabled) onToggle(id);
        }}
        disabled={disabled}
        trackColor={{ false: Colors.surfaceBorder, true: Colors.primary + "80" }}
        thumbColor={enabled ? Colors.primary : Colors.textMuted}
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
    paddingVertical: 14,
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
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.text,
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  companyList: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: "hidden",
  },
  companyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  companyRowDisabled: {
    opacity: 0.5,
  },
  companyInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  companyShort: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    width: 40,
  },
  companyLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: Colors.text,
  },
  companyLabelDisabled: {
    color: Colors.textMuted,
  },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 12,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  proCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    gap: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  proCardHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  proBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  proBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  usageBar: {
    gap: 8,
  },
  usageBarTrack: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 3,
    overflow: "hidden" as const,
  },
  usageBarFill: {
    height: 6,
    borderRadius: 3,
  },
  usageLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  upgradeBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: "#F59E0B",
    paddingVertical: 14,
    borderRadius: 12,
  },
  upgradeBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#fff",
  },
  proActiveText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#10B981",
  },
  restoreRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-around" as const,
    marginTop: 4,
    gap: 8,
  },
  syncBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 10,
    flex: 1,
  },
  syncBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "#60A5FA",
    textDecorationLine: "underline" as const,
  },
  restoreBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 10,
    flex: 1,
  },
  restoreBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textMuted,
    textDecorationLine: "underline" as const,
  },
  debugCard: {
    backgroundColor: "rgba(255,255,255,0.04)" as const,
    borderRadius: 10,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)" as const,
  },
  debugTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: Colors.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
    marginBottom: 4,
  },
  debugItem: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: 2,
  },
  debugLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
    flexShrink: 0,
  },
  debugValue: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    flexShrink: 1,
    textAlign: "right" as const,
  },
  menuRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  menuRowLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  menuRowLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: Colors.text,
  },
  menuDivider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginHorizontal: 16,
  },
  currencyRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  currencyLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: Colors.text,
  },
  currencySelected: {
    color: Colors.primary,
    fontFamily: "Inter_700Bold",
  },
  picksCompanyRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 10,
    paddingHorizontal: 16,
  },
  picksCompanyPill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  picksCompanyPillSelected: {
    borderColor: Colors.primary,
    backgroundColor: "rgba(255,60,49,0.08)",
  },
  picksCompanyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  picksCompanyText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  picksCompanyTextSelected: {
    color: Colors.primary,
  },
  segmentRow: {
    flexDirection: "row" as const,
    gap: 10,
    paddingHorizontal: 16,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 7,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  segmentBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: "rgba(255,60,49,0.08)",
  },
  segmentBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.textMuted,
  },
  segmentBtnTextActive: {
    color: Colors.text,
  },
  flagBadge: {
    backgroundColor: "#EF4444",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    marginLeft: 6,
  },
  flagBadgeTxt: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: "#fff",
  },
  adminModal: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 32,
    width: "100%",
    maxWidth: 340,
    gap: 12,
  },
  adminModalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
    textAlign: "center",
  },
  adminModalSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  adminModalInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.text,
    marginTop: 4,
  },
  adminModalBtns: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  adminModalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  adminModalBtnPrimary: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  adminModalBtnCancel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.textSecondary,
  },
  adminModalBtnUnlock: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});
