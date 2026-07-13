"use client";

import { signOut } from "next-auth/react";
import { AppSwitcher, globalSignOut } from "@quikit/ui";
import { useHelpdesk } from "@/components/layout/HelpdeskProvider";

/**
 * Slim top bar inside the helpdesk shell — hosts the cross-app switcher grid
 * (same shared component quiktrack uses) and the global sign-out, so users can
 * jump between QuikIT apps and log out from inside quiksupport.
 */
export function AppBar() {
  const { tenant } = useHelpdesk();

  async function handleSignOut() {
    await globalSignOut({
      authUrl: process.env.NEXT_PUBLIC_AUTH_URL,
      quikitUrl: process.env.NEXT_PUBLIC_QUIKIT_URL,
      localSignOut: () => signOut({ redirect: false }),
      postLogoutRedirect:
        typeof window !== "undefined" ? `${window.location.origin}/` : undefined,
    });
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 6,
        padding: "8px 16px",
        borderBottom: "1px solid rgba(15,23,42,0.08)",
        background: "#ffffff",
        position: "sticky",
        top: 0,
        zIndex: 40,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          marginRight: "auto",
          fontSize: 13,
          fontWeight: 600,
          color: "#475569",
          letterSpacing: "-0.01em",
        }}
      >
        {tenant?.name || "QuikSupport"}
      </span>
      <AppSwitcher />
      <button
        onClick={handleSignOut}
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#475569",
          background: "transparent",
          border: "1px solid rgba(15,23,42,0.12)",
          borderRadius: 8,
          padding: "6px 12px",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Sign out
      </button>
    </div>
  );
}
