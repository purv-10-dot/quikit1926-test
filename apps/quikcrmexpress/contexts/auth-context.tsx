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
    // Platform single-logout — clears THIS app's session cookie, then the
    // auth-host cookie, then the launcher cookie, and lands on the public
    // landing page. Matches quikcrm/quikscale/quiktrack (globalSignOut from
    // @quikit/ui).
    //
    // The previous implementation called signOut({redirect:false}) and pushed
    // to /login. That cleared only the local cookie: the central Redis session,
    // the auth-host cookie and the launcher cookie all survived, and /login
    // immediately re-ran signIn("quikit"), so the user was silently signed
    // straight back in and logout appeared to do nothing.
    const landingUrl =
      (process.env.NEXT_PUBLIC_QUIKCRMEXPRESS_URL?.replace(/\/+$/, "") ??
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
