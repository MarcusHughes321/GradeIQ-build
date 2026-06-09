import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  Platform,
  Alert,
  Animated,
  ScrollView,
  KeyboardAvoidingView,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useSubscription } from "@/lib/subscription";

// ── Types ─────────────────────────────────────────────────────────────────────

type Prices = {
  psa10: number | null;
  psa9:  number | null;
  bgs95: number | null;
  ace10: number | null;
  tag10: number | null;
  cgc10: number | null;
  raw:   number | null;
  allGrades?: any;
};

type CardResult = {
  cardId: string;
  cardName: string;
  setName: string;
  number: string;
  imageUrl: string | null;
  priceUsd: number | null;
  lang?: string;
};

type Segment = { type: "text"; text: string } | { type: "card"; cardIndex: number };

type DealSideCard = { cardName: string; setName: string; imageUrl: string | null; value: number | null };
type DealVerdict = {
  gave: { cards: DealSideCard[]; total: number };
  received: { cards: DealSideCard[]; total: number };
  net: number;
  verdict: "good" | "fair" | "bad" | "incomplete";
  complete: boolean;
};
type ProfitBreakdown = {
  cardName: string;
  raw: number | null;
  gradedLabel: string;
  gradedValue: number;
  fee: number;
  net: number | null;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  prices?: Prices | null;
  cards?: CardResult[] | null;
  segments?: Segment[] | null;
  options?: CardResult[] | null;
  needsSelection?: boolean;
  deal?: DealVerdict | null;
  profit?: ProfitBreakdown | null;
  isError?: boolean;
  retryText?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "What's a PSA 10 Base Set Charizard worth?",
  "Is the Umbreon VMAX Alt Art worth grading?",
  "What makes a card grade a PSA 10?",
  "Best Pokemon cards to invest in right now?",
  "How does BGS grading differ from PSA?",
  "Tell me about the Pikachu Illustrator",
  "What are the strongest cards in competitive play?",
  "Japanese vs English cards — which grades better?",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "• ")
    .trim();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyState({ onSuggestion }: { onSuggestion: (s: string) => void }) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={emptyStyles.container}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={emptyStyles.avatarWrap}>
        <View style={emptyStyles.avatar}>
          <Text style={emptyStyles.avatarEmoji}>⚡</Text>
        </View>
      </View>
      <Text style={emptyStyles.title}>TCG Advisor</Text>
      <Text style={emptyStyles.subtitle}>
        Ask me anything about Pokémon TCG — card values, grading economics, investing, sets, and more.
      </Text>
      <Text style={emptyStyles.suggestLabel}>Try asking…</Text>
      <View style={emptyStyles.chips}>
        {SUGGESTIONS.map((s, i) => (
          <Pressable
            key={i}
            style={({ pressed }) => [emptyStyles.chip, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => onSuggestion(s)}
          >
            <Text style={emptyStyles.chipText}>{s}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    alignItems: "center",
  },
  avatarWrap: { marginBottom: 16 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary + "20",
    borderWidth: 2,
    borderColor: Colors.primary + "40",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEmoji: { fontSize: 32 },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: Colors.text,
    marginBottom: 10,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 28,
    maxWidth: 300,
  },
  suggestLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  chips: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
});

function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600),
        ])
      );
    const a1 = anim(dot1, 0);
    const a2 = anim(dot2, 200);
    const a3 = anim(dot3, 400);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  const dotStyle = (dot: Animated.Value) => ({
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: Colors.textMuted,
    opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
  });

  return (
    <View style={msgStyles.aiBubbleWrap}>
      <BotAvatar />
      <View style={[msgStyles.aiBubble, { paddingVertical: 14 }]}>
        <View style={{ flexDirection: "row", gap: 5, alignItems: "center" }}>
          <Animated.View style={dotStyle(dot1)} />
          <Animated.View style={dotStyle(dot2)} />
          <Animated.View style={dotStyle(dot3)} />
        </View>
      </View>
    </View>
  );
}

function BotAvatar() {
  return (
    <View style={msgStyles.botAvatar}>
      <Text style={msgStyles.botAvatarText}>⚡</Text>
    </View>
  );
}

function CardThumb({ card, style, onPress }: { card: CardResult; style?: object; onPress?: () => void }) {
  const { Image } = require("expo-image");
  return (
    <Pressable
      style={({ pressed }) => [cardRowStyles.thumb, style, { opacity: pressed ? 0.7 : 1 }]}
      onPress={onPress ? onPress : () =>
        router.push({
          pathname: "/card-profit",
          params: {
            cardId: card.cardId,
            cardName: card.cardName,
            setName: card.setName,
            imageUrl: card.imageUrl || "",
            rawPriceUSD: card.priceUsd ? String(card.priceUsd) : "0",
            ...(card.number ? { cardNumber: card.number } : {}),
            ...(card.lang ? { lang: card.lang } : {}),
          },
        })
      }
    >
      {card.imageUrl ? (
        <Image
          source={{ uri: card.imageUrl }}
          style={cardRowStyles.cardImage}
          contentFit="contain"
          transition={200}
        />
      ) : (
        <View style={[cardRowStyles.cardImage, cardRowStyles.cardImagePlaceholder]}>
          <Ionicons name="image-outline" size={18} color={Colors.textMuted} />
        </View>
      )}
      <Text style={cardRowStyles.cardName} numberOfLines={2}>{card.cardName}</Text>
      <Text style={cardRowStyles.cardSet} numberOfLines={1}>{card.setName}</Text>
    </Pressable>
  );
}

function CardRow({ cards }: { cards: CardResult[] }) {
  if (cards.length === 0) return null;
  return (
    <View style={cardRowStyles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={cardRowStyles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {cards.map(c => <CardThumb key={c.cardId} card={c} />)}
      </ScrollView>
    </View>
  );
}

function CardPicker({ options, onSelect, disabled }: { options: CardResult[]; onSelect: (card: CardResult) => void; disabled?: boolean }) {
  if (options.length === 0) return null;
  return (
    <View style={pickerStyles.grid}>
      {options.map(c => (
        <View key={c.cardId} style={pickerStyles.cell}>
          <CardThumb card={c} style={pickerStyles.thumb} onPress={disabled ? () => {} : () => onSelect(c)} />
          <View style={pickerStyles.tapHint}>
            <Ionicons name="hand-left-outline" size={11} color={Colors.primary} />
            <Text style={pickerStyles.tapHintText}>Tap</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 12 },
  cell: { alignItems: "center", gap: 4 },
  thumb: { width: 86 },
  tapHint: { flexDirection: "row", alignItems: "center", gap: 3 },
  tapHintText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: Colors.primary },
});

const inlineCardStyles = StyleSheet.create({
  wrap: {
    alignItems: "flex-start",
    marginVertical: 6,
  },
  thumb: {
    width: 72,
  },
});

const cardRowStyles = StyleSheet.create({
  container: {
    marginTop: 12,
    marginHorizontal: -14,
  },
  scroll: {
    paddingHorizontal: 14,
    gap: 10,
  },
  thumb: {
    width: 80,
    alignItems: "center",
  },
  cardImage: {
    width: 80,
    height: 112,
    borderRadius: 6,
  },
  cardImagePlaceholder: {
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  cardName: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.text,
    textAlign: "center",
    marginTop: 5,
    lineHeight: 13,
  },
  cardSet: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 2,
  },
});

function PricesCard({ prices }: { prices: Prices }) {
  const rows = [
    { label: "PSA 10",  value: prices.psa10,  highlight: true },
    { label: "PSA 9",   value: prices.psa9,   highlight: false },
    { label: "BGS 9.5", value: prices.bgs95,  highlight: false },
    { label: "ACE 10",  value: prices.ace10,  highlight: false },
    { label: "TAG 10",  value: prices.tag10,  highlight: false },
    { label: "CGC 10",  value: prices.cgc10,  highlight: false },
    { label: "Raw eBay",value: prices.raw,    highlight: false },
  ].filter(r => r.value != null && r.value > 0);

  if (rows.length === 0) return null;

  return (
    <View style={priceStyles.card}>
      <Text style={priceStyles.title}>Market prices</Text>
      {rows.map(r => (
        <View key={r.label} style={priceStyles.row}>
          <Text style={priceStyles.label}>{r.label}</Text>
          <Text style={[priceStyles.value, r.highlight && { color: "#34D399" }]}>
            £{r.value!.toFixed(0)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const priceStyles = StyleSheet.create({
  card: {
    marginTop: 10,
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  label: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  value: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
});

function DealSideColumn({ title, cards, total }: { title: string; cards: DealSideCard[]; total: number }) {
  const { Image } = require("expo-image");
  return (
    <View style={dealStyles.col}>
      <Text style={dealStyles.colTitle}>{title}</Text>
      {cards.map((c, i) => (
        <View key={i} style={dealStyles.dealCard}>
          {c.imageUrl ? (
            <Image source={{ uri: c.imageUrl }} style={dealStyles.dealThumb} contentFit="cover" />
          ) : (
            <View style={[dealStyles.dealThumb, dealStyles.dealThumbPlaceholder]}>
              <Ionicons name="image-outline" size={14} color={Colors.textMuted} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={dealStyles.dealName} numberOfLines={2}>{c.cardName}</Text>
            <Text style={dealStyles.dealValue}>{c.value != null ? `£${c.value.toFixed(0)}` : "—"}</Text>
          </View>
        </View>
      ))}
      <Text style={dealStyles.colTotal}>£{total.toFixed(0)}</Text>
    </View>
  );
}

function DealCard({ deal }: { deal: DealVerdict }) {
  const VERDICT: Record<DealVerdict["verdict"], { label: string; color: string; bg: string }> = {
    good: { label: "Good deal", color: Colors.success, bg: "rgba(16,185,129,0.12)" },
    fair: { label: "Fair trade", color: Colors.warning, bg: "rgba(245,158,11,0.12)" },
    bad: { label: "Bad deal", color: Colors.primary, bg: "rgba(255,60,49,0.12)" },
    incomplete: { label: "Can't fully price", color: Colors.textMuted, bg: Colors.surface },
  };
  const v = VERDICT[deal.verdict];
  const netPositive = deal.net >= 0;
  return (
    <View style={dealStyles.card}>
      <View style={dealStyles.columns}>
        <DealSideColumn title="You gave" cards={deal.gave.cards} total={deal.gave.total} />
        <View style={dealStyles.swap}>
          <Ionicons name="swap-horizontal" size={18} color={Colors.textMuted} />
        </View>
        <DealSideColumn title="You got" cards={deal.received.cards} total={deal.received.total} />
      </View>
      <View style={dealStyles.footer}>
        <View style={[dealStyles.badge, { backgroundColor: v.bg }]}>
          <Text style={[dealStyles.badgeText, { color: v.color }]}>{v.label}</Text>
        </View>
        {deal.complete && (
          <Text style={[dealStyles.net, { color: netPositive ? Colors.success : Colors.primary }]}>
            {netPositive ? "+" : "−"}£{Math.abs(deal.net).toFixed(0)}
          </Text>
        )}
      </View>
    </View>
  );
}

const dealStyles = StyleSheet.create({
  card: { marginTop: 10, backgroundColor: Colors.background, borderRadius: 10, padding: 12 },
  columns: { flexDirection: "row", alignItems: "flex-start" },
  col: { flex: 1, gap: 6 },
  colTitle: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  swap: { paddingHorizontal: 8, paddingTop: 24 },
  dealCard: { flexDirection: "row", gap: 6, alignItems: "center" },
  dealThumb: { width: 34, height: 48, borderRadius: 4, backgroundColor: Colors.surface },
  dealThumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  dealName: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.text, lineHeight: 14 },
  dealValue: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  colTotal: { fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.text, marginTop: 2 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  net: { fontFamily: "Inter_700Bold", fontSize: 18 },
});

function ProfitCard({ profit }: { profit: ProfitBreakdown }) {
  const netPositive = profit.net != null && profit.net >= 0;
  return (
    <View style={profitStyles.card}>
      <Text style={profitStyles.title}>{profit.cardName} · {profit.gradedLabel}</Text>
      <View style={profitStyles.row}>
        <Text style={profitStyles.label}>Raw cost</Text>
        <Text style={profitStyles.value}>{profit.raw != null ? `£${profit.raw.toFixed(0)}` : "—"}</Text>
      </View>
      <View style={profitStyles.row}>
        <Text style={profitStyles.label}>Grading fee</Text>
        <Text style={profitStyles.value}>−£{profit.fee.toFixed(0)}</Text>
      </View>
      <View style={profitStyles.row}>
        <Text style={profitStyles.label}>{profit.gradedLabel} value</Text>
        <Text style={profitStyles.value}>£{profit.gradedValue.toFixed(0)}</Text>
      </View>
      <View style={profitStyles.divider} />
      <View style={profitStyles.row}>
        <Text style={profitStyles.netLabel}>Net profit</Text>
        <Text style={[profitStyles.netValue, { color: profit.net == null ? Colors.textMuted : netPositive ? Colors.success : Colors.primary }]}>
          {profit.net == null ? "—" : `${netPositive ? "+" : "−"}£${Math.abs(profit.net).toFixed(0)}`}
        </Text>
      </View>
    </View>
  );
}

const profitStyles = StyleSheet.create({
  card: { marginTop: 10, backgroundColor: Colors.background, borderRadius: 10, padding: 12, gap: 7 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  value: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  divider: { height: 1, backgroundColor: Colors.surfaceBorder, marginVertical: 2 },
  netLabel: { fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.text },
  netValue: { fontFamily: "Inter_700Bold", fontSize: 18 },
});

function AssistantBubble({
  msg, isSpeaking, isPaused, isTtsLoading, onSpeak, onPauseResume, onStop, onRetry, onSelectCard, selectionDisabled,
}: {
  msg: Message;
  isSpeaking: boolean;
  isPaused: boolean;
  isTtsLoading: boolean;
  onSpeak: () => void;
  onPauseResume: () => void;
  onStop: () => void;
  onRetry?: () => void;
  onSelectCard?: (card: CardResult) => void;
  selectionDisabled?: boolean;
}) {
  if (msg.isError) {
    return (
      <View style={msgStyles.aiBubbleWrap}>
        <BotAvatar />
        <View style={[msgStyles.aiBubble, msgStyles.errorBubble]}>
          <Text style={msgStyles.errorText}>{msg.text}</Text>
          {onRetry && (
            <Pressable onPress={onRetry} style={({ pressed }) => [msgStyles.retryBtn, { opacity: pressed ? 0.7 : 1 }]}>
              <Ionicons name="refresh" size={13} color={Colors.primary} />
              <Text style={msgStyles.retryText}>Retry</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={msgStyles.aiBubbleWrap}>
      <BotAvatar />
      <View style={{ flex: 1 }}>
        <View style={msgStyles.aiBubble}>
          {msg.needsSelection && msg.options && msg.options.length > 0 ? (
            <>
              <Text style={msgStyles.aiText}>{stripMarkdown(msg.text)}</Text>
              <CardPicker options={msg.options} onSelect={onSelectCard ?? (() => {})} disabled={selectionDisabled} />
            </>
          ) : msg.segments && msg.segments.length > 0 ? (
            <>
              {msg.segments.map((seg, i) => {
                if (seg.type === "text") {
                  return <Text key={i} style={msgStyles.aiText}>{stripMarkdown(seg.text)}</Text>;
                }
                const card = msg.cards?.[seg.cardIndex];
                return card ? (
                  <View key={i} style={inlineCardStyles.wrap}>
                    <CardThumb card={card} style={inlineCardStyles.thumb} />
                  </View>
                ) : null;
              })}
            </>
          ) : (
            <>
              <Text style={msgStyles.aiText}>{stripMarkdown(msg.text)}</Text>
              {msg.cards && msg.cards.length > 0 && <CardRow cards={msg.cards} />}
            </>
          )}
          {!msg.needsSelection && msg.deal && <DealCard deal={msg.deal} />}
          {!msg.needsSelection && msg.profit && <ProfitCard profit={msg.profit} />}
          {!msg.needsSelection && msg.prices && <PricesCard prices={msg.prices} />}
        </View>
        {Platform.OS !== "web" && (
          isSpeaking ? (
            <View style={msgStyles.speakControls}>
              {isTtsLoading ? (
                <>
                  <ActivityIndicator size="small" color={Colors.primary} style={{ transform: [{ scale: 0.7 }] }} />
                  <Text style={[msgStyles.speakText, { color: Colors.primary }]}>Generating…</Text>
                </>
              ) : (
                <>
                  <Pressable
                    onPress={onPauseResume}
                    style={({ pressed }) => [msgStyles.speakBtn, { opacity: pressed ? 0.6 : 1 }]}
                    hitSlop={8}
                  >
                    <Ionicons name={isPaused ? "play" : "pause"} size={14} color={Colors.primary} />
                    <Text style={[msgStyles.speakText, { color: Colors.primary }]}>
                      {isPaused ? "Resume" : "Pause"}
                    </Text>
                  </Pressable>
                  <Text style={msgStyles.speakDivider}>·</Text>
                  <Pressable
                    onPress={onStop}
                    style={({ pressed }) => [msgStyles.speakBtn, { opacity: pressed ? 0.6 : 1 }]}
                    hitSlop={8}
                  >
                    <Ionicons name="stop-circle-outline" size={14} color={Colors.textMuted} />
                    <Text style={msgStyles.speakText}>Stop</Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : (
            <Pressable
              onPress={onSpeak}
              style={({ pressed }) => [msgStyles.speakBtn, { opacity: pressed ? 0.6 : 1 }]}
              hitSlop={8}
            >
              <Ionicons name="volume-medium-outline" size={14} color={Colors.textMuted} />
              <Text style={msgStyles.speakText}>Listen</Text>
            </Pressable>
          )
        )}
      </View>
    </View>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <View style={msgStyles.userBubbleWrap}>
      <View style={msgStyles.userBubble}>
        <Text style={msgStyles.userText}>{text}</Text>
      </View>
    </View>
  );
}

const msgStyles = StyleSheet.create({
  aiBubbleWrap: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 16 },
  botAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.primary + "20",
    borderWidth: 1, borderColor: Colors.primary + "40",
    alignItems: "center", justifyContent: "center",
    marginTop: 2, flexShrink: 0,
  },
  botAvatarText: { fontSize: 14 },
  aiBubble: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderTopLeftRadius: 4,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  errorBubble: { borderColor: "#3a1a1a" },
  aiText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text, lineHeight: 22 },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, color: "#ff8080", lineHeight: 22 },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  retryText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.primary },
  speakControls: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 5, marginLeft: 4 },
  speakBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5, marginLeft: 4 },
  speakText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted },
  speakDivider: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted, marginHorizontal: 4 },
  userBubbleWrap: { alignItems: "flex-end", marginBottom: 16 },
  userBubble: {
    maxWidth: "80%",
    backgroundColor: Colors.primary,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    padding: 14,
  },
  userText: { fontFamily: "Inter_400Regular", fontSize: 14, color: "#fff", lineHeight: 22 },
});

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function PokeBotScreen() {
  const insets = useSafeAreaInsets();
  const { isSubscribed, isAdminMode } = useSubscription();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isTtsLoading, setIsTtsLoading] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const inputRef = useRef<TextInput>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const apiBase = getApiUrl();
  const isEmpty = messages.length === 0 && !loading;

  const requireSub = useCallback((): boolean => {
    if (!isAdminMode && !isSubscribed) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      router.push("/paywall");
      return false;
    }
    return true;
  }, [isSubscribed, isAdminMode]);

  // Pulse animation when recording
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  // Stop TTS when a new message starts loading
  useEffect(() => {
    if (loading) stopSound();
  }, [loading]);

  // Stop TTS when navigating away from this screen
  useFocusEffect(
    useCallback(() => {
      return () => { stopSound(); };
    }, [])
  );

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    if (!requireSub()) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput("");

    const snapshot = messages
      .slice(0, 10)
      .reverse()
      .map(m => ({ role: m.role, content: m.text }));

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", text: trimmed };
    setMessages(prev => [userMsg, ...prev]);
    setLoading(true);

    // Use XMLHttpRequest — expo/fetch returns 404 for plain JSON POSTs on physical devices
    const url = new URL("/api/pokemon-chat", apiBase);
    new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url.toString());
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            setMessages(prev => [{
              id: `a-${Date.now()}`,
              role: "assistant",
              text: data.reply,
              prices: data.prices ?? null,
              cards: Array.isArray(data.cards) && data.cards.length > 0 ? data.cards : null,
              segments: Array.isArray(data.segments) && data.segments.length > 0 ? data.segments : null,
              options: Array.isArray(data.options) && data.options.length > 0 ? data.options : null,
              needsSelection: !!data.needsSelection,
              deal: data.deal ?? null,
              profit: data.profit ?? null,
            }, ...prev]);
          } catch {
            setMessages(prev => [{
              id: `e-${Date.now()}`,
              role: "assistant",
              text: "Couldn't reach the server — tap Retry.",
              isError: true,
              retryText: trimmed,
            }, ...prev]);
          }
        } else {
          setMessages(prev => [{
            id: `e-${Date.now()}`,
            role: "assistant",
            text: "Couldn't reach the server — tap Retry.",
            isError: true,
            retryText: trimmed,
          }, ...prev]);
        }
        setLoading(false);
        resolve();
      };
      xhr.onerror = () => {
        setMessages(prev => [{
          id: `e-${Date.now()}`,
          role: "assistant",
          text: "Couldn't reach the server — tap Retry.",
          isError: true,
          retryText: trimmed,
        }, ...prev]);
        setLoading(false);
        resolve();
      };
      xhr.send(JSON.stringify({ message: trimmed, history: snapshot }));
    });
  }, [loading, messages, apiBase, requireSub]);

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Microphone access needed",
          "Please enable microphone access for this app in your device Settings to use voice input.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      console.error("startRecording error:", e);
      Alert.alert("Microphone error", "Could not start recording. Please check microphone permissions in Settings.");
    }
  };

  const stopAndTranscribe = async () => {
    if (!recordingRef.current) return;
    setIsRecording(false);
    setIsTranscribing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      if (!uri) throw new Error("No recording URI");

      // Use XMLHttpRequest — React Native supports file:// URIs in FormData natively.
      // expo/fetch does NOT support object-style FormData parts, so we bypass it here.
      const url = new URL("/api/pokemon-chat/transcribe", apiBase);
      const transcribedText = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url.toString());
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText).text ?? ""); }
            catch { reject(new Error("Bad response")); }
          } else {
            reject(new Error(`Server error ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        const formData = new FormData();
        formData.append("audio", { uri, name: "voice.m4a", type: "audio/m4a" } as any);
        xhr.send(formData);
      });

      // Put transcribed text into the input box so the user can see, edit, and send it
      // — same behaviour as Claude's voice input.
      if (transcribedText.trim()) {
        setInput(transcribedText.trim());
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    } catch (e) {
      console.error("Voice error:", e);
      Alert.alert("Voice error", "Could not transcribe audio. Please try again.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const onMicPress = async () => {
    if (!requireSub()) return;
    if (isRecording) await stopAndTranscribe();
    else await startRecording();
  };

  const stopSound = async () => {
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }
    setSpeakingId(null);
    setIsPaused(false);
    setIsTtsLoading(false);
  };

  const pauseResumeSound = async () => {
    if (!soundRef.current) return;
    try {
      if (isPaused) {
        await soundRef.current.playAsync();
        setIsPaused(false);
      } else {
        await soundRef.current.pauseAsync();
        setIsPaused(true);
      }
    } catch {}
  };

  const onSpeakMessage = async (msg: Message) => {
    if (Platform.OS === "web") return;
    // Tap again to stop
    if (speakingId === msg.id) { await stopSound(); return; }
    await stopSound();
    setSpeakingId(msg.id);
    setIsTtsLoading(true);
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const text = stripMarkdown(msg.text).slice(0, 600);

      // POST via XHR (expo/fetch streaming variant causes 404 for plain JSON POSTs)
      const url = new URL("/api/pokemon-chat/tts", apiBase);
      const { audio: b64, format } = await new Promise<{ audio: string; format: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url.toString());
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); }
            catch { reject(new Error("Bad TTS response")); }
          } else {
            reject(new Error(`TTS request failed: ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error("TTS network error"));
        xhr.send(JSON.stringify({ text, voice: "nova" }));
      });

      const cacheUri = `${FileSystem.cacheDirectory}tts_audio.${format}`;
      await FileSystem.writeAsStringAsync(cacheUri, b64, { encoding: "base64" as any });

      setIsTtsLoading(false);
      const { sound } = await Audio.Sound.createAsync(
        { uri: cacheUri },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if ((status as any).didJustFinish) {
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
          setSpeakingId(null);
        }
      });
    } catch (e) {
      console.error("TTS error:", e);
      setSpeakingId(null);
      setIsPaused(false);
      setIsTtsLoading(false);
    }
  };

  const clearChat = () => {
    stopSound();
    setSpeakingId(null);
    setMessages([]);
    setInput("");
  };

  const isInputBusy = loading || isRecording || isTranscribing;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 12) }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>TCG Advisor</Text>
          <View style={styles.headerOnline}>
            <View style={styles.onlineDot} />
            <Text style={styles.headerSub}>Pokémon TCG Expert</Text>
          </View>
        </View>
        {messages.length > 0 ? (
          <Pressable onPress={clearChat} style={styles.headerBtn} hitSlop={12}>
            <Ionicons name="trash-outline" size={20} color={Colors.textMuted} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* ── Empty state ── */}
      {isEmpty && <EmptyState onSuggestion={sendMessage} />}

      {/* ── Chat list ── */}
      {!isEmpty && (
        <FlatList
          data={loading
            ? [{ id: "typing", role: "assistant" as const, text: "" }, ...messages]
            : messages
          }
          keyExtractor={item => item.id}
          renderItem={({ item, index }) => {
            if (item.id === "typing") return <TypingIndicator />;
            if (item.role === "user") return <UserBubble text={item.text} />;
            return (
              <AssistantBubble
                msg={item}
                isSpeaking={speakingId === item.id}
                isPaused={isPaused}
                isTtsLoading={isTtsLoading}
                onSpeak={() => onSpeakMessage(item)}
                onPauseResume={pauseResumeSound}
                onStop={stopSound}
                onRetry={item.isError && item.retryText ? () => sendMessage(item.retryText!) : undefined}
                onSelectCard={(card) => sendMessage(`${card.cardName}${card.number ? ` #${card.number}` : ""} from ${card.setName}`)}
                selectionDisabled={loading || index > 0}
              />
            );
          }}
          inverted
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Input bar ── */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 8) }]}>
        {(isRecording || isTranscribing) && (
          <View style={styles.recordingRow}>
            <Animated.View style={[styles.recordingDot, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={styles.recordingText}>
              {isRecording ? "Listening… tap mic to send" : "Transcribing…"}
            </Text>
          </View>
        )}
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={[styles.input, isInputBusy && styles.inputFaded]}
            value={isRecording || isTranscribing ? "" : input}
            onChangeText={setInput}
            placeholder={
              isRecording ? "Listening…" :
              isTranscribing ? "Transcribing…" :
              "Ask about any Pokémon TCG topic…"
            }
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={600}
            editable={!isInputBusy}
          />

          {/* Mic – native only */}
          {Platform.OS !== "web" && (
            <Pressable
              style={[styles.iconBtn, isRecording && styles.iconBtnRecording]}
              onPress={onMicPress}
              disabled={isTranscribing || loading}
              hitSlop={8}
            >
              <Animated.View style={{ transform: [{ scale: isRecording ? pulseAnim : new Animated.Value(1) }] }}>
                <Ionicons
                  name={isRecording ? "stop" : "mic-outline"}
                  size={20}
                  color={isRecording ? "#fff" : Colors.textSecondary}
                />
              </Animated.View>
            </Pressable>
          )}

          {/* Send */}
          <Pressable
            style={[styles.sendBtn, (!input.trim() || isInputBusy) && styles.sendBtnOff]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || isInputBusy}
            hitSlop={8}
          >
            {loading || isTranscribing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="arrow-up" size={20} color="#fff" />
            }
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 17, color: Colors.text },
  headerOnline: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted },

  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },

  inputBar: {
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    backgroundColor: Colors.background,
    paddingTop: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  recordingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 2,
  },
  recordingDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  recordingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.primary,
  },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    maxHeight: 120,
    minHeight: 42,
  },
  inputFaded: { opacity: 0.4 },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    alignItems: "center", justifyContent: "center",
  },
  iconBtnRecording: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  sendBtnOff: { backgroundColor: Colors.surfaceBorder },
});
