import { Platform } from "react-native";

/** Prefer direct Spring Boot URL on device; fall back to Next.js proxy. */
function resolveBaseUrl(): string {
  const direct = process.env.EXPO_PUBLIC_BACKEND_URL;
  const proxy = process.env.EXPO_PUBLIC_API_URL;
  return direct || proxy || "http://localhost:8080";
}

/** Android emulator maps host localhost to 10.0.2.2 */
function normalizeHost(url: string): string {
  if (Platform.OS === "android" && url.includes("localhost")) {
    return url.replace("localhost", "10.0.2.2");
  }
  if (Platform.OS === "android" && url.includes("127.0.0.1")) {
    return url.replace("127.0.0.1", "10.0.2.2");
  }
  return url;
}

export const API_BASE = normalizeHost(resolveBaseUrl());
