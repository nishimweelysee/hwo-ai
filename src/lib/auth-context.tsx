"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { UserPermissions } from "@/lib/permissions";

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  organization?: string;
  menus?: string[];
  actions?: string[];
  canManageUsers?: boolean;
  canManageSettings?: boolean;
};

type AuthContextType = {
  user: User | null;
  permissions: UserPermissions | null;
  token: string | null;
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (data: { name: string; email: string; password: string; role?: string; departmentId?: string }) => Promise<boolean>;
  logout: () => void;
  setToken: (token: string | null) => void;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "hwo_auth_token";
const TOKEN_COOKIE = "hwo_token";

function setTokenCookie(token: string | null) {
  if (typeof document === "undefined") return;
  if (token) {
    document.cookie = `${TOKEN_COOKIE}=${token}; path=/; max-age=28800; SameSite=Lax`;
  } else {
    document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0`;
  }
}

function extractPermissions(user: User | null): UserPermissions | null {
  if (!user) return null;
  return {
    role: user.role,
    menus: user.menus,
    actions: user.actions,
    canManageUsers: user.canManageUsers,
    canManageSettings: user.canManageSettings,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const setToken = (t: string | null) => {
    if (typeof window !== "undefined") {
      if (t) {
        localStorage.setItem(TOKEN_KEY, t);
        setTokenCookie(t);
      } else {
        localStorage.removeItem(TOKEN_KEY);
        setTokenCookie(null);
      }
    }
    setTokenState(t);
  };

  const applyUser = (sessionUser: User | null) => {
    setUser(sessionUser);
    setPermissions(extractPermissions(sessionUser));
  };

  const fetchSession = async (t: string) => {
    try {
      const res = await fetch("/api/auth/session", {
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await res.json();
      if (data?.user) {
        applyUser(data.user);
        return;
      }
    } catch {}
    applyUser(null);
    setToken(null);
  };

  const refreshSession = async () => {
    const t = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    if (t) await fetchSession(t);
  };

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    if (t) {
      setTokenState(t);
      fetchSession(t).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setToken(data.token);
        applyUser(data.user);
        return true;
      }
    } catch {}
    return false;
  };

  const register = async (data: { name: string; email: string; password: string; role?: string; departmentId?: string }) => {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (res.ok && result.token) {
        setToken(result.token);
        applyUser(result.user);
        return true;
      }
    } catch {}
    return false;
  };

  const logout = () => {
    fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    applyUser(null);
    setToken(null);
    setTokenCookie(null);
  };

  const isAdmin = Boolean(permissions?.canManageUsers || permissions?.actions?.includes("*"));

  return (
    <AuthContext.Provider
      value={{ user, permissions, token, loading, isAdmin, login, register, logout, setToken, refreshSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
