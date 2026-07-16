"use client";

import { useEffect, useState } from "react";
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
  Settings,
  Sun,
  ToastProvider,
} from "@/components/ui";
import { NotificationSettingsModal } from "@/components/notifications/NotificationSettingsModal";
import {
  NotificationProvider,
  useNotifications,
} from "@/components/notifications/NotificationProvider";
import { ProfileProvider, useProfile } from "@/components/profile/ProfileProvider";
import { DesktopBridge } from "@/components/desktop/DesktopBridge";
import { useDisabledModules } from "@/lib/authz/useDisabledModules";
import { isModuleEnabled } from "@quikit/shared/moduleRegistry";
import { CalendarModule } from "./CalendarModule";
import { CallsModule } from "./CallsModule";
import { ChatWorkspace } from "./ChatWorkspace";
import { NotificationsModule } from "./NotificationsModule";
import { SettingsModule } from "./SettingsModule";

export interface ChatShellProps {
  currentUserId: string;
  displayName: string;
  avatarUrl?: string | null;
  workspaceName: string;
  orgId: string;
  realtimeUrl: string;
  initialChannelId?: string;
}

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
  const [notifSettingsOpen, setNotifSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<"chat" | "calendar" | "calls" | "notifications" | "settings">(
    "chat",
  );

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
  useEffect(() => {
    let saved = "mist";
    try {
      saved = localStorage.getItem("qc-accent") || "mist";
    } catch {
      // ignore
    }
    document.documentElement.setAttribute("data-accent", saved);
  }, []);

  const openSettings = () => {
    setView("settings");
    setMenuOpen(false);
  };

  return (
    <div className="qc-frame">
      <DesktopBridge />
      <aside className="qc-rail" aria-label="Primary navigation">
        <div className="qc-rail__logo" title={workspaceName}>
          <img src="/quikchat-logo-02.png" alt={workspaceName} />
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
          <Popover
            open={menuOpen}
            onOpenChange={setMenuOpen}
            placement="top"
            label="Account menu"
            trigger={
              <button type="button" className="qc-avatar-btn" aria-label="Account menu">
                <Avatar name={displayName} id={currentUserId} avatarUrl={avatarUrl} size={30} />
              </button>
            }
          >
            <Menu label="Account">
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
              <MenuItem icon={<Settings size={14} />} onSelect={() => openSettings()}>
                Settings
              </MenuItem>
              <MenuItem icon={<Sun size={14} />} onSelect={() => openSettings()}>
                Theme
              </MenuItem>
            </Menu>
          </Popover>
          <a
            className="qc-iconbtn"
            href="/api/auth/signout?callbackUrl=/login"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut size={16} />
          </a>
        </div>
      </aside>
      {effectiveView === "calendar" ? (
        <CalendarModule currentUserId={currentUserId} />
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
          onOpenNotificationSettings={() => setNotifSettingsOpen(true)}
        />
      ) : (
        <ChatWorkspace
          currentUserId={currentUserId}
          currentUserName={displayName}
          workspaceName={workspaceName}
          realtimeUrl={realtimeUrl}
          initialChannelId={initialChannelId}
        />
      )}
      <NotificationSettingsModal
        open={notifSettingsOpen}
        onClose={() => setNotifSettingsOpen(false)}
      />
    </div>
  );
}
