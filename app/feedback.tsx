import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, TextInput, Linking, Alert, KeyboardAvoidingView } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const FEEDBACK_TYPES = [
  { id: "suggestion", label: "Suggestion", icon: "bulb-outline" as const, color: "#F59E0B" },
  { id: "bug", label: "Bug Report", icon: "bug-outline" as const, color: Colors.primary },
  { id: "accuracy", label: "Grading Accuracy", icon: "analytics-outline" as const, color: "#60A5FA" },
  { id: "other", label: "Other", icon: "chatbubble-outline" as const, color: "#10B981" },
];

const FEEDBACK_EMAIL = "marceus.tcg@hotmail.com";

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const handleSubmit = () => {
    if (!selectedType || !message.trim()) return;

    const typeLabel = FEEDBACK_TYPES.find(t => t.id === selectedType)?.label || "Feedback";
    const subject = encodeURIComponent(`Grade.IQ Feedback: ${typeLabel}`);
    const body = encodeURIComponent(`Type: ${typeLabel}\n\n${message.trim()}\n\n---\nSent from Grade.IQ app`);
    const mailto = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;

    Linking.openURL(mailto).catch(() => {
      if (Platform.OS === "web") {
        alert("Unable to open email client. You can send feedback directly to " + FEEDBACK_EMAIL);
      } else {
        Alert.alert("Email Not Available", "You can send feedback directly to " + FEEDBACK_EMAIL);
      }
    });
  };

  const canSubmit = selectedType && message.trim().length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Send Feedback</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: insets.bottom + webBottomInset + 120 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
        >
          <View style={styles.introSection}>
            <Text style={styles.introTitle}>We'd love to hear from you</Text>
            <Text style={styles.introBody}>
              Your feedback helps make Grade.IQ better for the whole community. Whether it's a feature idea, a bug you've found, or thoughts on grading accuracy — we want to know.
            </Text>
          </View>

          <Text style={styles.label}>What's this about?</Text>
          <View style={styles.typesGrid}>
            {FEEDBACK_TYPES.map((type) => (
              <Pressable
                key={type.id}
                onPress={() => setSelectedType(type.id)}
                style={[
                  styles.typeCard,
                  selectedType === type.id && styles.typeCardSelected,
                  selectedType === type.id && { borderColor: type.color },
                ]}
              >
                <Ionicons
                  name={type.icon}
                  size={22}
                  color={selectedType === type.id ? type.color : Colors.textMuted}
                />
                <Text style={[
                  styles.typeLabel,
                  selectedType === type.id && { color: Colors.text },
                ]}>
                  {type.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Your message</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textArea}
              placeholder="Tell us what's on your mind..."
              placeholderTextColor={Colors.textMuted}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              maxLength={2000}
            />
            <Text style={styles.charCount}>{message.length} / 2000</Text>
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.submitBtn,
              !canSubmit && styles.submitBtnDisabled,
              { opacity: pressed && canSubmit ? 0.85 : 1 },
            ]}
          >
            <Ionicons name="send" size={18} color={canSubmit ? "#fff" : Colors.textMuted} />
            <Text style={[styles.submitText, !canSubmit && styles.submitTextDisabled]}>
              Send Feedback
            </Text>
          </Pressable>

          <Text style={styles.note}>
            This will open your email app with your feedback pre-filled. You can also reach us directly on Instagram @marceus.tcg
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
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
  },
  introSection: {
    paddingVertical: 20,
    gap: 10,
  },
  introTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  introBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 21,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 12,
    marginTop: 8,
  },
  typesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 24,
  },
  typeCard: {
    width: "48%" as any,
    flexGrow: 1,
    flexBasis: "45%" as any,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  typeCardSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  typeLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textMuted,
  },
  inputContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 24,
  },
  textArea: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    padding: 16,
    minHeight: 140,
    lineHeight: 21,
  },
  charCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "right",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
  },
  submitBtnDisabled: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  submitText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#fff",
  },
  submitTextDisabled: {
    color: Colors.textMuted,
  },
  note: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 16,
    paddingHorizontal: 12,
  },
});
