import { Tabs, router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth";
import { apiRequest } from "../../lib/api";
import { colors } from "../../lib/theme";

function TabIcon({
  name,
  color,
  focused,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  focused: boolean;
}) {
  return <Ionicons name={focused ? name : (`${name}-outline` as keyof typeof Ionicons.glyphMap)} size={22} color={color} />;
}

export default function TabLayout() {
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const [alertBadge, setAlertBadge] = useState<number | undefined>();

  const loadAlertCount = useCallback(async () => {
    if (!signedIn) {
      setAlertBadge(undefined);
      return;
    }
    try {
      const data = await apiRequest<{ alerts?: unknown[] }>("/api/mobile/alerts");
      const count = data.alerts?.length ?? 0;
      setAlertBadge(count > 0 ? count : undefined);
    } catch {
      setAlertBadge(undefined);
    }
  }, [signedIn]);

  useEffect(() => {
    loadAlertCount();
  }, [loadAlertCount]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: 4,
          height: 58,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
        headerRight: signedIn
          ? () => (
              <Pressable
                onPress={() => router.push("/(tabs)/profile")}
                style={{ marginRight: 14 }}
                hitSlop={8}
              >
                <Ionicons name="person-circle-outline" size={26} color="#fff" />
              </Pressable>
            )
          : () => (
              <Pressable
                onPress={() => router.push("/login")}
                style={{ marginRight: 14 }}
                hitSlop={8}
              >
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Sign in</Text>
              </Pressable>
            ),
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="home" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: "My Schedule",
          tabBarLabel: "Schedule",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="calendar" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="wellness"
        options={{
          title: "Wellness",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="heart" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          tabBarBadge: alertBadge,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="notifications" color={color} focused={focused} />
          ),
        }}
        listeners={{ focus: () => loadAlertCount() }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          href: null,
        }}
      />
    </Tabs>
  );
}
