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

// Reinstall detection (read-only — NEVER creates an id). The stable id is written
// to BOTH the Keychain (SecureStore) and AsyncStorage on first launch. On iOS the
// Keychain survives an uninstall but AsyncStorage is wiped, so "present in the
// Keychain but absent from AsyncStorage" uniquely identifies a reinstall — cleanly
// excluding first-ever installs (in neither) and plain app updates (in both).
// Call BEFORE getStableUserId so the read happens before an id is ever created.
export async function isReinstall(): Promise<boolean> {
  let inKeychain = false;
  try {
    inKeychain = !!(await SecureStore.getItemAsync(KEY));
  } catch {}
  if (!inKeychain) return false;
  try {
    if (await AsyncStorage.getItem(KEY)) return false;
  } catch {}
  return true;
}
