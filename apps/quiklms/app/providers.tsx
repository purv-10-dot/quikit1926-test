'use client';
/**
 * Client providers — ports of BrandingContext, FeatureContext, ThemeContext
 * plus the i18n provider, mounted in the root layout. Branding sets the
 * --brand-primary/secondary CSS vars; Feature gates UI; Theme toggles dark mode.
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';
import { api } from '@/lib/api';
import { I18nProvider } from '@/lib/i18n';
import type { FeatureSet } from '@/lib/features';

// ── Branding ────────────────────────────────────────────────────────────────
interface Branding { logo: string | null; primaryColor: string; secondaryColor: string; name: string; tenantType: 'corporate' | 'school' | null }
const BrandingCtx = createContext<{ branding: Branding; refresh: () => Promise<void> }>({
  branding: { logo: null, primaryColor: '#3B82F6', secondaryColor: '#1E40AF', name: 'QuikSkill', tenantType: null },
  refresh: async () => {},
});
export const useBranding = () => useContext(BrandingCtx);

// ── Features ──────────────────────────────────────────────────────────────────
interface FeatureState { tenantType: 'corporate' | 'school' | null; features: Partial<FeatureSet>; availableRoles: string[]; roleLabels: Record<string, string>; config: Record<string, unknown>; loaded: boolean; refresh: () => Promise<void> }
const FeatureCtx = createContext<FeatureState>({ tenantType: null, features: {}, availableRoles: [], roleLabels: {}, config: {}, loaded: false, refresh: async () => {} });
export const useFeatures = () => useContext(FeatureCtx);

// ── Theme ─────────────────────────────────────────────────────────────────────
const ThemeCtx = createContext<{ dark: boolean; toggle: () => void }>({ dark: false, toggle: () => {} });
export const useTheme = () => useContext(ThemeCtx);

// ── Current user ────────────────────────────────────────────────────────────
export interface CurrentUser {
  id: string; _id: string; email: string; firstName: string; lastName: string;
  role: string; secondaryRole: string | null; tenantId: string | null;
  tenantType: 'corporate' | 'school' | null; managerId: string | null;
  childIds: string[]; isActive: boolean;
}
const UserCtx = createContext<{ user: CurrentUser | null; refresh: () => Promise<void> }>({ user: null, refresh: async () => {} });
export const useCurrentUser = () => useContext(UserCtx);

// Lighten/darken a hex colour by a percent for hover/light brand shades.
function shade(hex: string, percent: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const clamp = (n: number) => Math.min(255, Math.max(0, n));
  const r = clamp(parseInt(m[1], 16) + percent);
  const g = clamp(parseInt(m[2], 16) + percent);
  const b = clamp(parseInt(m[3], 16) + percent);
  return `rgb(${r}, ${g}, ${b})`;
}

export function Providers({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>({ logo: null, primaryColor: '#3B82F6', secondaryColor: '#1E40AF', name: 'QuikSkill', tenantType: null });
  const [feature, setFeature] = useState<Omit<FeatureState, 'refresh'>>({ tenantType: null, features: {}, availableRoles: [], roleLabels: {}, config: {}, loaded: false });
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [dark, setDark] = useState(false);

  const refreshBranding = useCallback(async () => {
    try {
      const res = await api.get<{ data: { name: string; tenantType: 'corporate' | 'school'; branding: { logo: string | null; primaryColor: string; secondaryColor: string } } }>('/tenants/current');
      const d = res.data;
      setBranding({ logo: d.branding.logo, primaryColor: d.branding.primaryColor, secondaryColor: d.branding.secondaryColor, name: d.name, tenantType: d.tenantType });
    } catch { /* not authed / no tenant */ }
  }, []);

  const refreshFeatures = useCallback(async () => {
    try {
      const res = await api.get<{ data: { tenantType: 'corporate' | 'school'; features: FeatureSet; availableRoles: string[]; roleLabels: Record<string, string>; config: Record<string, unknown> } }>('/tenants/current/features');
      const d = res.data;
      setFeature({ tenantType: d.tenantType, features: d.features, availableRoles: d.availableRoles, roleLabels: d.roleLabels, config: d.config, loaded: true });
    } catch { setFeature((f) => ({ ...f, loaded: true })); }
  }, []);

  // Mirror the current user into sessionStorage('user') + qs_uid cookie.
  // Many ported pages read user.tenantId / _id / managerId / childIds from
  // sessionStorage; under cookie auth this was never populated. Source of
  // truth is GET /api/me (derived from the auth cookie server-side).
  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get<{ data: CurrentUser }>('/me');
      const u = res.data;
      if (u?.id) {
        setUser(u);
        sessionStorage.setItem('user', JSON.stringify(u));
        document.cookie = `qs_uid=${u.id}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      }
    } catch { /* not authed / no role selected */ }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', branding.primaryColor);
    root.style.setProperty('--brand-secondary', branding.secondaryColor);
    root.style.setProperty('--brand-primary-hover', shade(branding.primaryColor, -15));
    root.style.setProperty('--brand-primary-light', shade(branding.primaryColor, 40));
  }, [branding.primaryColor, branding.secondaryColor]);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    const isDark = stored === 'dark';
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
    void refreshUser();
    void refreshBranding();
    void refreshFeatures();
  }, [refreshUser, refreshBranding, refreshFeatures]);

  const toggle = useCallback(() => {
    setDark((d) => {
      const next = !d;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  }, []);

  return (
    // SessionProvider is outermost across all QuikIT apps (see root CLAUDE.md
    // "Provider Order"). It exposes the centralized NextAuth session to the LMS
    // client contexts below, which continue to hydrate via GET /api/me.
    <SessionProvider>
      <I18nProvider>
        <ThemeCtx.Provider value={{ dark, toggle }}>
          <UserCtx.Provider value={{ user, refresh: refreshUser }}>
            <BrandingCtx.Provider value={{ branding, refresh: refreshBranding }}>
              <FeatureCtx.Provider value={{ ...feature, refresh: refreshFeatures }}>{children}</FeatureCtx.Provider>
            </BrandingCtx.Provider>
          </UserCtx.Provider>
        </ThemeCtx.Provider>
      </I18nProvider>
    </SessionProvider>
  );
}
