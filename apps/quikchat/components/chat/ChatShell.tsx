"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { globalSignOut } from "@quikit/ui";
import {
  Avatar,
  Badge,
  Bell,
  Calendar,
  IconButton,
  LogOut,
  Menu,
  MenuItem,
  MessageSquare,
  Phone,
  Popover,
  PresenceIndicator,
  Settings,
  ToastProvider,
  useToast,
} from "@/components/ui";
import { fetchMyPresence, updateMyPresence } from "@/lib/api";
import type { SetStatus } from "@/lib/presence-store";
import { NotificationSettingsModal } from "@/components/notifications/NotificationSettingsModal";
import {
  NotificationProvider,
  useNotifications,
} from "@/components/notifications/NotificationProvider";
import { ProfileProvider, useProfile } from "@/components/profile/ProfileProvider";
import { DesktopBridge } from "@/components/desktop/DesktopBridge";
import { useDisabledModules } from "@/lib/authz/useDisabledModules";
import { isModuleEnabled } from "@quikit/shared/moduleRegistry";
import { AppSwitcher } from "./AppSwitcher";
import { CalendarModule } from "./CalendarModule";
import { CallsModule } from "./CallsModule";
import { ChatWorkspace } from "./ChatWorkspace";
import { NotificationsModule } from "./NotificationsModule";
import { SettingsModule } from "./SettingsModule";
import { DEFAULT_ACCENT, STORAGE_KEY } from "@/lib/accent-theme";

export interface ChatShellProps {
  currentUserId: string;
  displayName: string;
  avatarUrl?: string | null;
  workspaceName: string;
  orgId: string;
  realtimeUrl: string;
  initialChannelId?: string;
}

/** User-settable statuses for the account-menu picker (durable set-status). */
const STATUS_OPTIONS: { value: SetStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "busy", label: "Busy" },
  { value: "dnd", label: "Do not disturb" },
  { value: "brb", label: "Be right back" },
  { value: "away", label: "Appear away" },
  { value: "appear_offline", label: "Appear offline" },
];

/**
 * Duration options for a timed status. The client computes the ABSOLUTE instant
 * (so "Today"/"This week" honour the user's local timezone); the server just
 * stores and compares it. `null` = "until I change it".
 */
const DURATIONS: { key: string; label: string; compute: () => string | null }[] = [
  { key: "none", label: "Don't clear", compute: () => null },
  { key: "30m", label: "30 min", compute: () => new Date(Date.now() + 30 * 60_000).toISOString() },
  { key: "1h", label: "1 hour", compute: () => new Date(Date.now() + 60 * 60_000).toISOString() },
  {
    key: "today",
    label: "Today",
    compute: () => {
      const d = new Date();
      d.setHours(23, 59, 59, 999);
      return d.toISOString();
    },
  },
  {
    key: "week",
    label: "This week",
    compute: () => {
      const d = new Date();
      // End of the current week = upcoming Sunday, local 23:59:59.999.
      d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
      d.setHours(23, 59, 59, 999);
      return d.toISOString();
    },
  },
];

export function ChatShell(props: ChatShellProps) {
  return (
    <ToastProvider>
      <NotificationProvider>
        <ProfileProvider currentUserId={props.currentUserId}>
          <ShellInner {...props} />
        </ProfileProvider>
      </NotificationProvider>
    </ToastProvider>
  );
}

function ShellInner({
  currentUserId,
  displayName,
  avatarUrl,
  workspaceName,
  realtimeUrl,
  initialChannelId,
}: ChatShellProps) {
  const { openProfile } = useProfile();
  const notifications = useNotifications();
  const toast = useToast();
  const [notifSettingsOpen, setNotifSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // The caller's own durable set-status (drives the rail avatar dot + picker).
  // Ephemeral on_call/online/offline aren't tracked here — this is the status
  // the user chose. Defaults to "available" until the GET resolves.
  const [ownStatus, setOwnStatus] = useState<SetStatus>("available");
  const [ownExpiresAt, setOwnExpiresAt] = useState<string | null>(null);
  // Pending "clear after" selection applied to the NEXT status pick (and, when a
  // timed status is already active, re-applied immediately).
  const [durationKey, setDurationKey] = useState<string>("none");

  useEffect(() => {
    void fetchMyPresence()
      .then((p) => {
        setOwnStatus(p.status);
        setOwnExpiresAt(p.statusExpiresAt);
      })
      .catch(() => undefined);
  }, []);

  // Client-side revert timer (cosmetic — server read-expiry is the source of
  // truth). When the deadline passes, snap our own display back to Available.
  useEffect(() => {
    if (!ownExpiresAt) return;
    const ms = Date.parse(ownExpiresAt) - Date.now();
    const revert = () => {
      setOwnStatus("available");
      setOwnExpiresAt(null);
      setDurationKey("none");
    };
    if (ms <= 0) {
      revert();
      return;
    }
    const t = setTimeout(revert, ms);
    return () => clearTimeout(t);
  }, [ownExpiresAt]);

  const commitPresence = (next: SetStatus, expiresAt: string | null, closeMenu: boolean) => {
    setOwnStatus(next); // optimistic
    setOwnExpiresAt(expiresAt);
    if (closeMenu) setMenuOpen(false);
    void updateMyPresence({ status: next, expiresAt })
      .then((dto) => {
        setOwnStatus(dto.status);
        setOwnExpiresAt(dto.statusExpiresAt);
      })
      .catch(() => {
        toast.error({ title: "Couldn't update your status" });
      });
  };

  // Pick a status with the currently-selected duration; closes the menu.
  const pickStatus = (next: SetStatus) => {
    const expiresAt = DURATIONS.find((d) => d.key === durationKey)?.compute() ?? null;
    commitPresence(next, next === "available" ? null : expiresAt, true);
  };

  // Choose a "clear after" duration; keeps the menu open. Re-times the current
  // status when one is already set (so the chip is meaningful before/after).
  const pickDuration = (key: string) => {
    setDurationKey(key);
    if (ownStatus !== "available") {
      const expiresAt = DURATIONS.find((d) => d.key === key)?.compute() ?? null;
      commitPresence(ownStatus, expiresAt, false);
    }
  };

  // Reset to Available with no expiry (Teams "Reset status").
  const resetStatus = () => {
    setDurationKey("none");
    commitPresence("available", null, true);
  };
  const [view, setView] = useState<"chat" | "calendar" | "calls" | "notifications" | "settings">(
    "chat",
  );
  // Set right before flipping `view` back to "chat" after scheduling a real
  // meeting from the Calendar module (CalendarModule has no channel context
  // of its own — it lives outside ChatWorkspace). ChatWorkspace is always
  // unmounted while another view is active, so this becomes its fresh
  // `initialChannelId` on remount and its own once-per-mount deep-link effect
  // picks it up — no extra plumbing needed on that side.
  const [scheduledChannelId, setScheduledChannelId] = useState<string | undefined>(undefined);

  // RBAC v2 module gate (Phase 3, COSMETIC — the server `gateModuleApi` gate is
  // the enforcement). Hide the Calls / Calendar rail entries when their module
  // is disabled for the tenant, and fall back to "chat" if the active view's
  // module is turned off out from under it. Messaging is always-on.
  const disabledModules = useDisabledModules();
  const callsEnabled = isModuleEnabled("calls", disabledModules);
  const calendarEnabled = isModuleEnabled("calendar", disabledModules);
  const effectiveView =
    (view === "calls" && !callsEnabled) || (view === "calendar" && !calendarEnabled)
      ? "chat"
      : view;

  // Apply the saved accent color theme on load (defaults to Mist Blue).
  // Reads STORAGE_KEY, not the literal it used to duplicate — SettingsModule
  // writes through the same constant, so a rename can only ever move both.
  useEffect(() => {
    let saved: string = DEFAULT_ACCENT;
    try {
      saved = localStorage.getItem(STORAGE_KEY) || DEFAULT_ACCENT;
    } catch {
      // ignore
    }
    document.documentElement.setAttribute("data-accent", saved);
  }, []);

  // Single-logout, identical to every other app: clear this app's session
  // cookie + storage, run the auth-host + launcher SLO chain, and land the user
  // back on the QuikChat landing page (not NextAuth's default confirm screen).
  const handleLogout = async () => {
    await globalSignOut({
      authUrl: process.env.NEXT_PUBLIC_AUTH_URL,
      quikitUrl: process.env.NEXT_PUBLIC_QUIKIT_URL,
      localSignOut: () => signOut({ redirect: false }),
      postLogoutRedirect: window.location.origin + "/",
    });
  };

  return (
    <div className="qc-frame">
      <DesktopBridge />
      <aside className="qc-rail" aria-label="Primary navigation">
        <div className="qc-rail__logo" title={workspaceName}>
          <img src="/quikchat-monogram.svg" alt={workspaceName} />
        </div>
        <div className="qc-rail__group">
          <span className="qc-rail__navbtn" data-active={view === "chat"}>
            <IconButton label="Messages" onClick={() => setView("chat")}>
              <MessageSquare size={18} />
            </IconButton>
          </span>
          {calendarEnabled && (
            <span className="qc-rail__navbtn" data-active={view === "calendar"}>
              <IconButton label="Calendar" onClick={() => setView("calendar")}>
                <Calendar size={18} />
              </IconButton>
            </span>
          )}
          {callsEnabled && (
            <span className="qc-rail__navbtn" data-active={view === "calls"}>
              <IconButton label="Calls" onClick={() => setView("calls")}>
                <Phone size={18} />
              </IconButton>
            </span>
          )}
          <span className="qc-rail__navbtn qc-bell" data-active={view === "notifications"}>
            <IconButton label="Notifications" onClick={() => setView("notifications")}>
              <Bell size={18} />
            </IconButton>
            {notifications.unreadCount > 0 ? (
              <span className="qc-bell__badge">
                <Badge count={notifications.unreadCount} />
              </span>
            ) : null}
          </span>
          <span className="qc-rail__navbtn" data-active={view === "settings"}>
            <IconButton label="Settings" onClick={() => setView("settings")}>
              <Settings size={18} />
            </IconButton>
          </span>
        </div>
        <div className="qc-rail__spacer" />
        <div className="qc-rail__group">
          <AppSwitcher />
          <Popover
            open={menuOpen}
            onOpenChange={setMenuOpen}
            placement="top"
            label="Account menu"
            trigger={
              <button type="button" className="qc-avatar-btn" aria-label="Account menu">
                <Avatar
                  name={displayName}
                  id={currentUserId}
                  avatarUrl={avatarUrl}
                  size={30}
                  status={ownStatus}
                />
              </button>
            }
          >
            <Menu label="Account">
              <div className="qc-menu-label" role="presentation">
                Status
              </div>
              {STATUS_OPTIONS.map((opt) => (
                <MenuItem
                  key={opt.value}
                  icon={<PresenceIndicator status={opt.value} size={16} />}
                  onSelect={() => pickStatus(opt.value)}
                >
                  {opt.label}
                  {ownStatus === opt.value ? " ✓" : ""}
                </MenuItem>
              ))}
              <div className="qc-menu-label" role="presentation">
                Clear after
              </div>
              <div className="qc-status-durations" role="group" aria-label="Clear status after">
                {DURATIONS.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    className="qc-status-chip"
                    data-active={durationKey === d.key}
                    onClick={() => pickDuration(d.key)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              {ownStatus !== "available" || ownExpiresAt ? (
                <MenuItem onSelect={resetStatus}>Reset status</MenuItem>
              ) : null}
              <div className="qc-menu-sep" role="separator" />
              <MenuItem
                onSelect={() => {
                  openProfile({
                    user: { id: currentUserId, displayName, avatarUrl: avatarUrl ?? null },
                  });
                  setMenuOpen(false);
                }}
              >
                Profile
              </MenuItem>
            </Menu>
          </Popover>
          <button
            type="button"
            className="qc-iconbtn"
            onClick={() => void handleLogout()}
            aria-label="Log out"
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      {effectiveView === "calendar" ? (
        <CalendarModule
          currentUserId={currentUserId}
          onOpenChannel={(channelId) => {
            setScheduledChannelId(channelId);
            setView("chat");
          }}
        />
      ) : effectiveView === "calls" ? (
        <CallsModule />
      ) : effectiveView === "notifications" ? (
        <NotificationsModule
          currentUserId={currentUserId}
          onOpenSettings={() => setNotifSettingsOpen(true)}
        />
      ) : effectiveView === "settings" ? (
        <SettingsModule
          currentUserId={currentUserId}
          displayName={displayName}
          avatarUrl={avatarUrl}
        />
      ) : (
        <ChatWorkspace
          currentUserId={currentUserId}
          currentUserName={displayName}
          realtimeUrl={realtimeUrl}
          initialChannelId={scheduledChannelId ?? initialChannelId}
        />
      )}
      <NotificationSettingsModal
        open={notifSettingsOpen}
        onClose={() => setNotifSettingsOpen(false)}
      />
    </div>
  );
}
