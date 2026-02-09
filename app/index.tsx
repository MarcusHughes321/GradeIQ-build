import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Alert,
  Platform,
  Dimensions,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { getGradings, deleteGrading } from "@/lib/storage";
import type { SavedGrading } from "@/lib/types";
import GradeCircle from "@/components/GradeCircle";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const BUBBLE_GAP = 12;
const BUBBLE_HORIZONTAL_PAD = 20;
const BUBBLE_WIDTH = (SCREEN_WIDTH - BUBBLE_HORIZONTAL_PAD * 2 - BUBBLE_GAP) / 2;

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
      style={({ pressed }) => [styles.historyItem, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
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
        <Text style={styles.setInfoText} numberOfLines={1}>
          {item.result.setInfo || "Pokemon Card"}
        </Text>
        <Text style={styles.dateText}>{dateStr}</Text>
      </View>
      <View style={styles.historyGrades}>
        <GradeCircle grade={item.result.psa.grade} size={36} color={Colors.cardPSA} label="PSA" />
        <GradeCircle grade={item.result.beckett.overallGrade} size={36} color={Colors.cardBeckett} label="BGS" />
        <GradeCircle grade={item.result.ace.overallGrade} size={36} color={Colors.cardAce} label="ACE" />
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
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

  const renderHeader = () => (
    <>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image source={require("@/assets/images/icon.png")} style={styles.headerLogo} contentFit="contain" />
          <View>
            <Text style={styles.title}>Grade.<Text style={{ color: Colors.primary }}>IQ</Text></Text>
            <Text style={styles.subtitle}>Pokemon Card Grading</Text>
          </View>
        </View>
      </View>

      <View style={styles.bubblesRow}>
        <Pressable
          style={({ pressed }) => [styles.bubbleButton, styles.bubblePrimary, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}
          onPress={() => router.push("/grade")}
        >
          <LinearGradient
            colors={[Colors.gradientStart, Colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bubbleGradient}
          >
            <View style={styles.bubbleIconCircle}>
              <Ionicons name="camera" size={28} color="#fff" />
            </View>
            <Text style={styles.bubblePrimaryText}>Grade a Card</Text>
            <Text style={styles.bubbleSubtext}>Take photos to analyze</Text>
          </LinearGradient>
        </Pressable>

        <View style={styles.bubbleColumn}>
          <Pressable
            style={({ pressed }) => [styles.bubbleSmall, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}
            onPress={() => router.push("/grade")}
          >
            <View style={styles.bubbleSmallIcon}>
              <Feather name="zap" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.bubbleSmallText}>Quick Scan</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.bubbleSmall, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}
            onPress={() => {}}
          >
            <View style={styles.bubbleSmallIcon}>
              <Ionicons name="stats-chart" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.bubbleSmallText}>{gradings.length} Graded</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Grades</Text>
        {gradings.length > 0 && (
          <Text style={styles.sectionCount}>{gradings.length} cards</Text>
        )}
      </View>
    </>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      {gradings.length === 0 ? (
        <FlatList
          data={[]}
          renderItem={null}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <MaterialCommunityIcons name="card-search" size={40} color={Colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No cards graded yet</Text>
              <Text style={styles.emptyText}>
                Take photos of your Pokemon card to get AI-powered grade estimates
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + webBottomInset + 20 }}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={gradings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <HistoryItem item={item} onDelete={handleDelete} />}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + webBottomInset + 20 }]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={true}
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
    paddingHorizontal: BUBBLE_HORIZONTAL_PAD,
    paddingTop: 16,
    paddingBottom: 20,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: Colors.text,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  bubblesRow: {
    flexDirection: "row",
    paddingHorizontal: BUBBLE_HORIZONTAL_PAD,
    gap: BUBBLE_GAP,
    marginBottom: 28,
  },
  bubbleButton: {
    width: BUBBLE_WIDTH,
    borderRadius: 20,
    overflow: "hidden",
  },
  bubblePrimary: {
    minHeight: 140,
  },
  bubbleGradient: {
    flex: 1,
    padding: 18,
    justifyContent: "space-between",
  },
  bubbleIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  bubblePrimaryText: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: "#fff",
  },
  bubbleSubtext: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },
  bubbleColumn: {
    width: BUBBLE_WIDTH,
    gap: BUBBLE_GAP,
  },
  bubbleSmall: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  bubbleSmallIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,60,49,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleSmallText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: BUBBLE_HORIZONTAL_PAD,
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  sectionCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingTop: 60,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
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
    paddingHorizontal: BUBBLE_HORIZONTAL_PAD,
    gap: 10,
  },
  historyItem: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 14,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  thumbnail: {
    width: 54,
    height: 75,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
  },
  historyInfo: {
    flex: 1,
    gap: 3,
  },
  cardName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  setInfoText: {
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
    gap: 6,
  },
});
