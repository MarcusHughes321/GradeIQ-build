import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, RefreshControl, TextInput,
  Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

interface CardVariant {
  id: number;
  base_card_name: string;
  base_set_name: string | null;
  base_set_id: string | null;
  base_card_number: string | null;
  stamp_type: string;
  display_name: string;
  image_url: string | null;
  poketrace_search_term: string | null;
  notes: string | null;
  prices_fetched_at: string | null;
  created_at: string;
}

const STAMP_TYPES = [
  { value: "prerelease",       label: "Prerelease Stamp" },
  { value: "pokemon-center",   label: "Pokémon Centre" },
  { value: "staff",            label: "Staff Stamp" },
  { value: "build-and-battle", label: "Build & Battle" },
  { value: "trick-or-trade",   label: "Trick or Trade" },
  { value: "1st-edition",      label: "1st Edition" },
  { value: "w-promo",          label: "W Promo" },
  { value: "other",            label: "Other" },
];

const STAMP_COLORS: Record<string, string> = {
  prerelease:       "#f59e0b",
  "pokemon-center": "#3b82f6",
  staff:            "#8b5cf6",
  "build-and-battle":"#10b981",
  "trick-or-trade": "#f97316",
  "1st-edition":    "#ef4444",
  "w-promo":        "#6366f1",
  other:            "#6b7280",
};

const emptyForm = {
  base_card_name: "", base_set_name: "", base_card_number: "",
  stamp_type: "prerelease", display_name: "", image_url: "",
  poketrace_search_term: "", notes: "",
};

export default function AdminCardVariants() {
  const insets = useSafeAreaInsets();
  const webTop = Platform.OS === "web" ? 67 : 0;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  const { data: variants = [], isLoading, refetch } = useQuery<CardVariant[]>({
    queryKey: ["/api/admin/card-variants", search],
    queryFn: () =>
      apiRequest("GET", `/api/admin/card-variants${search ? `?search=${encodeURIComponent(search)}` : ""}`)
        .then(r => r.json()),
    staleTime: 0,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        return apiRequest("PATCH", `/api/admin/card-variants/${editingId}`, {
          display_name: form.display_name || undefined,
          image_url: form.image_url || undefined,
          poketrace_search_term: form.poketrace_search_term || undefined,
          notes: form.notes || undefined,
        });
      }
      return apiRequest("POST", "/api/admin/card-variants", {
        base_card_name: form.base_card_name,
        base_set_name: form.base_set_name || null,
        base_card_number: form.base_card_number || null,
        stamp_type: form.stamp_type,
        display_name: form.display_name || STAMP_TYPES.find(s => s.value === form.stamp_type)?.label || form.stamp_type,
        image_url: form.image_url || null,
        poketrace_search_term: form.poketrace_search_term || null,
        notes: form.notes || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/card-variants"] });
      setShowAddForm(false);
      setEditingId(null);
      setForm({ ...emptyForm });
    },
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/card-variants/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/card-variants"] }),
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const handleEdit = (v: CardVariant) => {
    setEditingId(v.id);
    setForm({
      base_card_name: v.base_card_name,
      base_set_name: v.base_set_name || "",
      base_card_number: v.base_card_number || "",
      stamp_type: v.stamp_type,
      display_name: v.display_name,
      image_url: v.image_url || "",
      poketrace_search_term: v.poketrace_search_term || "",
      notes: v.notes || "",
    });
    setShowAddForm(true);
  };

  const handleDelete = (v: CardVariant) => {
    Alert.alert("Delete Variant", `Remove "${v.display_name}" for ${v.base_card_name}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(v.id) },
    ]);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await apiRequest("POST", "/api/admin/card-variants/sync-tcgdex");
      const data = await r.json();
      Alert.alert("Sync Complete", `Added ${data.added} new variants, skipped ${data.skipped} existing.`);
      qc.invalidateQueries({ queryKey: ["/api/admin/card-variants"] });
    } catch (e: any) {
      Alert.alert("Sync Failed", e.message);
    } finally {
      setSyncing(false);
    }
  };

  const stampColor = (type: string) => STAMP_COLORS[type] || "#6b7280";

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + webTop }]}>

        {/* Nav */}
        <View style={styles.navBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.navTitle}>Card Variants</Text>
          <Pressable
            onPress={handleSync}
            hitSlop={8}
            style={({ pressed }) => [styles.syncBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            {syncing
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name="sync-outline" size={20} color={Colors.primary} />}
          </Pressable>
        </View>

        {/* Search bar */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={15} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by card name…"
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {!!search && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.primary} />}
          keyboardShouldPersistTaps="handled"
        >

          {/* Add form */}
          <Pressable
            onPress={() => { setEditingId(null); setForm({ ...emptyForm }); setShowAddForm(v => !v); }}
            style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Ionicons name={showAddForm && !editingId ? "chevron-up" : "add-circle-outline"} size={16} color={Colors.primary} />
            <Text style={styles.addBtnTxt}>{showAddForm && !editingId ? "Cancel" : "Add Stamp Variant"}</Text>
          </Pressable>

          {showAddForm && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>{editingId ? "Edit Variant" : "New Stamp Variant"}</Text>

              {!editingId && (
                <>
                  <Text style={styles.fieldLabel}>Card Name *</Text>
                  <TextInput style={styles.fieldInput} placeholder="e.g. Gengar" placeholderTextColor={Colors.textMuted} value={form.base_card_name} onChangeText={t => setForm(f => ({ ...f, base_card_name: t }))} />

                  <Text style={styles.fieldLabel}>Set Name</Text>
                  <TextInput style={styles.fieldInput} placeholder="e.g. Legend Maker" placeholderTextColor={Colors.textMuted} value={form.base_set_name} onChangeText={t => setForm(f => ({ ...f, base_set_name: t }))} />

                  <Text style={styles.fieldLabel}>Card Number</Text>
                  <TextInput style={styles.fieldInput} placeholder="e.g. 5 or 5/92" placeholderTextColor={Colors.textMuted} value={form.base_card_number} onChangeText={t => setForm(f => ({ ...f, base_card_number: t }))} keyboardType="default" />

                  <Text style={styles.fieldLabel}>Stamp Type *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {STAMP_TYPES.map(st => (
                        <Pressable
                          key={st.value}
                          onPress={() => {
                            setForm(f => ({
                              ...f,
                              stamp_type: st.value,
                              display_name: f.display_name || st.label,
                            }));
                          }}
                          style={[styles.stampChip, form.stamp_type === st.value && { backgroundColor: stampColor(st.value) + "22", borderColor: stampColor(st.value) }]}
                        >
                          <Text style={[styles.stampChipTxt, form.stamp_type === st.value && { color: stampColor(st.value) }]}>{st.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                </>
              )}

              <Text style={styles.fieldLabel}>Display Name</Text>
              <TextInput style={styles.fieldInput} placeholder="e.g. Prerelease Stamp" placeholderTextColor={Colors.textMuted} value={form.display_name} onChangeText={t => setForm(f => ({ ...f, display_name: t }))} />

              <Text style={styles.fieldLabel}>PokeTrace Search Term</Text>
              <TextInput style={styles.fieldInput} placeholder="e.g. Gengar 5 prerelease legend maker" placeholderTextColor={Colors.textMuted} value={form.poketrace_search_term} onChangeText={t => setForm(f => ({ ...f, poketrace_search_term: t }))} />

              <Text style={styles.fieldLabel}>Image URL (optional)</Text>
              <TextInput style={styles.fieldInput} placeholder="https://assets.tcgdex.net/…/high.webp" placeholderTextColor={Colors.textMuted} value={form.image_url} onChangeText={t => setForm(f => ({ ...f, image_url: t }))} autoCapitalize="none" keyboardType="url" />

              <Text style={styles.fieldLabel}>Notes (optional)</Text>
              <TextInput style={[styles.fieldInput, { height: 64, textAlignVertical: "top" }]} placeholder="Any notes about this variant…" placeholderTextColor={Colors.textMuted} value={form.notes} onChangeText={t => setForm(f => ({ ...f, notes: t }))} multiline />

              <Pressable
                onPress={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || (!editingId && !form.base_card_name)}
                style={({ pressed }) => [styles.saveBtn, { opacity: (pressed || saveMutation.isPending) ? 0.7 : 1 }]}
              >
                {saveMutation.isPending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.saveBtnTxt}>{editingId ? "Save Changes" : "Add Variant"}</Text>}
              </Pressable>

              {editingId && (
                <Pressable onPress={() => { setEditingId(null); setForm({ ...emptyForm }); setShowAddForm(false); }} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnTxt}>Cancel Edit</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Info banner */}
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.infoTxt}>
              Tap <Text style={{ color: Colors.primary }}>Sync</Text> to auto-import from TCGdex. Add variants manually for cards PokeTrace tracks separately (e.g. Prerelease stamps, Pokémon Centre exclusives).
            </Text>
          </View>

          {/* Variants list */}
          {isLoading && (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />
          )}

          {!isLoading && variants.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="ribbon-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.emptyTxt}>No variants yet</Text>
              <Text style={styles.emptySubTxt}>Add one above or tap Sync to import from TCGdex</Text>
            </View>
          )}

          {variants.map(v => (
            <View key={v.id} style={styles.variantCard}>
              <View style={styles.variantHeader}>
                <View style={[styles.stampBadge, { backgroundColor: stampColor(v.stamp_type) + "22", borderColor: stampColor(v.stamp_type) }]}>
                  <Text style={[styles.stampBadgeTxt, { color: stampColor(v.stamp_type) }]}>{v.display_name}</Text>
                </View>
                <View style={styles.variantActions}>
                  <Pressable onPress={() => handleEdit(v)} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                    <Ionicons name="pencil-outline" size={16} color={Colors.textMuted} />
                  </Pressable>
                  <Pressable onPress={() => handleDelete(v)} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, marginLeft: 12 })}>
                    <Ionicons name="trash-outline" size={16} color={Colors.error} />
                  </Pressable>
                </View>
              </View>

              <Text style={styles.variantName}>{v.base_card_name}</Text>
              {(v.base_set_name || v.base_card_number) && (
                <Text style={styles.variantMeta}>
                  {[v.base_set_name, v.base_card_number ? `#${v.base_card_number}` : null].filter(Boolean).join(" · ")}
                </Text>
              )}
              {v.poketrace_search_term && (
                <Text style={styles.variantSearch}>Search: "{v.poketrace_search_term}"</Text>
              )}
              {v.prices_fetched_at && (
                <Text style={styles.variantFetched}>
                  Prices cached {Math.round((Date.now() - new Date(v.prices_fetched_at).getTime()) / 3600000)}h ago
                </Text>
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  navBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  navTitle: { fontFamily: "Inter_700Bold", fontSize: 17, color: Colors.text },
  syncBtn: { padding: 4 },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text },
  scroll: { flex: 1 },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 12, paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  addBtnTxt: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.primary },
  formCard: {
    marginHorizontal: 16, marginBottom: 16, backgroundColor: Colors.surface,
    borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  formTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: Colors.text, marginBottom: 14 },
  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
  fieldInput: {
    backgroundColor: Colors.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text,
    borderWidth: 1, borderColor: Colors.surfaceBorder, marginBottom: 12,
  },
  stampChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  stampChipTxt: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.textMuted },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 13,
    alignItems: "center", marginTop: 4,
  },
  saveBtnTxt: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" },
  cancelBtn: { alignItems: "center", paddingVertical: 10, marginTop: 4 },
  cancelBtnTxt: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.textMuted },
  infoBanner: {
    flexDirection: "row", gap: 8, alignItems: "flex-start",
    marginHorizontal: 16, marginBottom: 16, padding: 12,
    backgroundColor: Colors.surface, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  infoTxt: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  emptyState: { alignItems: "center", paddingTop: 48, gap: 8 },
  emptyTxt: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.textSecondary },
  emptySubTxt: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", paddingHorizontal: 32 },
  variantCard: {
    marginHorizontal: 16, marginBottom: 10, backgroundColor: Colors.surface,
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  variantHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  stampBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
    borderWidth: 1, marginRight: "auto",
  },
  stampBadgeTxt: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  variantActions: { flexDirection: "row", alignItems: "center" },
  variantName: { fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.text, marginBottom: 2 },
  variantMeta: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 2 },
  variantSearch: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, fontStyle: "italic", marginTop: 2 },
  variantFetched: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 4 },
});
