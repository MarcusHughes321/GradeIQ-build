import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminFetchSettings, adminSaveSetting } from "@/lib/admin-auth";
import Colors from "@/constants/colors";

const BULLETIN_STYLES: { key: "info" | "maintenance" | "success"; label: string; color: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "info", label: "Info", color: Colors.primary, icon: "megaphone" },
  { key: "maintenance", label: "Maintenance", color: Colors.warning, icon: "construct" },
  { key: "success", label: "Good news", color: Colors.success, icon: "checkmark-circle" },
];

export default function BulletinEditor() {
  const queryClient = useQueryClient();
  const [bulletinEnabled, setBulletinEnabled] = useState(false);
  const [bulletinTitle, setBulletinTitle] = useState("");
  const [bulletinMessage, setBulletinMessage] = useState("");
  const [bulletinStyle, setBulletinStyle] = useState<"info" | "maintenance" | "success">("info");
  const [bulletinSaving, setBulletinSaving] = useState(false);
  const bulletinSeeded = useRef(false);

  const { data: settingsData } = useQuery<Record<string, string>>({
    queryKey: ["/api/admin/settings"],
    queryFn: adminFetchSettings,
  });

  useEffect(() => {
    if (settingsData && !bulletinSeeded.current) {
      bulletinSeeded.current = true;
      setBulletinEnabled(settingsData["bulletin_enabled"] === "true");
      setBulletinTitle(settingsData["bulletin_title"] ?? "");
      setBulletinMessage(settingsData["bulletin_message"] ?? "");
      const st = settingsData["bulletin_style"];
      if (st === "info" || st === "maintenance" || st === "success") setBulletinStyle(st);
    }
  }, [settingsData]);

  const saveBulletin = async () => {
    if (bulletinEnabled && !bulletinMessage.trim()) {
      Alert.alert("Add a message", "Write a message before publishing the bulletin.");
      return;
    }
    setBulletinSaving(true);
    try {
      await adminSaveSetting("bulletin_enabled", bulletinEnabled ? "true" : "false");
      await adminSaveSetting("bulletin_title", bulletinTitle.trim());
      await adminSaveSetting("bulletin_message", bulletinMessage.trim());
      await adminSaveSetting("bulletin_style", bulletinStyle);
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/bulletin"] });
      Alert.alert(
        "Saved",
        bulletinEnabled
          ? "Your bulletin is now live on the Home screen."
          : "Bulletin saved and hidden from users.",
      );
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to save the bulletin.");
    } finally {
      setBulletinSaving(false);
    }
  };

  const activeBulletinStyle = BULLETIN_STYLES.find((s) => s.key === bulletinStyle) ?? BULLETIN_STYLES[0];

  return (
    <View style={styles.bulletinCard}>
      <View style={styles.bulletinHeaderRow}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.bulletinHeading}>Banner on Home</Text>
          <Text style={styles.bulletinHint}>
            Shows at the top of every user's Home screen until you turn it off.
          </Text>
        </View>
        <Pressable
          onPress={() => setBulletinEnabled((v) => !v)}
          style={[styles.toggle, bulletinEnabled && styles.toggleOn]}
        >
          <View style={[styles.toggleKnob, bulletinEnabled && styles.toggleKnobOn]} />
        </Pressable>
      </View>

      <Text style={styles.bulletinFieldLabel}>Title (optional)</Text>
      <TextInput
        style={styles.bulletinInput}
        value={bulletinTitle}
        onChangeText={setBulletinTitle}
        placeholder="e.g. Scheduled maintenance"
        placeholderTextColor={Colors.textMuted}
        maxLength={60}
      />

      <Text style={styles.bulletinFieldLabel}>Message</Text>
      <TextInput
        style={[styles.bulletinInput, styles.bulletinTextarea]}
        value={bulletinMessage}
        onChangeText={setBulletinMessage}
        placeholder="Write the message users will see…"
        placeholderTextColor={Colors.textMuted}
        multiline
        maxLength={400}
      />

      <Text style={styles.bulletinFieldLabel}>Style</Text>
      <View style={styles.bulletinStyleRow}>
        {BULLETIN_STYLES.map((s) => {
          const active = bulletinStyle === s.key;
          return (
            <Pressable
              key={s.key}
              onPress={() => setBulletinStyle(s.key)}
              style={[styles.stylePill, active && { borderColor: s.color, backgroundColor: s.color + "22" }]}
            >
              <Ionicons name={s.icon} size={14} color={active ? s.color : Colors.textMuted} />
              <Text style={[styles.stylePillTxt, active && { color: s.color }]}>{s.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {!!bulletinMessage.trim() && (
        <>
          <Text style={styles.bulletinFieldLabel}>Preview</Text>
          <View
            style={[
              styles.previewBanner,
              { borderColor: activeBulletinStyle.color + "55", backgroundColor: activeBulletinStyle.color + "14" },
            ]}
          >
            <Ionicons name={activeBulletinStyle.icon} size={18} color={activeBulletinStyle.color} />
            <View style={{ flex: 1 }}>
              {!!bulletinTitle.trim() && <Text style={styles.previewTitle}>{bulletinTitle.trim()}</Text>}
              <Text style={styles.previewMsg}>{bulletinMessage.trim()}</Text>
            </View>
          </View>
        </>
      )}

      <Pressable
        onPress={saveBulletin}
        disabled={bulletinSaving}
        style={[styles.bulletinSaveBtn, bulletinSaving && { opacity: 0.6 }]}
      >
        {bulletinSaving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.bulletinSaveTxt}>{bulletinEnabled ? "Save & publish" : "Save (hidden)"}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bulletinCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 16,
    gap: 10,
  },
  bulletinHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  bulletinHeading: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  bulletinHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
    lineHeight: 17,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceBorder,
    padding: 3,
    justifyContent: "center",
  },
  toggleOn: {
    backgroundColor: Colors.primary,
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
  },
  toggleKnobOn: {
    alignSelf: "flex-end",
  },
  bulletinFieldLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  bulletinInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  bulletinTextarea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  bulletinStyleRow: {
    flexDirection: "row",
    gap: 8,
  },
  stylePill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.background,
  },
  stylePillTxt: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.textMuted,
  },
  previewBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  previewTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 2,
  },
  previewMsg: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textSecondary,
  },
  bulletinSaveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  bulletinSaveTxt: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#fff",
  },
});
