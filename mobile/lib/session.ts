import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

export interface SessionUser {
  id?: string;
  email?: string;
  name?: string;
  staffId?: string;
  role?: string;
}

const TOKEN_KEY = "authToken";
const SESSION_KEY = "session";

/**
 * SecureStore can be unavailable at runtime: it isn't supported on web, and a dev
 * client / Expo Go whose native module is older than the JS package throws
 * "getValueWithKeyAsync is not a function". Probe it once and transparently fall
 * back to AsyncStorage so auth never hard-crashes the app.
 */
let secureStoreUsable: boolean | null = null;

function hasSecureStore(): boolean {
  if (secureStoreUsable !== null) return secureStoreUsable;
  try {
    secureStoreUsable =
      typeof SecureStore.getItemAsync === "function" &&
      typeof SecureStore.setItemAsync === "function" &&
      typeof SecureStore.deleteItemAsync === "function";
  } catch {
    secureStoreUsable = false;
  }
  return secureStoreUsable;
}

async function setItem(key: string, value: string): Promise<void> {
  if (hasSecureStore()) {
    try {
      await SecureStore.setItemAsync(key, value);
      return;
    } catch {
      secureStoreUsable = false;
    }
  }
  await AsyncStorage.setItem(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (hasSecureStore()) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      secureStoreUsable = false;
    }
  }
  return AsyncStorage.getItem(key);
}

async function removeItem(key: string): Promise<void> {
  if (hasSecureStore()) {
    try {
      await SecureStore.deleteItemAsync(key);
      return;
    } catch {
      secureStoreUsable = false;
    }
  }
  await AsyncStorage.removeItem(key);
}

export async function saveSession(
  token: string,
  user: SessionUser
): Promise<void> {
  await setItem(TOKEN_KEY, token);
  await setItem(SESSION_KEY, JSON.stringify(user));
}

export async function getToken(): Promise<string | null> {
  return getItem(TOKEN_KEY);
}

export async function getSession(): Promise<SessionUser | null> {
  const raw = await getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await removeItem(TOKEN_KEY);
  await removeItem(SESSION_KEY);
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  return Boolean(token);
}
