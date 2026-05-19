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
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
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

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  prices?: Prices | null;
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
      <Text style={emptyStyles.title}>PokéBot</Text>
      <Text style={emptyStyles.subtitle}>
        Ask me anything about Pokémon TCG — card values, grading economics, investing, rules, lore, and more.
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

function AssistantBubble({
  msg, isSpeaking, onSpeak, onRetry,
}: {
  msg: Message;
  isSpeaking: boolean;
  onSpeak: () => void;
  onRetry?: () => void;
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
          <Text style={msgStyles.aiText}>{stripMarkdown(msg.text)}</Text>
          {msg.prices && <PricesCard prices={msg.prices} />}
        </View>
        {Platform.OS !== "web" && (
          <Pressable
            onPress={onSpeak}
            style={({ pressed }) => [msgStyles.speakBtn, { opacity: pressed ? 0.6 : 1 }]}
            hitSlop={8}
          >
            <Ionicons
              name={isSpeaking ? "volume-high" : "volume-medium-outline"}
              size={14}
              color={isSpeaking ? Colors.primary : Colors.textMuted}
            />
            <Text style={[msgStyles.speakText, isSpeaking && { color: Colors.primary }]}>
              {isSpeaking ? "Stop" : "Listen"}
            </Text>
          </Pressable>
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
  speakBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5, marginLeft: 4 },
  speakText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textMuted },
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

  const recordingRef = useRef<Audio.Recording | null>(null);
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
    if (loading && Platform.OS !== "web") {
      Speech.stop();
      setSpeakingId(null);
    }
  }, [loading]);

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

    try {
      const url = new URL("/api/pokemon-chat", apiBase);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history: snapshot }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(prev => [{
        id: `a-${Date.now()}`,
        role: "assistant",
        text: data.reply,
        prices: data.prices ?? null,
      }, ...prev]);
    } catch {
      setMessages(prev => [{
        id: `e-${Date.now()}`,
        role: "assistant",
        text: "Couldn't reach the server — tap Retry.",
        isError: true,
        retryText: trimmed,
      }, ...prev]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, apiBase, requireSub]);

  const startRecording = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Microphone needed", "Please allow microphone access in Settings to use voice input.");
      return;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    recordingRef.current = recording;
    setIsRecording(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const url = new URL("/api/pokemon-chat/transcribe", apiBase);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: base64 }),
      });
      if (!res.ok) throw new Error("Transcription failed");
      const { text } = await res.json();
      if (text?.trim()) sendMessage(text.trim());
    } catch (e) {
      console.error("Voice error:", e);
    } finally {
      setIsTranscribing(false);
    }
  };

  const onMicPress = async () => {
    if (!requireSub()) return;
    if (isRecording) await stopAndTranscribe();
    else await startRecording();
  };

  const onSpeakMessage = async (msg: Message) => {
    if (Platform.OS === "web") return;
    const speaking = await Speech.isSpeakingAsync();
    if (speaking) {
      await Speech.stop();
      setSpeakingId(null);
      if (speakingId === msg.id) return;
    }
    setSpeakingId(msg.id);
    Speech.speak(stripMarkdown(msg.text), {
      language: "en-GB",
      rate: 1.0,
      onDone: () => setSpeakingId(null),
      onStopped: () => setSpeakingId(null),
      onError: () => setSpeakingId(null),
    });
  };

  const clearChat = () => {
    if (Platform.OS !== "web") Speech.stop();
    setSpeakingId(null);
    setMessages([]);
    setInput("");
  };

  const isInputBusy = loading || isRecording || isTranscribing;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 12) }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>PokéBot</Text>
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
          renderItem={({ item }) => {
            if (item.id === "typing") return <TypingIndicator />;
            if (item.role === "user") return <UserBubble text={item.text} />;
            return (
              <AssistantBubble
                msg={item}
                isSpeaking={speakingId === item.id}
                onSpeak={() => onSpeakMessage(item)}
                onRetry={item.isError && item.retryText ? () => sendMessage(item.retryText!) : undefined}
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
            placeholder={isRecording ? "" : "Ask anything about Pokémon…"}
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
