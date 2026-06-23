import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { apiRequest } from "./api";
import { isAuthenticated } from "./session";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerPushToken(): Promise<boolean> {
  const authed = await isAuthenticated();
  if (!authed) return false;

  if (!Device.isDevice) {
    return false;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    return false;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "HWO Alerts",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  const pushToken = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );

  await apiRequest("/api/mobile/push-token", {
    method: "POST",
    body: { token: pushToken.data, platform: Platform.OS },
  });

  return true;
}

export async function unregisterPushToken(token: string): Promise<void> {
  try {
    await apiRequest("/api/mobile/push-token", {
      method: "DELETE",
      body: { token },
    });
  } catch {
    // Best effort on sign-out
  }
}
