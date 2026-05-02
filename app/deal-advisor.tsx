import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

// ── Types ─────────────────────────────────────────────────────────────────────

type CardRow = {
  card_id: string;
  name: string;
  set_name: string;
  number: string;
  lang: string;
  image_url: string | null;
  rarity: string | null;
  display_name: string;
  set_name_en: string | null;
  price_eur: number | null;
  prices_json: any;
  match_score?: number;
};

type Prices = {
  raw: number | null;
  psa10: number | null;
  psa9: number | null;
  bgs95: number | null;
  ace10: number | null;
  tag10: number | null;
  cgc10: number | null;
  rawTcg: string | null;
  allGrades?: any;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  prices?: Prices | null;
  isError?: boolean;
  retryText?: string;
};

const SUGGESTIONS = [
  "Is the Charizard ex SIR from Obsidian Flames worth grading?",
  "How liquid is Umbreon VMAX Alternate Art from Evolving Skies?",
  "What's a PSA 10 Base Set Charizard worth right now?",
  "Japanese Pikachu Illustrator — is it a good investment?",
  "Should I buy a raw Magikarp SIR from Paldea Evolved?",
];

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "• ")
    .trim();
}

// ── Card picker item ───────────────────────────────────────────────────────────

function CardPickerItem({ card, onSelect }: { card: CardRow; onSelect: (c: CardRow) => void }) {
  const isJP = card.lang === "ja";
  const displayName = card.display_name || card.name;
  const setDisplay = (isJP ? card.set_name_en : null) || card.set_name;

  return (
    <Pressable
      style={({ pressed }) => [styles.pickerItem, { opacity: pressed ? 0.75 : 1 }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onSelect(card);
      }}
    >
      <View style={styles.pickerImageWrap}>
        {card.image_url ? (
          <Image source={{ uri: card.image_url }} style={styles.pickerImage} contentFit="contain" />
        ) : (
          <View style={[styles.pickerImage, styles.pickerImageFallback]}>
            <Ionicons name="card-outline" size={22} color={Colors.textMuted} />
          </View>
        )}
        {isJP && (
          <View style={styles.jpBadge}>
            <Text style={styles.jpBadgeText}>JP</Text>
          </View>
        )}
      </View>
      <View style={styles.pickerInfo}>
        <Text style={styles.pickerName} numberOfLines={2}>{displayName}</Text>
        <Text style={styles.pickerSet} numberOfLines={1}>{setDisplay}</Text>
        {card.number ? <Text style={styles.pickerNumber}>#{card.number}</Text> : null}
        {card.rarity ? <Text style={styles.pickerRarity} numberOfLines={1}>{card.rarity}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </Pressable>
  );
}

// ── Selected card header bar ───────────────────────────────────────────────────

function SelectedCardBar({ card, onClear }: { card: CardRow; onClear: () => void }) {
  const isJP = card.lang === "ja";
  const displayName = card.display_name || card.name;
  const setDisplay = (isJP ? card.set_name_en : null) || card.set_name;

  return (
    <View style={styles.selectedBar}>
      {card.image_url ? (
        <Image source={{ uri: card.image_url }} style={styles.selectedBarImage} contentFit="contain" />
      ) : (
        <View style={[styles.selectedBarImage, styles.pickerImageFallback]}>
          <Ionicons name="card-outline" size={14} color={Colors.textMuted} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.selectedBarName} numberOfLines={1}>{displayName}</Text>
        <Text style={styles.selectedBarSet} numberOfLines={1}>{setDisplay}{card.number ? ` · #${card.number}` : ""}</Text>
      </View>
      <Pressable onPress={onClear} style={styles.changeCardBtn} hitSlop={10}>
        <Ionicons name="swap-horizontal" size={14} color={Colors.primary} />
        <Text style={styles.changeCardText}>Change</Text>
      </Pressable>
    </View>
  );
}

// ── Prices block (shown in first assistant reply) ──────────────────────────────

function PricesBlock({ prices, card, onProfit }: { prices: Prices; card: CardRow; onProfit: () => void }) {
  const rows: { label: string; value: number | null }[] = [
    { label: "PSA 10", value: prices.psa10 },
    { label: "PSA 9",  value: prices.psa9 },
    { label: "BGS 9.5", value: prices.bgs95 },
    { label: "ACE 10", value: prices.ace10 },
    { label: "TAG 10", value: prices.tag10 },
    { label: "CGC 10", value: prices.cgc10 },
    { label: "Raw eBay", value: prices.raw },
  ].filter(r => r.value != null && r.value > 0);

  return (
    <View style={styles.pricesBlock}>
      <View style={styles.pricesHeader}>
        <Text style={styles.pricesTitle}>Market prices</Text>
        <Pressable onPress={onProfit} style={styles.profitLink} hitSlop={8}>
          <Text style={styles.profitLinkText}>Full analysis →</Text>
        </Pressable>
      </View>
      {prices.rawTcg ? (
        <Text style={styles.rawTcgLine}>{prices.rawTcg}</Text>
      ) : null}
      <View style={styles.pricesList}>
        {rows.map(r => (
          <View key={r.label} style={styles.priceRow}>
            <Text style={styles.priceLabel}>{r.label}</Text>
            <Text style={[styles.priceValue, r.label === "PSA 10" && { color: "#34D399" }]}>
              £{r.value!.toFixed(0)}
            </Text>
          </View>
        ))}
      </View>
      {rows.length === 0 && (
        <Text style={styles.noPriceText}>No recent eBay graded sales found</Text>
      )}
    </View>
  );
}

// ── Assistant message bubble ───────────────────────────────────────────────────

function AssistantMessage({
  msg,
  card,
  onRetry,
  onProfit,
}: {
  msg: Message;
  card: CardRow | null;
  onRetry?: (text: string) => void;
  onProfit?: () => void;
}) {
  if (msg.isError) {
    return (
      <View style={styles.aiBubbleWrap}>
        <View style={[styles.aiAvatar, { backgroundColor: "#3a1a1a" }]}>
          <Ionicons name="warning-outline" size={14} color="#ff6b6b" />
        </View>
        <View style={[styles.aiBubble, { borderWidth: 1, borderColor: "#3a1a1a" }]}>
          <Text style={[styles.aiText, { color: "#ff8080" }]}>{msg.text}</Text>
          {onRetry && msg.retryText && (
            <Pressable
              onPress={() => onRetry(msg.retryText!)}
              style={({ pressed }) => [styles.retryBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Ionicons name="refresh" size={13} color={Colors.primary} />
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.aiBubbleWrap}>
      <View style={styles.aiAvatar}>
        <Text style={styles.aiAvatarText}>AI</Text>
      </View>
      <View style={styles.aiBubble}>
        <Text style={styles.aiText}>{stripMarkdown(msg.text)}</Text>
        {msg.prices && card && onProfit && (
          <PricesBlock prices={msg.prices} card={card} onProfit={onProfit} />
        )}
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function DealAdvisorScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  // Phase 1: no card selected
  const [input, setInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CardRow[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Phase 2: card selected → conversation
  const [selectedCard, setSelectedCard] = useState<CardRow | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  const apiBase = getApiUrl();

  // History for Claude (plain text pairs — simple and reliable)
  const history = messages
    .slice(0, 10)
    .reverse()
    .map((m) => ({ role: m.role, content: m.text }));

  // ── Search card catalog ────────────────────────────────────────────────────
  const searchCards = useCallback(async (query: string) => {
    if (!query.trim()) return;
    Keyboard.dismiss();
    setSearching(true);
    setSearchResults(null);
    setNotFound(false);
    try {
      const url = new URL("/api/card-advisor/search", apiBase);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      setSearchResults(data.cards ?? []);
      setNotFound(data.notFound || (data.cards ?? []).length === 0);
    } catch {
      setNotFound(true);
    } finally {
      setSearching(false);
    }
  }, [apiBase]);

  // ── User selects a card → start conversation ───────────────────────────────
  const selectCard = useCallback((card: CardRow) => {
    setSelectedCard(card);
    setSearchResults(null);
    setNotFound(false);
    setInput("");
    setMessages([]);
    // Auto-send the original query as the first message
    const firstMessage = input.trim() || `Tell me about ${card.display_name || card.name} from ${(card.lang === "ja" ? card.set_name_en : null) || card.set_name}`;
    sendAdvice(card, firstMessage, []);
  }, [input]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Get advice for selected card ───────────────────────────────────────────
  const sendAdvice = useCallback(async (
    card: CardRow,
    message: string,
    currentHistory: { role: string; content: string }[],
  ) => {
    const trimmed = message.trim();
    if (!trimmed || loading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput("");

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", text: trimmed };
    setMessages((prev) => [userMsg, ...prev]);
    setLoading(true);

    try {
      const url = new URL("/api/card-advisor/advice", apiBase);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card, message: trimmed, history: currentHistory }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setMessages((prev) => [{
        id: `a-${Date.now()}`,
        role: "assistant",
        text: data.reply,
        prices: data.prices ?? null,
      }, ...prev]);
    } catch (e: any) {
      const isTimeout = e?.name === "AbortError";
      setMessages((prev) => [{
        id: `e-${Date.now()}`,
        role: "assistant",
        text: isTimeout ? "That took too long — tap Retry to try again." : "Couldn't reach the server. Tap Retry.",
        isError: true,
        retryText: trimmed,
      }, ...prev]);
    } finally {
      setLoading(false);
    }
  }, [loading, apiBase]);

  // ── Send follow-up message ─────────────────────────────────────────────────
  const sendFollowUp = useCallback((text: string) => {
    if (!selectedCard) return;
    sendAdvice(selectedCard, text, history);
  }, [selectedCard, history, sendAdvice]);

  // ── Reset to phase 1 ───────────────────────────────────────────────────────
  const resetToSearch = useCallback(() => {
    setSelectedCard(null);
    setMessages([]);
    setSearchResults(null);
    setNotFound(false);
    setInput("");
  }, []);

  // ── Profit screen navigation ───────────────────────────────────────────────
  const goToProfit = useCallback(() => {
    if (!selectedCard) return;
    const displayName = selectedCard.display_name || selectedCard.name;
    const setDisplay = (selectedCard.lang === "ja" ? selectedCard.set_name_en : null) || selectedCard.set_name;
    // Pre-populate cache if we have prices
    const pricesMsg = messages.find((m) => m.prices);
    if (pricesMsg?.prices?.allGrades) {
      qc.setQueryData(
        ["ebay-all-grades", displayName, setDisplay, selectedCard.number ?? "", null],
        pricesMsg.prices.allGrades,
      );
    }
    router.push({
      pathname: "/card-profit",
      params: {
        cardName: displayName,
        setName: setDisplay,
        imageUrl: selectedCard.image_url ?? "",
        cardNumber: selectedCard.number ?? "",
        rawPriceUSD: "0",
      },
    });
  }, [selectedCard, messages, qc]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const isPhase2 = selectedCard !== null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Card Advisor</Text>
          <Text style={styles.headerSub}>
            {isPhase2 ? "Follow-up or ask about another card" : "Search for a card to get started"}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Selected card bar (phase 2) */}
      {isPhase2 && <SelectedCardBar card={selectedCard} onClear={resetToSearch} />}

      {/* Phase 1: empty state + search results */}
      {!isPhase2 && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.phase1Content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!searching && !searchResults && !notFound && (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Ionicons name="search-outline" size={36} color={Colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Which card?</Text>
              <Text style={styles.emptySub}>
                Describe the card you want to discuss — name, set, and rarity if you know it.
                I'll find the exact card in our database so I can give you accurate prices.
              </Text>
              <Text style={styles.suggestionsLabel}>Try asking…</Text>
              <View style={styles.suggestions}>
                {SUGGESTIONS.map((s, i) => (
                  <Pressable
                    key={i}
                    style={({ pressed }) => [styles.suggestionChip, { opacity: pressed ? 0.7 : 1 }]}
                    onPress={() => { setInput(s); searchCards(s); }}
                  >
                    <Text style={styles.suggestionText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {searching && (
            <View style={styles.searchingWrap}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.searchingText}>Searching card database…</Text>
            </View>
          )}

          {notFound && !searching && (
            <View style={styles.notFoundWrap}>
              <Ionicons name="alert-circle-outline" size={32} color={Colors.textMuted} />
              <Text style={styles.notFoundTitle}>Card not found</Text>
              <Text style={styles.notFoundSub}>
                Try being more specific — include the set name, card number, or rarity (e.g. "SIR", "Alt Art").
              </Text>
            </View>
          )}

          {searchResults && searchResults.length > 0 && !searching && (
            <View style={styles.resultsWrap}>
              <Text style={styles.resultsLabel}>
                {searchResults.length} card{searchResults.length !== 1 ? "s" : ""} found — tap the one you mean
              </Text>
              {searchResults.map((card) => (
                <CardPickerItem key={card.card_id} card={card} onSelect={selectCard} />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Phase 2: chat */}
      {isPhase2 && (
        <FlatList
          ref={listRef}
          data={
            loading
              ? [{ id: "loading", role: "assistant" as const, text: "" }, ...messages]
              : messages
          }
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            if (item.id === "loading") {
              return (
                <View style={styles.aiBubbleWrap}>
                  <View style={styles.aiAvatar}>
                    <Text style={styles.aiAvatarText}>AI</Text>
                  </View>
                  <View style={[styles.aiBubble, styles.loadingBubble]}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={styles.loadingText}>Looking up prices…</Text>
                  </View>
                </View>
              );
            }
            if (item.role === "user") {
              return (
                <View style={styles.userBubbleWrap}>
                  <View style={styles.userBubble}>
                    <Text style={styles.userText}>{item.text}</Text>
                  </View>
                </View>
              );
            }
            return (
              <AssistantMessage
                msg={item}
                card={selectedCard}
                onProfit={goToProfit}
                onRetry={(text) => {
                  setMessages((prev) => prev.filter((m) => m.id !== item.id));
                  sendFollowUp(text);
                }}
              />
            );
          }}
          inverted
          contentContainerStyle={[styles.listContent, { paddingBottom: 16, paddingTop: 8 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={isPhase2 ? "Ask a follow-up or search for another card…" : "Describe a card (e.g. Charizard ex Obsidian Flames)…"}
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={400}
          returnKeyType="default"
          onSubmitEditing={() => {
            if (isPhase2) sendFollowUp(input);
            else searchCards(input);
          }}
          blurOnSubmit={false}
        />
        <Pressable
          style={[styles.sendBtn, (!input.trim() || loading || searching) && styles.sendBtnDisabled]}
          onPress={() => {
            if (!input.trim() || loading || searching) return;
            if (isPhase2) {
              // If input looks like a new card search (when user types something different), search first
              sendFollowUp(input);
            } else {
              searchCards(input);
            }
          }}
          hitSlop={8}
        >
          {searching ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name={isPhase2 ? "arrow-up" : "search"} size={20} color="#fff" />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    backgroundColor: Colors.background,
  },
  backBtn: { width: 40, justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: Colors.text },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 1 },

  // Selected card bar
  selectedBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  selectedBarImage: { width: 32, height: 44, borderRadius: 4 },
  selectedBarName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text },
  selectedBarSet: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 1 },
  changeCardBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.primary + "40" },
  changeCardText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.primary },

  // Phase 1
  phase1Content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },

  emptyWrap: { paddingTop: 24 },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text, textAlign: "center", marginBottom: 8 },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", lineHeight: 21, marginBottom: 24 },
  suggestionsLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  suggestions: { gap: 8 },
  suggestionChip: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Colors.surfaceBorder },
  suggestionText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text, lineHeight: 20 },

  searchingWrap: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 40, justifyContent: "center" },
  searchingText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted },

  notFoundWrap: { alignItems: "center", paddingTop: 40, gap: 12 },
  notFoundTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text },
  notFoundSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", lineHeight: 21, paddingHorizontal: 8 },

  resultsWrap: { paddingTop: 8, gap: 8 },
  resultsLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },

  // Card picker item
  pickerItem: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  pickerImageWrap: { position: "relative" },
  pickerImage: { width: 52, height: 72, borderRadius: 6 },
  pickerImageFallback: { backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" },
  jpBadge: { position: "absolute", top: -4, right: -4, backgroundColor: "#FF3C31", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  jpBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" },
  pickerInfo: { flex: 1, gap: 2 },
  pickerName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text },
  pickerSet: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  pickerNumber: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  pickerRarity: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.primary },

  // Chat
  listContent: { paddingHorizontal: 16 },

  userBubbleWrap: { alignItems: "flex-end", marginVertical: 6 },
  userBubble: { backgroundColor: Colors.primary, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10, maxWidth: "78%" },
  userText: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#fff", lineHeight: 21 },

  aiBubbleWrap: { flexDirection: "row", alignItems: "flex-start", marginVertical: 6, gap: 10 },
  aiAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", marginTop: 2, flexShrink: 0 },
  aiAvatarText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  aiBubble: { flex: 1, backgroundColor: Colors.surface, borderRadius: 16, padding: 14 },
  aiText: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.text, lineHeight: 22 },

  loadingBubble: { flexDirection: "row", alignItems: "center", gap: 10 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted },

  retryBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.background },
  retryBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.primary },

  // Prices block
  pricesBlock: { marginTop: 14, backgroundColor: Colors.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  pricesHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  pricesTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  profitLink: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: Colors.primary + "15" },
  profitLinkText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  rawTcgLine: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginBottom: 8 },
  pricesList: { gap: 6 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  priceLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  priceValue: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.text },
  noPriceText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", paddingVertical: 4 },

  // Input bar
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, backgroundColor: Colors.background },
  input: { flex: 1, backgroundColor: Colors.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.text, maxHeight: 120, borderWidth: 1, borderColor: Colors.surfaceBorder },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { opacity: 0.4 },
});
