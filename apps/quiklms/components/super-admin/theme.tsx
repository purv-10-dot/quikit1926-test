'use client';
/**
 * Console theme — the super-admin's own accent colour.
 *
 * Tenant admins get `/branding`, which writes `Org.branding` and re-skins the
 * portal for every user in that organisation. A super-admin has no org
 * (`LmsUser.orgId` is nullable precisely for them), so `/tenants/current` 404s
 * and the brand vars stay at the QuikLMS default. This is the equivalent for
 * that role: the same accent controls, scoped so the change cannot reach a
 * tenant.
 *
 * Two properties follow from where the value is stored and applied:
 *
 *  - **Stored in localStorage, not the database.** There is no server-side
 *    write, so there is no path by which one super-admin's preference lands on
 *    another account or on a tenant portal. It is a per-browser preference, the
 *    same class of thing as the sidebar-collapse and dark-mode flags this app
 *    already keeps there. The trade-off is that it does not follow the user to
 *    another browser or machine.
 *  - **Applied on a wrapper element, not `document.documentElement`.** Custom
 *    properties inherit, so re-declaring them on a node inside `(super-admin)`
 *    re-tints that subtree — sidebar, topbar, account chip, focus rings, page
 *    heroes — and nothing else. It also avoids racing the root provider, which
 *    writes the same vars on `:root` from tenant branding.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type CSSProperties, type ReactNode,
} from 'react';
import { shade } from '@/app/providers';

export interface ConsoleTheme {
  /** Preset id, or `''` when the colours were picked by hand. */
  presetId: string;
  primary: string;
  secondary: string;
}

export interface ConsolePreset extends ConsoleTheme {
  presetId: string;
  name: string;
  hint: string;
}

/** Indigo → violet: what the hardcoded page gradients used to be. */
export const DEFAULT_CONSOLE_THEME: ConsoleTheme = {
  presetId: 'violet',
  primary: '#4f46e5',
  secondary: '#7c3aed',
};

export const CONSOLE_PRESETS: ConsolePreset[] = [
  { presetId: 'violet',   name: 'Violet',   hint: 'Indigo → Violet',  primary: '#4f46e5', secondary: '#7c3aed' },
  { presetId: 'midnight', name: 'Midnight', hint: 'Slate → Indigo',   primary: '#1e293b', secondary: '#4338ca' },
  { presetId: 'ocean',    name: 'Ocean',    hint: 'Blue → Cyan',      primary: '#0284c7', secondary: '#06b6d4' },
  { presetId: 'forest',   name: 'Forest',   hint: 'Emerald → Teal',   primary: '#047857', secondary: '#0d9488' },
  { presetId: 'ember',    name: 'Ember',    hint: 'Orange → Rose',    primary: '#ea580c', secondary: '#e11d48' },
  { presetId: 'plum',     name: 'Plum',     hint: 'Fuchsia → Purple', primary: '#a21caf', secondary: '#7e22ce' },
  { presetId: 'graphite', name: 'Graphite', hint: 'Neutral slate',    primary: '#334155', secondary: '#475569' },
  { presetId: 'royal',    name: 'Royal',    hint: 'Solid blue',       primary: '#2563eb', secondary: '#2563eb' },
];

const STORAGE_KEY = 'qs_sa_console_theme';

// ── Colour helpers ──────────────────────────────────────────────────────────

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Accepts `#abc` / `#aabbcc` (with or without `#`); returns `null` otherwise. */
export function normalizeHex(value: string): string | null {
  const v = value.trim().replace(/^(?!#)/, '#').toLowerCase();
  if (!HEX.test(v)) return null;
  return v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v;
}

function channels(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? '#000000';
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

/**
 * Perceived brightness (ITU-R BT.601). Used only to decide white vs near-black
 * ink, which is what the tenant branding page does too — kept identical so the
 * two pages agree about which accents count as "light".
 */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/** Readable ink over `hex`. */
export function inkOn(hex: string): string {
  return luminance(hex) >= 145 ? '#111827' : '#ffffff';
}

/**
 * The CSS custom properties a theme resolves to. Exported so the appearance
 * page can render a live preview from a draft theme without committing it.
 */
export function consoleThemeVars(theme: ConsoleTheme): CSSProperties {
  const primary = normalizeHex(theme.primary) ?? DEFAULT_CONSOLE_THEME.primary;
  const secondary = normalizeHex(theme.secondary) ?? primary;

  // The hero is a gradient, so the ink has to clear BOTH stops — take the
  // brighter one, since that is where white would fail first.
  const on = inkOn(luminance(primary) >= luminance(secondary) ? primary : secondary);

  return {
    '--brand-primary': primary,
    '--brand-secondary': secondary,
    '--brand-primary-hover': shade(primary, -15),
    '--brand-primary-light': shade(primary, 40),
    '--brand-on': on,
    // A solid chip sits on `--brand-on`; its label is the accent when that chip
    // is white, and white when the chip is dark (which only happens for light
    // accents, where white-on-dark is the readable pairing).
    '--brand-on-solid-fg': on === '#ffffff' ? primary : '#ffffff',
  } as CSSProperties;
}

// ── Storage ─────────────────────────────────────────────────────────────────

function readStored(): ConsoleTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONSOLE_THEME;
    const parsed = JSON.parse(raw) as Partial<ConsoleTheme>;
    const primary = normalizeHex(String(parsed.primary ?? ''));
    const secondary = normalizeHex(String(parsed.secondary ?? ''));
    if (!primary || !secondary) return DEFAULT_CONSOLE_THEME;
    return { presetId: typeof parsed.presetId === 'string' ? parsed.presetId : '', primary, secondary };
  } catch {
    // Corrupt or unavailable storage (private mode) must not blank the console.
    return DEFAULT_CONSOLE_THEME;
  }
}

// ── Context ─────────────────────────────────────────────────────────────────

interface ConsoleThemeState {
  theme: ConsoleTheme;
  setTheme: (next: ConsoleTheme) => void;
  reset: () => void;
  /** False until the stored value has been read — the first paint is the default. */
  ready: boolean;
}

const ConsoleThemeCtx = createContext<ConsoleThemeState>({
  theme: DEFAULT_CONSOLE_THEME,
  setTheme: () => {},
  reset: () => {},
  ready: false,
});

export const useConsoleTheme = () => useContext(ConsoleThemeCtx);

export function ConsoleThemeProvider({ children }: { children: ReactNode }) {
  // Starts at the default so the server and the first client render agree;
  // the stored value lands in the effect below. Same shape as the tenant
  // branding hydration, which also paints default-then-brand.
  const [theme, setThemeState] = useState<ConsoleTheme>(DEFAULT_CONSOLE_THEME);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setThemeState(readStored());
    setReady(true);
  }, []);

  // Keep other tabs of the console in sync — `storage` only fires in the tabs
  // that did NOT write, which is exactly the set that needs telling.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setThemeState(readStored());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((next: ConsoleTheme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Preference is lost on reload, but the session still re-tints.
    }
  }, []);

  const reset = useCallback(() => {
    setThemeState(DEFAULT_CONSOLE_THEME);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing to clean up */
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme, reset, ready }), [theme, setTheme, reset, ready]);
  const vars = useMemo(() => consoleThemeVars(theme), [theme]);

  return (
    <ConsoleThemeCtx.Provider value={value}>
      {/* `display: contents` — the vars inherit into the shell without adding a
          box that would break AppShell's `h-screen` flex layout. */}
      <div className="contents" style={vars}>
        {children}
      </div>
    </ConsoleThemeCtx.Provider>
  );
}
