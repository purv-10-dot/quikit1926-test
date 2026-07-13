"use client";

import { Bell, LogOut, Menu } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { AppSwitcher, globalSignOut } from "@quikit/ui";

const STORAGE_KEY = "qa_notif_read_ids";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/assets": "Asset Inventory",
  "/assets/categories": "Category Master",
  "/assignments": "Assignments",
  "/repair": "Repair & Recovery",
  "/audit-log": "Audit Log",
  "/notifications": "Notifications",
  "/reports": "Reports",
  "/users": "User Directory",
  "/settings": "Settings",
};

interface TopbarProps {
  onMenuClick: () => void;
  displayName: string;
  email: string | null;
}

export function Topbar({ onMenuClick, displayName, email }: TopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  const title = TITLES[pathname] ?? "QuikAsset";
  const initials = displayName
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  useEffect(() => {
    async function fetchUnread() {
      try {
        const json = await fetch("/api/notifications").then((r) => r.json());
        const data: Array<{ id: string }> = json?.data ?? [];
        const read: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
        const readSet = new Set(read);
        setUnreadCount(data.filter((n) => !readSet.has(n.id)).length);
      } catch {
        /* ignore */
      }
    }
    void fetchUnread();
  }, []);

  return (
    <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 sm:px-6">
      <button
        onClick={onMenuClick}
        className="rounded-lg p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] md:hidden"
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <h1 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h1>

      <div className="ml-auto flex items-center gap-2">
        {/* App switcher grid — routes to other apps via the SSO bridge, with a
            "View all apps" link to the launcher. */}
        <AppSwitcher />

        <button
          onClick={() => router.push("/notifications")}
          className="relative rounded-lg p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1">
              <span className="text-[9px] font-bold leading-none text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            </span>
          )}
        </button>

        <div className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-600 text-xs font-semibold text-white"
            title={email ?? displayName}
          >
            {initials || "U"}
          </div>
          <span className="hidden text-sm font-medium text-[var(--color-text-primary)] sm:block">
            {displayName}
          </span>
        </div>

        <button
          onClick={() =>
            // Full cross-app single-logout: clears THIS app's cookie AND the
            // auth-host + launcher cookies. Plain `signOut` only cleared the
            // local cookie, so the leftover auth-host session silently
            // re-authenticated the previous user on the next "Login" click.
            void globalSignOut({
              authUrl: process.env.NEXT_PUBLIC_AUTH_URL,
              quikitUrl: process.env.NEXT_PUBLIC_QUIKIT_URL,
              localSignOut: () => signOut({ redirect: false }),
              // Land back on THIS app's marketing landing (localhost:3012 in
              // dev). Pin the app's own base URL so the redirect is correct even
              // when reached via a non-localhost origin; fall back to the current
              // origin. Mirrors quiktrack's header logout.
              postLogoutRedirect:
                (process.env.NEXT_PUBLIC_QUIKASSET_URL?.replace(/\/+$/, "") ??
                  (typeof window !== "undefined" ? window.location.origin : "")) +
                "/",
            })
          }
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
          title="Log out"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:block">Logout</span>
        </button>
      </div>
    </header>
  );
}
