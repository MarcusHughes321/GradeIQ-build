import * as SecureStore from "expo-secure-store";

const ADMIN_PASSWORD_KEY = "gradeiq_admin_password";

export async function setAdminPassword(password: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(ADMIN_PASSWORD_KEY, password);
  } catch {}
}

export async function getAdminPassword(): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(ADMIN_PASSWORD_KEY)) ?? "";
  } catch {
    return "";
  }
}

export async function clearAdminPassword(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(ADMIN_PASSWORD_KEY);
  } catch {}
}
