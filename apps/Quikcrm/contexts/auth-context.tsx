"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import { globalSignOut } from "@quikit/ui";

export interface AuthUser {
  id: string;
  orgId: string;
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
    // Platform single-logout — clears the QuikCRM session cookie, the auth-host
    // cookie, AND the launcher cookie, then lands on QuikCRM's public page.
    // Matches QuikScale/QuikTrack (globalSignOut from @quikit/ui). There is no
    // /api/auth/logout route — auth is NextAuth at /api/auth/[...nextauth], so
    // the old POST /api/auth/logout returned 400.
    const landingUrl =
      (process.env.NEXT_PUBLIC_QUIKCRM_URL?.replace(/\/+$/, "") ??
        (typeof window !== "undefined" ? window.location.origin : "")) + "/";
    setUser(null);
    await globalSignOut({
      authUrl: process.env.NEXT_PUBLIC_AUTH_URL,
      quikitUrl: process.env.NEXT_PUBLIC_QUIKIT_URL,
      localSignOut: () => signOut({ redirect: false }),
      postLogoutRedirect: landingUrl,
    });
  }, []);

  return <AuthContext.Provider value={{ user, logout, refreshMe }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
