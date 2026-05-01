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
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

type CardResult = {
  name: string;
  set: string | null;
  number: string | null;
  grade: number | null;
  company: string | null;
  isRaw: boolean;
  gradeKey: string;
  imageUrl: string | null;
  marketValueUsd: number | null;
  marketValueGbp: number | null;
  saleCount: number | null;
  avg7d: number | null;
  avg30d: number | null;
  // Research mode multi-tier prices
  rawGbp: number | null;
  psa10Gbp: number | null;
  psa9Gbp: number | null;
  gradingUpside: number | null;
};

type AdvisorResponse = {
  reply: string;
  cards: CardResult[];
  totalMarketGbp: number;
  offeredGbp: number | null;
  pctOfMarket: number | null;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  data?: AdvisorResponse;
};

const SUGGESTIONS = [
  "Is a Mega Charizard SIR from Paradox Rift worth buying right now?",
  "Someone offered me £500 for a PSA 10 Base Set Charizard — good deal?",
  "What's the investment outlook for Umbreon VMAX Alternate Art?",
  "How liquid is a BGS 9.5 Pikachu Illustrator and what's it worth?",
  "Should I buy a raw 1st Edition Blastoise or get it graded first?",
];

function DealScorePill({ pct }: { pct: number }) {
  const color = pct >= 85 ? "#34D399" : pct >= 65 ? "#F59E0B" : "#FF3C31";
  const label = pct >= 85 ? "Strong deal" : pct >= 65 ? "Fair deal" : "Below market";
  return (
    <View style={[styles.scorePill, { borderColor: color + "50", backgroundColor: color + "15" }]}>
      <Text style={[styles.scoreNum, { color }]}>{pct}%</Text>
      <Text style={[styles.scoreLabel, { color }]}>{label}</Text>
    </View>
  );
}

function CardTile({ card }: { card: CardResult }) {
  const gradeLabel = card.isRaw
    ? "Raw"
    : card.company && card.grade
    ? `${card.company} ${card.grade}`
    : card.grade
    ? `Grade ${card.grade}`
    : "Graded";

  const companyColor: Record<string, string> = {
    PSA: "#1D6FBB",
    BGS: "#C0392B",
    Beckett: "#C0392B",
    ACE: "#2ECC71",
    TAG: "#8E44AD",
    CGC: "#E67E22",
  };
  const pillColor = card.company ? (companyColor[card.company] ?? Colors.textMuted) : Colors.textMuted;

  return (
    <View style={styles.cardTile}>
      <View style={styles.cardImageWrap}>
        {card.imageUrl ? (
          <Image
            source={{ uri: card.imageUrl }}
            style={styles.cardImage}
            contentFit="contain"
          />
        ) : (
          <View style={[styles.cardImage, styles.cardImageFallback]}>
            <Ionicons name="card-outline" size={28} color={Colors.textMuted} />
          </View>
        )}
        <View style={[styles.gradePill, { backgroundColor: pillColor }]}>
          <Text style={styles.gradePillText}>{gradeLabel}</Text>
        </View>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={2}>{card.name}</Text>
        {card.set ? <Text style={styles.cardSet} numberOfLines={1}>{card.set}</Text> : null}

        {card.isRaw ? (
          // Research mode: show price tiers
          card.rawGbp != null || card.psa10Gbp != null ? (
            <View style={styles.researchPrices}>
              {card.rawGbp != null && (
                <View style={styles.researchRow}>
                  <Text style={styles.researchLabel}>Raw</Text>
                  <Text style={styles.researchValue}>£{card.rawGbp.toFixed(0)}</Text>
                </View>
              )}
              {card.psa10Gbp != null && (
                <View style={styles.researchRow}>
                  <Text style={styles.researchLabel}>PSA 10</Text>
                  <Text style={[styles.researchValue, { color: "#34D399" }]}>£{card.psa10Gbp.toFixed(0)}</Text>
                </View>
              )}
              {card.gradingUpside != null && card.gradingUpside > 1 && (
                <View style={styles.researchRow}>
                  <Text style={styles.researchLabel}>Grading upside</Text>
                  <Text style={[styles.researchValue, { color: "#F59E0B" }]}>{card.gradingUpside}×</Text>
                </View>
              )}
              {card.saleCount != null && (
                <Text style={styles.cardSales}>{card.saleCount} recent sales</Text>
              )}
            </View>
          ) : (
            <Text style={styles.cardNoPrice}>No price data</Text>
          )
        ) : (
          // Deal mode: show single grade price
          card.marketValueGbp != null ? (
            <View>
              <View style={styles.cardPriceRow}>
                <Text style={styles.cardPrice}>£{card.marketValueGbp.toFixed(0)}</Text>
                {card.avg7d != null && (
                  <Text style={styles.cardAvg}>7d avg £{(card.avg7d * 0.79).toFixed(0)}</Text>
                )}
              </View>
              {card.saleCount != null && (
                <Text style={styles.cardSales}>{card.saleCount} recent sales</Text>
              )}
            </View>
          ) : (
            <Text style={styles.cardNoPrice}>No price data</Text>
          )
        )}
      </View>
    </View>
  );
}

function AssistantMessage({ msg }: { msg: Message }) {
  const d = msg.data;
  return (
    <View style={styles.aiBubbleWrap}>
      <View style={styles.aiAvatar}>
        <Text style={styles.aiAvatarText}>AI</Text>
      </View>
      <View style={styles.aiBubble}>
        <Text style={styles.aiText}>{msg.text}</Text>

        {d && d.cards.length > 0 && (
          <View style={styles.cardsSection}>
            <View style={styles.cardsDivider} />
            <Text style={styles.cardsHeader}>Cards identified</Text>
            <View style={styles.cardsList}>
              {d.cards.map((card, i) => (
                <CardTile key={i} card={card} />
              ))}
            </View>

            {d.totalMarketGbp > 0 && (
              <View style={styles.summaryBox}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Combined market value</Text>
                  <Text style={styles.summaryValue}>£{d.totalMarketGbp.toFixed(0)}</Text>
                </View>
                {d.offeredGbp != null && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Offered price</Text>
                    <Text style={[styles.summaryValue, { color: Colors.text }]}>£{d.offeredGbp.toFixed(0)}</Text>
                  </View>
                )}
                {d.pctOfMarket != null && (
                  <View style={[styles.summaryRow, { marginTop: 10 }]}>
                    <DealScorePill pct={d.pctOfMarket} />
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

export default function DealAdvisorScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  const history = messages.map((m) => ({
    role: m.role,
    content: m.text,
  }));

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    setInput("");

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      text: trimmed,
    };
    setMessages((prev) => [userMsg, ...prev]);
    setLoading(true);

    try {
      const url = new URL("/api/deal-advisor", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: AdvisorResponse = await res.json();

      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: data.reply,
        data,
      };
      setMessages((prev) => [aiMsg, ...prev]);
    } catch (e) {
      const errMsg: Message = {
        id: `e-${Date.now()}`,
        role: "assistant",
        text: "Sorry, I couldn't process that deal right now. Please try again.",
      };
      setMessages((prev) => [errMsg, ...prev]);
    } finally {
      setLoading(false);
    }
  }, [loading, history]);

  const renderItem = ({ item }: { item: Message }) => {
    if (item.role === "user") {
      return (
        <View style={styles.userBubbleWrap}>
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{item.text}</Text>
          </View>
        </View>
      );
    }
    return <AssistantMessage msg={item} />;
  };

  const showEmpty = messages.length === 0 && !loading;

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
          <Text style={styles.headerSub}>Prices · market trends · deal analysis</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={loading ? [{ id: "loading", role: "assistant" as const, text: "" }, ...messages] : messages}
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
          return renderItem({ item });
        }}
        inverted
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: 16, paddingTop: 8 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListFooterComponent={showEmpty ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Ionicons name="chatbubbles-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Card Advisor</Text>
            <Text style={styles.emptySub}>
              Ask anything about Pokemon TCG cards — whether a deal is fair, if a card is likely to rise in value, how liquid it is, or whether it's worth buying right now. I use real eBay last-sold data.
            </Text>
            <Text style={styles.suggestionsLabel}>Try asking…</Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s, i) => (
                <Pressable
                  key={i}
                  style={({ pressed }) => [styles.suggestionChip, { opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => send(s)}
                >
                  <Text style={styles.suggestionText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      />

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about a card, deal, or investment…"
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={800}
          returnKeyType="default"
        />
        <Pressable
          style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
          onPress={() => send(input)}
          disabled={!input.trim() || loading}
          hitSlop={8}
        >
          <Ionicons name="arrow-up" size={20} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

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
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  headerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 1,
  },

  listContent: {
    paddingHorizontal: 16,
  },

  // User bubble
  userBubbleWrap: {
    alignItems: "flex-end",
    marginVertical: 6,
  },
  userBubble: {
    backgroundColor: Colors.primary,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "82%",
  },
  userText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#fff",
    lineHeight: 21,
  },

  // AI bubble
  aiBubbleWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: 8,
    gap: 10,
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.primary + "40",
    marginTop: 2,
  },
  aiAvatarText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: Colors.primary,
  },
  aiBubble: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderTopLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  aiText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 22,
  },
  loadingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },

  // Cards section inside AI bubble
  cardsSection: { marginTop: 12 },
  cardsDivider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginBottom: 12,
  },
  cardsHeader: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  cardsList: { gap: 8 },

  // Card tile
  cardTile: {
    flexDirection: "row",
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  cardImageWrap: { position: "relative", width: 56, alignItems: "center" },
  cardImage: { width: 56, height: 78, borderRadius: 4 },
  cardImageFallback: {
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  gradePill: {
    position: "absolute",
    bottom: -4,
    left: "50%",
    transform: [{ translateX: -20 }],
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    minWidth: 40,
    alignItems: "center",
  },
  gradePillText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    textAlign: "center",
  },
  cardInfo: { flex: 1, paddingTop: 2, paddingLeft: 2 },
  cardName: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    lineHeight: 18,
  },
  cardSet: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  cardPriceRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 6 },
  cardPrice: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#34D399",
  },
  cardAvg: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  cardNoPrice: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 6,
    fontStyle: "italic",
  },
  cardSales: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 2,
  },
  researchPrices: {
    marginTop: 6,
    gap: 3,
  },
  researchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  researchLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  researchValue: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },

  // Summary box
  summaryBox: {
    marginTop: 12,
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 6,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#34D399",
  },

  // Deal score pill
  scorePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flex: 1,
    justifyContent: "center",
  },
  scoreNum: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  scoreLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },

  // Empty state
  emptyWrap: {
    paddingTop: 40,
    paddingBottom: 20,
    alignItems: "center",
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.primary + "30",
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  suggestionsLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  suggestions: { gap: 8, width: "100%" },
  suggestionChip: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  suggestionText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 18,
  },

  // Input bar
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    backgroundColor: Colors.background,
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
});
