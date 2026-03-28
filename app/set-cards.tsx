import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";

const COLUMNS = 3;
const SCREEN_WIDTH = Dimensions.get("window").width;
const GUTTER = 12;
const CARD_WIDTH = (SCREEN_WIDTH - GUTTER * (COLUMNS + 1)) / COLUMNS;
const CARD_HEIGHT = CARD_WIDTH * 1.4;

type SortBy = "number" | "value";

interface SetCard {
  id: string;
  name: string;
  number: string;
  imageUrl: string | null;
  price?: number | null;
}

function parseCardNumber(n: string): number {
  const m = n.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : 9999;
}

export default function SetCardsScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const { lang, setId, setName } = useLocalSearchParams<{
    lang: string;
    setId: string;
    setName: string;
  }>();

  const [sortBy, setSortBy] = useState<SortBy>("number");

  const { data, isLoading, error } = useQuery<{ cards: SetCard[] }>({
    queryKey: ["/api/sets", lang, setId, "cards"],
    enabled: !!lang && !!setId,
    staleTime: 6 * 60 * 60 * 1000,
  });

  const isEnglish = lang === "english";
  const isJpKr = lang === "japanese" || lang === "korean";
  const hasAnyPrice = isEnglish && (data?.cards ?? []).some(c => c.price != null);

  const cards = useMemo(() => {
    const raw = data?.cards ?? [];
    if (sortBy === "value" && isEnglish) {
      return [...raw].sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
    }
    return [...raw].sort((a, b) => parseCardNumber(a.number) - parseCardNumber(b.number));
  }, [data?.cards, sortBy, isEnglish]);

  const handleCardPress = (card: SetCard) => {
    if (isJpKr) {
      router.push({
        pathname: "/card-profit",
        params: {
          cardId: card.id,
          cardName: card.name,
          setName: setName || "",
          cardNumber: card.number,
          imageUrl: card.imageUrl || "",
          noPrice: "1",
        },
      });
    } else {
      router.push({
        pathname: "/card-profit",
        params: {
          cardId: card.id,
          cardName: card.name,
          setName: setName || "",
        },
      });
    }
  };

  const renderCard = ({ item }: { item: SetCard }) => (
    <Pressable
      style={({ pressed }) => [styles.cardItem, { opacity: pressed ? 0.75 : 1 }]}
      onPress={() => handleCardPress(item)}
    >
      {item.imageUrl ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.cardImage}
          contentFit="contain"
          transition={150}
        />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Ionicons name="image-outline" size={24} color={Colors.textMuted} />
        </View>
      )}
      {item.number ? (
        <Text style={styles.cardNumber} numberOfLines={1}>
          #{item.number}
        </Text>
      ) : null}
      {isEnglish && item.price != null ? (
        <Text style={styles.cardPrice} numberOfLines={1}>
          ${item.price.toFixed(2)}
        </Text>
      ) : null}
    </Pressable>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1 }]}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.navTitle} numberOfLines={1}>
          {setName || "Set"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Sort controls — only shown for English sets with price data */}
      {isEnglish && hasAnyPrice && !isLoading && !error && cards.length > 0 && (
        <View style={styles.sortBar}>
          <Pressable
            style={[styles.sortBtn, sortBy === "number" && styles.sortBtnActive]}
            onPress={() => setSortBy("number")}
          >
            <Ionicons
              name="list-outline"
              size={14}
              color={sortBy === "number" ? Colors.text : Colors.textMuted}
            />
            <Text style={[styles.sortBtnText, sortBy === "number" && styles.sortBtnTextActive]}>
              Card #
            </Text>
          </Pressable>
          <Pressable
            style={[styles.sortBtn, sortBy === "value" && styles.sortBtnActive]}
            onPress={() => setSortBy("value")}
          >
            <Ionicons
              name="trending-down-outline"
              size={14}
              color={sortBy === "value" ? Colors.text : Colors.textMuted}
            />
            <Text style={[styles.sortBtnText, sortBy === "value" && styles.sortBtnTextActive]}>
              Value
            </Text>
          </Pressable>
        </View>
      )}

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading cards…</Text>
        </View>
      )}

      {!isLoading && error && (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={36} color={Colors.error} />
          <Text style={styles.errorText}>Failed to load cards</Text>
          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go back</Text>
          </Pressable>
        </View>
      )}

      {!isLoading && !error && cards.length === 0 && (
        <View style={styles.centered}>
          <Ionicons name="albums-outline" size={36} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No card images available</Text>
          {isJpKr && (
            <Text style={styles.emptySubtitle}>
              Card images for this set aren't in our database yet. Use Search to look up a specific card by name.
            </Text>
          )}
        </View>
      )}

      {!isLoading && cards.length > 0 && (
        <FlatList
          data={cards}
          keyExtractor={(item) => item.id}
          numColumns={COLUMNS}
          contentContainerStyle={[
            styles.grid,
            { paddingBottom: insets.bottom + webBottomInset + 24 },
          ]}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          renderItem={renderCard}
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
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    flex: 1,
    textAlign: "center",
  },
  sortBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  sortBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  sortBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textMuted,
  },
  sortBtnTextActive: {
    color: Colors.text,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  loadingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.error,
    textAlign: "center",
  },
  backLink: {
    marginTop: 4,
  },
  backLinkText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: Colors.primary,
  },
  emptyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: Colors.text,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  grid: {
    paddingTop: GUTTER,
    paddingHorizontal: GUTTER,
  },
  row: {
    gap: GUTTER,
    marginBottom: GUTTER,
  },
  cardItem: {
    width: CARD_WIDTH,
    alignItems: "center",
  },
  cardImage: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 6,
    backgroundColor: Colors.surface,
  },
  cardImagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  cardNumber: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
    textAlign: "center",
  },
  cardPrice: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.primary,
    textAlign: "center",
  },
});
