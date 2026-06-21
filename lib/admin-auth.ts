import * as SecureStore from "expo-secure-store";
import { getApiUrl } from "@/lib/query-client";

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

export async function adminSaveSetting(key: string, value: string): Promise<void> {
  const password = await getAdminPassword();
  const url = new URL("/api/admin/settings", getApiUrl());
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-password": password },
    body: JSON.stringify({ key, value }),
  });
  if (res.status === 401) throw new Error("Admin session expired — re-enter your admin code from Settings.");
  if (!res.ok) throw new Error("Failed to save setting");
}

export async function adminFetchSettings(): Promise<Record<string, string>> {
  const password = await getAdminPassword();
  const url = new URL("/api/admin/settings", getApiUrl());
  const res = await fetch(url.toString(), {
    headers: { "x-admin-password": password },
  });
  if (res.status === 401) throw new Error("Admin session expired — re-enter your admin code from Settings.");
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

// Generic authenticated admin request. Mirrors apiRequest from query-client but
// injects the stored x-admin-password header and surfaces a 401 as a friendly
// "session expired" error so admin screens can prompt a re-login. Returns the
// raw Response (callers check res.ok / parse the body themselves), exactly like
// apiRequest, so it is a drop-in replacement on admin-only endpoints.
export async function adminApiRequest(
  method: string,
  route: string,
  data?: unknown,
): Promise<Response> {
  const password = await getAdminPassword();
  const url = new URL(route, getApiUrl());
  const res = await fetch(url.toString(), {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      "x-admin-password": password,
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });
  if (res.status === 401) {
    throw new Error("Admin session expired — re-enter your admin code from Settings.");
  }
  return res;
}
