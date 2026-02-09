import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Alert,
  Platform,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { getGradings, deleteGrading } from "@/lib/storage";
import type { SavedGrading } from "@/lib/types";
import GradeCircle from "@/components/GradeCircle";

function HistoryItem({ item, onDelete }: { item: SavedGrading; onDelete: (id: string) => void }) {
  const date = new Date(item.timestamp);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const handleLongPress = () => {
    if (Platform.OS === "web") {
      if (confirm("Delete this grading?")) {
        onDelete(item.id);
      }
    } else {
      Alert.alert("Delete Grading", "Are you sure you want to delete this grading?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onDelete(item.id) },
      ]);
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.historyItem, { opacity: pressed ? 0.8 : 1 }]}
      onPress={() =>
        router.push({
          pathname: "/results",
          params: { gradingId: item.id },
        })
      }
      onLongPress={handleLongPress}
    >
      <Image source={{ uri: item.frontImage }} style={styles.thumbnail} contentFit="cover" />
      <View style={styles.historyInfo}>
        <Text style={styles.cardName} numberOfLines={1}>
          {item.result.cardName || "Unknown Card"}
        </Text>
        <Text style={styles.setInfo} numberOfLines={1}>
          {item.result.setInfo || "Pokemon Card"}
        </Text>
        <Text style={styles.dateText}>{dateStr}</Text>
      </View>
      <View style={styles.historyGrades}>
        <GradeCircle grade={item.result.psa.grade} size={36} color={Colors.cardPSA} label="PSA" />
        <GradeCircle grade={item.result.beckett.overallGrade} size={36} color={Colors.cardBeckett} label="BGS" />
        <GradeCircle grade={item.result.ace.overallGrade} size={36} color={Colors.cardAce} label="ACE" />
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [gradings, setGradings] = useState<SavedGrading[]>([]);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  useFocusEffect(
    useCallback(() => {
      loadGradings();
    }, [])
  );

  const loadGradings = async () => {
    const data = await getGradings();
    setGradings(data);
  };

  const handleDelete = async (id: string) => {
    await deleteGrading(id);
    loadGradings();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>CardGrade AI</Text>
          <Text style={styles.subtitle}>Pokemon Card Grading</Text>
        </View>
        <MaterialCommunityIcons name="cards" size={28} color={Colors.primary} />
      </View>

      <Pressable
        style={({ pressed }) => [styles.gradeButton, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
        onPress={() => router.push("/grade")}
      >
        <LinearGradient
          colors={[Colors.gradientStart, Colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientButton}
        >
          <Ionicons name="camera" size={22} color="#fff" />
          <Text style={styles.gradeButtonText}>Grade a Card</Text>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
        </LinearGradient>
      </Pressable>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>History</Text>
        <Text style={styles.sectionCount}>{gradings.length} cards</Text>
      </View>

      {gradings.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="card-search" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No cards graded yet</Text>
          <Text style={styles.emptyText}>
            Take photos of your Pokemon card to get AI-powered grade estimates
          </Text>
        </View>
      ) : (
        <FlatList
          data={gradings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <HistoryItem item={item} onDelete={handleDelete} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + webBottomInset + 20 }]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={gradings.length > 0}
        />
      )}
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: Colors.text,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  gradeButton: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 16,
    overflow: "hidden",
  },
  gradientButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 10,
  },
  gradeButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: "#fff",
    flex: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: Colors.text,
  },
  sectionCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: Colors.textSecondary,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  historyItem: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 12,
  },
  thumbnail: {
    width: 52,
    height: 72,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
  },
  historyInfo: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  setInfo: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  dateText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  historyGrades: {
    flexDirection: "row",
    gap: 8,
  },
});
