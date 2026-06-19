"use client";

import { signOut } from "next-auth/react";

/**
 * Sign out and wipe client-side state. HttpOnly NextAuth cookies are cleared
 * by signOut() server-side; this helper additionally clears localStorage,
 * sessionStorage, and any non-HttpOnly cookies set by the app so a fresh
 * login on the same browser starts from a clean slate.
 */
export async function signOutAndClear(
  callbackUrl: string = process.env.NEXT_PUBLIC_AUTH_URL
    ? `${process.env.NEXT_PUBLIC_AUTH_URL}/login`
    : "/",
) {
  if (typeof window !== "undefined") {
    try { window.localStorage.clear(); } catch {}
    try { window.sessionStorage.clear(); } catch {}
    try {
      const cookies = document.cookie ? document.cookie.split(";") : [];
      for (const c of cookies) {
        const eq = c.indexOf("=");
        const name = (eq > -1 ? c.substring(0, eq) : c).trim();
        if (!name) continue;
        // Expire on root path and current host (and one level up for
        // subdomain deployments e.g. infraerp.quikit.ai → .quikit.ai).
        const host = window.location.hostname;
        const parent = host.split(".").slice(-2).join(".");
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${host}`;
        if (parent && parent !== host) {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${parent}`;
        }
      }
    } catch {}
  }
  await signOut({ callbackUrl });
}
