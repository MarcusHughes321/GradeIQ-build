import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

const KEY = "gradeiq_stable_user_id";

export async function getStableUserId(): Promise<string> {
  try {
    const stored = await SecureStore.getItemAsync(KEY);
    if (stored) return stored;
  } catch {}

  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored) {
      try { await SecureStore.setItemAsync(KEY, stored); } catch {}
      return stored;
    }
  } catch {}

  const id = Crypto.randomUUID();
  await Promise.allSettled([
    SecureStore.setItemAsync(KEY, id),
    AsyncStorage.setItem(KEY, id),
  ]);
  return id;
}
