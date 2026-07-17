"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Avatar,
  Bell,
  Calendar,
  Check,
  Headphones,
  Info,
  Palette,
  Phone,
  Search,
  Settings,
  Shield,
  Sun,
  Switch,
  Users,
} from "@/components/ui";
import { CalendarsSettings } from "@/components/settings/CalendarsSettings";
import { ThemeToggle } from "@/components/settings/ThemeToggle";
import { RolesTab } from "@/app/(dashboard)/settings/roles/components/RolesTab";
import { useMyPermissions } from "@/lib/authz/useMyPermissions";
import { STORAGE_KEY, THEMES } from "./ColorThemePicker";

type SettingsCat =
  | "general"
  | "notifications"
  | "calendars"
  | "account"
  | "devices"
  | "calls"
  | "privacy"
  | "roles";

const CATEGORIES: { key: SettingsCat; label: string; icon: ReactNode }[] = [
  { key: "general", label: "General", icon: <Settings size={17} /> },
  { key: "notifications", label: "Notifications and activity", icon: <Bell size={17} /> },
  { key: "calendars", label: "Calendars", icon: <Calendar size={17} /> },
  { key: "account", label: "Accounts and orgs", icon: <Users size={17} /> },
  { key: "privacy", label: "Privacy", icon: <Info size={17} /> },
  { key: "devices", label: "Devices", icon: <Headphones size={17} /> },
  { key: "calls", label: "Calls", icon: <Phone size={17} /> },
];

// Admin-only section. Appended to the nav only when the caller is a QuikChat
// admin (client-side discoverability; the route + APIs stay requireAdmin-gated).
const ROLES_CAT: { key: SettingsCat; label: string; icon: ReactNode } = {
  key: "roles",
  label: "Roles & Permissions",
  icon: <Shield size={17} />,
};

export interface SettingsModuleProps {
  currentUserId: string;
  displayName: string;
  avatarUrl?: string | null;
  onOpenNotificationSettings?: () => void;
}

function ToggleRow({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="qc-set-row">
      <div className="qc-set-row__text">
        <div className="qc-set-row__title">{title}</div>
        {desc ? <div className="qc-set-row__desc">{desc}</div> : null}
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

export function SettingsModule({
  currentUserId,
  displayName,
  avatarUrl,
  onOpenNotificationSettings,
}: SettingsModuleProps) {
  const [cat, setCat] = useState<SettingsCat>("general");
  const [query, setQuery] = useState("");

  // Admins get the extra "Roles & Permissions" section. Same signal
  // `requireAdmin` reads server-side (loadMyPermissions) — client-hide and
  // server-gate agree. `isAdmin` is false until the fetch resolves, so the item
  // never flashes for non-admins.
  const { isAdmin } = useMyPermissions();
  const visibleCategories = useMemo(
    () => (isAdmin ? [...CATEGORIES, ROLES_CAT] : CATEGORIES),
    [isAdmin],
  );

  // Local (non-persistent) demo state for the General toggles + window options.
  const [autoStart, setAutoStart] = useState(false);
  const [openBg, setOpenBg] = useState(false);
  const [keepRunning, setKeepRunning] = useState(true);
  const [registerChat, setRegisterChat] = useState(true);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [readReceipts, setReadReceipts] = useState(true);
  const [typingIndicators, setTypingIndicators] = useState(true);

  // Accent color theme (persisted to localStorage under STORAGE_KEY; applied via data-accent).
  const [accent, setAccent] = useState("mist");
  useEffect(() => {
    setAccent(document.documentElement.getAttribute("data-accent") || "mist");
  }, []);
  const pickAccent = (key: string) => {
    setAccent(key);
    document.documentElement.setAttribute("data-accent", key);
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {
      // ignore
    }
  };

  const cats = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? visibleCategories.filter((c) => c.label.toLowerCase().includes(q))
      : visibleCategories;
  }, [query, visibleCategories]);

  const activeLabel = visibleCategories.find((c) => c.key === cat)?.label ?? "Settings";

  const colorThemeSection = (
    <section className="qc-set-section">
      <div className="qc-set-section__head">
        <Palette size={16} aria-hidden /> Color theme
      </div>
      <div className="qc-set-section__sub">
        Pick an accent color for the app. Applies everywhere instantly.
      </div>
      <div className="qc-set-themes">
        {THEMES.map((t) => (
          <button
            key={t.key}
            type="button"
            className="qc-set-theme"
            data-active={accent === t.key}
            onClick={() => pickAccent(t.key)}
          >
            <span
              className="qc-set-theme__swatch"
              style={{
                background: `linear-gradient(135deg, ${t.light} 0 50%, ${t.dark} 50% 100%)`,
              }}
              aria-hidden
            />
            <span className="qc-set-theme__name">{t.name}</span>
            {accent === t.key ? (
              <Check size={15} className="qc-set-theme__check" aria-hidden />
            ) : (
              <span className="qc-set-radio" aria-hidden />
            )}
          </button>
        ))}
      </div>
    </section>
  );

  const appearanceSection = (
    <section className="qc-set-section">
      <div className="qc-set-section__head">
        <Sun size={16} aria-hidden /> Appearance
      </div>
      <div className="qc-set-section__body">
        <div className="qc-set-row">
          <div className="qc-set-row__text">
            <div className="qc-set-row__title">Theme</div>
            <div className="qc-set-row__desc">Follows your system setting by default.</div>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </section>
  );

  return (
    <div className="qc-card qc-set">
      <aside className="qc-set-nav">
        <div className="qc-set-title">Settings</div>
        <div className="qc-set-search">
          <Search size={15} aria-hidden />
          <input
            className="qc-input"
            placeholder="Find a setting"
            aria-label="Find a setting"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <nav className="qc-set-navlist" aria-label="Settings categories">
          {cats.map((c) => (
            <button
              key={c.key}
              type="button"
              className="qc-set-navitem"
              data-active={cat === c.key}
              onClick={() => setCat(c.key)}
            >
              <span className="qc-set-navitem__icon">{c.icon}</span>
              {c.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="qc-set-content">
        <header className="qc-set-head">
          <h1 className="qc-set-htitle">{activeLabel}</h1>
        </header>
        {cat === "roles" ? (
          // Full-bleed: RolesTab brings its own two-pane chrome. `.qc-set-embed`
          // clamps its `h-screen` root to the content area (see theme.css) so it
          // doesn't overflow the panel — reused verbatim, no restyle.
          <div className="qc-set-embed">
            <RolesTab />
          </div>
        ) : (
        <div className="qc-set-scroll">
          {cat === "general" ? (
            <>
              <section className="qc-set-section">
                <div className="qc-set-section__head">
                  <Settings size={16} aria-hidden /> System
                </div>
                <div className="qc-set-section__body">
                  <ToggleRow
                    title="Auto-start QuikChat"
                    checked={autoStart}
                    onChange={setAutoStart}
                  />
                  <ToggleRow
                    title="Open application in background"
                    checked={openBg}
                    onChange={setOpenBg}
                  />
                  <ToggleRow
                    title="On close, keep the application running"
                    checked={keepRunning}
                    onChange={setKeepRunning}
                  />
                  <ToggleRow
                    title="Register QuikChat as the chat app for the workspace"
                    checked={registerChat}
                    onChange={setRegisterChat}
                  />
                </div>
              </section>

              {appearanceSection}
              {colorThemeSection}

              <section className="qc-set-section">
                <div className="qc-set-section__head">
                  <Calendar size={16} aria-hidden /> Meeting
                </div>
                <div className="qc-set-section__body">
                  <ToggleRow
                    title="Ask me to confirm when I leave a meeting"
                    checked={confirmLeave}
                    onChange={setConfirmLeave}
                  />
                </div>
              </section>
            </>
          ) : null}

          {cat === "notifications" ? (
            <section className="qc-set-section">
              <div className="qc-set-section__head">
                <Bell size={16} aria-hidden /> Notifications
              </div>
              <div className="qc-set-section__body">
                <div className="qc-set-row">
                  <div className="qc-set-row__text">
                    <div className="qc-set-row__title">Notification preferences</div>
                    <div className="qc-set-row__desc">
                      Choose what you get notified about and how.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="qc-btn qc-btn--primary"
                    onClick={() => onOpenNotificationSettings?.()}
                  >
                    Manage
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {cat === "calendars" ? (
            <section className="qc-set-section">
              <div className="qc-set-section__head">
                <Calendar size={16} aria-hidden /> Calendars
              </div>
              <div className="qc-set-section__body">
                <CalendarsSettings />
              </div>
            </section>
          ) : null}

          {cat === "account" ? (
            <section className="qc-set-section">
              <div className="qc-set-section__head">
                <Users size={16} aria-hidden /> Account
              </div>
              <div className="qc-set-section__body">
                <div className="qc-account__id">
                  <Avatar name={displayName} id={currentUserId} avatarUrl={avatarUrl} size={48} />
                  <div>
                    <div className="qc-set-row__title">{displayName}</div>
                    <div className="qc-set-row__desc">
                      Your name &amp; avatar are managed by QuikIT.
                    </div>
                  </div>
                </div>
                <a className="qc-btn" href="/api/auth/signout?callbackUrl=/login">
                  Log out
                </a>
              </div>
            </section>
          ) : null}

          {cat === "privacy" ? (
            <section className="qc-set-section">
              <div className="qc-set-section__head">
                <Info size={16} aria-hidden /> Privacy
              </div>
              <div className="qc-set-section__body">
                <ToggleRow
                  title="Read receipts"
                  desc="Let others know when you've read their messages."
                  checked={readReceipts}
                  onChange={setReadReceipts}
                />
                <ToggleRow
                  title="Typing indicators"
                  desc="Show others when you're typing."
                  checked={typingIndicators}
                  onChange={setTypingIndicators}
                />
              </div>
            </section>
          ) : null}

          {cat === "devices" ? (
            <section className="qc-set-section">
              <div className="qc-set-section__head">
                <Headphones size={16} aria-hidden /> Devices
              </div>
              <div className="qc-set-section__body">
                <div className="qc-set-row">
                  <div className="qc-set-row__text">
                    <div className="qc-set-row__title">Audio device</div>
                    <div className="qc-set-row__desc">Microphone and speaker used for calls.</div>
                  </div>
                  <span className="qc-set-row__value">6 - USB Audio 2.0</span>
                </div>
              </div>
            </section>
          ) : null}

          {cat === "calls" ? (
            <section className="qc-set-section">
              <div className="qc-set-section__head">
                <Phone size={16} aria-hidden /> Calls
              </div>
              <div className="qc-set-section__body">
                <div className="qc-set-row">
                  <div className="qc-set-row__text">
                    <div className="qc-set-row__title">Call forwarding</div>
                    <div className="qc-set-row__desc">Where your calls ring.</div>
                  </div>
                  <span className="qc-set-row__value">Don&apos;t forward</span>
                </div>
              </div>
            </section>
          ) : null}
        </div>
        )}
      </section>
    </div>
  );
}
