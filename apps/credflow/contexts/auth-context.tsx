"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { AUTH_LOGIN_PATH } from "@/lib/auth/routes";

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ initialUser, children }: { initialUser: AuthUser | null; children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(initialUser);

  const refreshMe = useCallback(async () => {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (res.ok) {
      const json = await res.json();
      setUser(json.user);
    } else if (res.status === 401) {
      setUser(null);
    }
  }, []);

  const logout = useCallback(async () => {
    // Clear the NextAuth JWT session cookie. Without this the middleware sees a
    // still-valid token and bounces the user straight back to /dashboard, so the
    // sign-out click appears to do nothing. `redirect: false` lets us keep the
    // SPA navigation below (and clear the auth-context state) instead of a full
    // page reload to NextAuth's default callback.
    await signOut({ redirect: false });
    setUser(null);
    router.push(AUTH_LOGIN_PATH);
    router.refresh();
  }, [router]);

  return <AuthContext.Provider value={{ user, logout, refreshMe }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
