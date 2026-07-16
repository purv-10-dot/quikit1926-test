"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { HelpCircle, Settings, Plus, PanelLeft, ListChecks } from "lucide-react";
import { UserMenu, globalSignOut } from "@quikit/ui";
import { CreateIssueModal } from "@/components/create-issue-modal";
import { ChecklistDrawer } from "@/components/checklist/checklist-drawer";
import { NotificationsPopover } from "@/components/shell/notifications-popover";
import { HelpPanel } from "@/components/help-panel";
import {
  GlobalSearchPopover,
  type GlobalSearchPopoverHandle,
} from "@/components/global-search-popover";
import { SettingsPopover } from "@/components/shell/settings-popover";
import { AppSwitcherVertical } from "@/components/shell/app-switcher-vertical";

interface HeaderProps {
  onToggleSidebar?: () => void;
  /** Whether the left sidebar is currently shown. Drives the logo column:
   *  full 232px width + vertical divider when open, compact when collapsed. */
  sidebarOpen?: boolean;
}

export function Header({ onToggleSidebar, sidebarOpen = true }: HeaderProps) {
  const { data: session } = useSession();
  const params = useParams();
  const pathname = usePathname() ?? "";
  const currentProjectId = typeof params?.id === "string" ? params.id : undefined;
  // Hide the global search + Create button on tenant-level admin pages where
  // they aren't relevant (user management / migration / general settings).
  const hideSearchAndCreate =
    pathname.startsWith("/settings/user-management") ||
    pathname.startsWith("/settings/migration") ||
    pathname.startsWith("/settings/general");
  const [createOpen, setCreateOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<GlobalSearchPopoverHandle>(null);

  // Theme-aware logo. Each monogram is a self-contained badge, so we show the
  // one that contrasts with the active theme: the DARK monogram in light mode,
  // the LIGHT monogram in dark mode. The `mounted` gate prevents an SSR/CSR
  // hydration mismatch — next-themes returns `undefined` on the first render,
  // so we default to the light-theme (dark monogram) asset until the client
  // knows which theme to apply.
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";
  const logoSrc = isDark
    ? "/header-icon-light.svg"
    : "/header-icon-dark.svg";

  // "/" anywhere outside an input focuses the global search box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (t?.isContentEditable ?? false)) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const fullName = session?.user?.name || session?.user?.email?.split("@")[0] || "User";
  const email = session?.user?.email || "";

  async function handleSignOut() {
    // Single-logout: clear quiktrack cookie, auth-host cookie, AND
    // launcher cookie. Without authUrl, the auth-host cookie would
    // persist and silently re-authenticate on next "Login" click.
    const landingUrl =
      (process.env.NEXT_PUBLIC_QUIKTRACK_URL?.replace(/\/+$/, "") ??
        (typeof window !== "undefined" ? window.location.origin : "")) + "/";
    await globalSignOut({
      authUrl: process.env.NEXT_PUBLIC_AUTH_URL,
      quikitUrl: process.env.NEXT_PUBLIC_QUIKIT_URL,
      localSignOut: () => signOut({ redirect: false }),
      postLogoutRedirect: landingUrl,
    });
  }

  return (
    <div className="sticky top-0 z-50">
      <header className="qt-topbar h-12 bg-white flex items-stretch border-b border-gray-200">
        {/* Logo column — when the sidebar is open it matches the sidebar
            width (232px) and carries a right border so the vertical divider
            runs continuously into the sidebar. When collapsed it shrinks to
            fit the logo so there's no empty gap or dangling divider. */}
        <div
          className={`shrink-0 flex items-center gap-2 px-3 ${
            sidebarOpen ? "w-[232px]" : ""
          }`}
        >
          <AppSwitcherVertical />
          <Link href="/" className="flex items-center gap-2 px-1">
            <Image
              src={logoSrc}
              alt="QuikTrack"
              width={28}
              height={28}
              className="h-7 w-7 object-contain"
              priority
              unoptimized={logoSrc.endsWith(".svg")}
            />
            {/* App name — theme-aware so it stays legible on the light header
                (ink) and the dark #11161C header (near-white). */}
            <span
              className="text-xl font-bold leading-none tracking-tight"
              style={{ color: isDark ? "#F8FAFC" : "#0F172A" }}
            >
              QuikTrack
            </span>
          </Link>
          <button
            onClick={onToggleSidebar}
            className={`p-1 rounded hover:bg-gray-100 text-gray-500 ${sidebarOpen ? "ml-auto" : ""}`}
            aria-label="Toggle sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Content row — search, create, and the right-hand action icons. */}
        <div className="flex-1 flex items-center gap-3 px-3">
          <div className="flex-1 max-w-2xl mx-auto flex items-center gap-2">
            {!hideSearchAndCreate && <GlobalSearchPopover ref={searchRef} />}
            {!hideSearchAndCreate && (
              <button
                type="button"
                data-tour="create"
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-1 h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded shrink-0"
              >
                <Plus className="h-4 w-4" />
                Create
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <NotificationsPopover />
            <button
              type="button"
              onClick={() => setChecklistOpen(true)}
              className="p-2 rounded hover:bg-gray-100 text-gray-600"
              aria-label="My checklist"
              title="My checklist"
            >
              <ListChecks className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="p-2 rounded hover:bg-gray-100 text-gray-600"
              aria-label="Help"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            <div className="relative">
              <button
                ref={settingsBtnRef}
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                className={`p-2 rounded text-gray-600 ${settingsOpen ? "bg-gray-100" : "hover:bg-gray-100"}`}
                aria-label="Settings"
                aria-haspopup="menu"
                aria-expanded={settingsOpen}
              >
                <Settings className="h-4 w-4" />
              </button>
              <SettingsPopover
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                anchorRef={settingsBtnRef}
              />
            </div>
            <UserMenu
              user={{ name: fullName, email }}
              onSignOut={handleSignOut}
              avatarClassName="bg-blue-600"
            />
          </div>
        </div>
      </header>
      <CreateIssueModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        initialProjectId={currentProjectId}
      />
      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ChecklistDrawer open={checklistOpen} onClose={() => setChecklistOpen(false)} />
    </div>
  );
}
