"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, ChevronDown, LogOut } from "lucide-react";
import { useActiveOrg } from "@/lib/hooks/useActiveOrg";

/**
 * QuikTrack's avatar menu: the shared `@quikit/ui` UserMenu plus a row naming
 * the organisation this session is working in, directly above Sign out.
 *
 * WHY A LOCAL COPY. `@quikit/ui`'s UserMenu only accepts `items`, which render
 * as clickable buttons. The org row must be DISPLAY-ONLY — QuikTrack has no
 * org switcher, and a row that looks pressable but does nothing is worse than
 * no row at all. There is no static/read-only slot on the shared component,
 * and this app may not modify `packages/ui`.
 *
 * TODO(integration): replace with @quikit/ui's UserMenu once it takes a
 * read-only `meta`/footer slot; then delete this file. Requested in the PR
 * description. Deliberately scoped to what QuikTrack actually uses (light
 * chrome + Sign out) — impersonation and the `dark` variant stay upstream.
 *
 * Dark mode needs no `dark:` variants: globals.css remaps `bg-white`,
 * `text-gray-*` and friends under `html.dark`, which is how the shared menu
 * renders correctly on QuikTrack's dark chrome too.
 */

interface Props {
  user: { name: string; email: string };
  onSignOut: () => void | Promise<void>;
  /** Tailwind class for the avatar circle. */
  avatarClassName?: string;
}

function computeInitials(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "U";
  return trimmed
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function UserMenuWithOrg({ user, onSignOut, avatarClassName = "bg-accent-600" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeOrg = useActiveOrg();
  const initials = computeInitials(user.name);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleSignOut() {
    setOpen(false);
    await onSignOut();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-50"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm ${avatarClassName}`}
        >
          {initials}
        </div>
        <div className="hidden sm:block text-left min-w-0">
          <p className="text-sm font-medium leading-tight truncate max-w-[10rem] text-gray-900">
            {user.name}
          </p>
          <p className="text-xs leading-tight truncate max-w-[10rem] text-gray-500">
            {user.email}
          </p>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform flex-shrink-0 text-gray-400 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <>
          {/* Invisible backdrop so an outside tap closes the menu on mobile. */}
          <div className="fixed inset-0 z-[999]" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="absolute top-full right-0 mt-1 w-60 rounded-lg shadow-lg py-1 overflow-hidden z-[1000] bg-white border border-gray-200"
          >
            {/* Header — name + email */}
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-medium truncate text-gray-900">{user.name}</p>
              <p className="text-xs truncate text-gray-500">{user.email}</p>
            </div>

            {/*
              Active organisation — DISPLAY ONLY.
              Not a button, not a menuitem, no hover or pointer cursor: QuikTrack
              cannot switch orgs (a session carries one `orgId` claim), so this
              must read as a status line, never as something to press. Hidden
              entirely until the name is known, rather than showing a skeleton
              that implies the workspace is in doubt.
            */}
            {activeOrg && (
              <div className="px-4 py-2.5 border-b border-gray-100" role="presentation">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Organization
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate text-gray-900" title={activeOrg.name}>
                      {activeOrg.name}
                    </p>
                    {activeOrg.role && (
                      <p className="text-[11px] leading-tight truncate text-gray-500">
                        {activeOrg.role}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="py-1">
              <button
                type="button"
                role="menuitem"
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
