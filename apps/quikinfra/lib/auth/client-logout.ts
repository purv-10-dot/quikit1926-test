"use client";

import { signOut } from "next-auth/react";
import { globalSignOut } from "@quikit/ui";

/**
 * Full single-logout (SLO) for QuikInfra, matching every other QuikIT app.
 *
 * Clears cookies on all three hosts — this app, the central auth host, and
 * the launcher — via the shared `globalSignOut` chain. `signOut({ redirect:
 * false })` clears the local cookie WITHOUT navigating to NextAuth's default
 * `/api/auth/signout` confirmation page; globalSignOut then wipes
 * local/session storage and walks the cross-app SLO redirect chain,
 * landing the user back on QuikInfra's home page (matching quiktrack/quikscale).
 *
 * Used by the UserMenu sign-out button and by the forced logout in
 * use-permissions (401 → account deactivated).
 */
export async function signOutAndClear(
  postLogoutRedirect: string = (process.env.NEXT_PUBLIC_QUIKINFRA_URL?.replace(
    /\/+$/,
    "",
  ) ?? (typeof window !== "undefined" ? window.location.origin : "")) + "/",
) {
  await globalSignOut({
    authUrl: process.env.NEXT_PUBLIC_AUTH_URL,
    quikitUrl: process.env.NEXT_PUBLIC_QUIKIT_URL,
    localSignOut: () => signOut({ redirect: false }),
    postLogoutRedirect,
  });
}
