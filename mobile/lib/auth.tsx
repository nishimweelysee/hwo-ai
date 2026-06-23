import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as Network from "expo-network";
import { apiRequest } from "./api";
import { flushOfflineQueue } from "./offline-queue";
import { registerPushToken } from "./push";
import {
  clearSession,
  getSession,
  getToken,
  saveSession,
  type SessionUser,
} from "./session";

interface AuthContextValue {
  user: SessionUser | null;
  ready: boolean;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  ready: false,
  refreshSession: async () => {},
  signOut: async () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return Boolean(state.isConnected);
  } catch {
    return true;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  const refreshSession = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setUser(null);
      return;
    }

    const online = await isOnline();
    if (!online) {
      const cached = await getSession();
      setUser(cached);
      return;
    }

    try {
      const me = await apiRequest<{
        authenticated: boolean;
        user?: SessionUser;
        staffId?: string;
      }>("/api/mobile/me");

      if (me.authenticated && me.user) {
        const sessionUser: SessionUser = {
          ...me.user,
          staffId: me.user.staffId || me.staffId,
        };
        await saveSession(token, sessionUser);
        setUser(sessionUser);
        await registerPushToken();
        await flushOfflineQueue();
      } else {
        await clearSession();
        setUser(null);
      }
    } catch {
      const cached = await getSession();
      setUser(cached);
    }
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    setUser(null);
  }, []);

  useEffect(() => {
    refreshSession().finally(() => setReady(true));
  }, [refreshSession]);

  useEffect(() => {
    const subscription = Network.addNetworkStateListener((state) => {
      if (state.isConnected) {
        refreshSession();
      }
    });
    return () => subscription.remove();
  }, [refreshSession]);

  const value = useMemo(
    () => ({ user, ready, refreshSession, signOut }),
    [user, ready, refreshSession, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
