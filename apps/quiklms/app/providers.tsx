'use client';
/**
 * Client providers — ports of BrandingContext, FeatureContext, ThemeContext
 * plus the i18n provider, mounted in the root layout. Branding sets the
 * --brand-primary/secondary CSS vars; Feature gates UI; Theme toggles dark mode.
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { SessionProvider, useSession } from 'next-auth/react';
import { Toaster } from 'react-hot-toast';
import { api } from '@/lib/api';
import { I18nProvider, useI18n } from '@/lib/i18n';
import type { FeatureSet } from '@/lib/features';

// ── Branding ────────────────────────────────────────────────────────────────
// The defaults MUST match the `:root` values in globals.css (--brand-primary /
// --brand-secondary). They used to be a blue that appeared nowhere else, so
// every first paint flashed blue → indigo the moment the effect below ran.
const DEFAULT_PRIMARY = '#4f46e5';
const DEFAULT_SECONDARY = '#3730a3';

interface Branding { logo: string | null; primaryColor: string; secondaryColor: string; name: string; tenantType: 'corporate' | 'school' | null }
const BrandingCtx = createContext<{ branding: Branding; refresh: () => Promise<void> }>({
  branding: { logo: null, primaryColor: DEFAULT_PRIMARY, secondaryColor: DEFAULT_SECONDARY, name: 'QuikSkill', tenantType: null },
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
  /** Single-role model (quikscale parity). */
  role: string;
  /** The `LmsUser.role` column — same as `role` under the single-role model. */
  primaryRole: string;
  orgId: string | null;
  tenantType: 'corporate' | 'school' | null; managerId: string | null;
  childIds: string[]; isActive: boolean;
}
const UserCtx = createContext<{ user: CurrentUser | null; refresh: () => Promise<void> }>({ user: null, refresh: async () => {} });
export const useCurrentUser = () => useContext(UserCtx);

// Lighten/darken a hex colour by a percent for hover/light brand shades.
// Exported so the super-admin console theme derives the same shades this
// provider does — two implementations would drift.
export function shade(hex: string, percent: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const clamp = (n: number) => Math.min(255, Math.max(0, n));
  const r = clamp(parseInt(m[1], 16) + percent);
  const g = clamp(parseInt(m[2], 16) + percent);
  const b = clamp(parseInt(m[3], 16) + percent);
  return `rgb(${r}, ${g}, ${b})`;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    // SessionProvider is outermost across all QuikIT apps (see root CLAUDE.md
    // "Provider Order"). It also has to sit ABOVE the hydration in AppProviders,
    // which reads `useSession()` to decide whether the authenticated fetches are
    // worth firing at all — a hook that only works inside this provider.
    <SessionProvider>
      <AppProviders>{children}</AppProviders>
    </SessionProvider>
  );
}

function AppProviders({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [branding, setBranding] = useState<Branding>({ logo: null, primaryColor: DEFAULT_PRIMARY, secondaryColor: DEFAULT_SECONDARY, name: 'QuikSkill', tenantType: null });
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

  // PRE-AUTH branding. `/tenants/current` is `requireAuth`-guarded, so gating
  // all branding on an established session (below) left every signed-out
  // surface — /login, and any tenant-subdomain landing — painted in the default
  // indigo, with no tenant logo. The old BrandingContext avoided that by
  // hitting the PUBLIC endpoint FIRST.
  //
  // `/tenants/branding/public` needs no session: it resolves the tenant from
  // where the request came from (x-tenant-key / x-tenant-subdomain / Host), so
  // it cannot leak another tenant's branding, and it answers
  // `{success:true, data:null}` for the apex domain and on any error — which
  // simply leaves the defaults in place. Fields are individually nullable, so
  // each one only overrides when actually set.
  const refreshPublicBranding = useCallback(async () => {
    try {
      const res = await api.get<{ data: { logo: string | null; primaryColor: string | null; secondaryColor: string | null } | null }>('/tenants/branding/public');
      const b = res?.data;
      if (!b) return;
      setBranding((prev) => ({
        ...prev,
        logo: b.logo ?? prev.logo,
        primaryColor: b.primaryColor || prev.primaryColor,
        secondaryColor: b.secondaryColor || prev.secondaryColor,
      }));
    } catch { /* public endpoint unavailable — keep defaults */ }
  }, []);

  const refreshFeatures = useCallback(async () => {
    try {
      const res = await api.get<{ data: { tenantType: 'corporate' | 'school'; features: FeatureSet; availableRoles: string[]; roleLabels: Record<string, string>; config: Record<string, unknown> } }>('/tenants/current/features');
      const d = res.data;
      setFeature({ tenantType: d.tenantType, features: d.features, availableRoles: d.availableRoles, roleLabels: d.roleLabels, config: d.config, loaded: true });
    } catch { setFeature((f) => ({ ...f, loaded: true })); }
  }, []);

  // Mirror the current user into sessionStorage('user') + qs_uid cookie.
  // Many ported pages read user.orgId / _id / managerId / childIds from
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

  // Theme is user-agnostic — the signed-out marketing landing honours it too,
  // so this stays unconditional.
  useEffect(() => {
    const stored = localStorage.getItem('theme');
    const isDark = stored === 'dark';
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  // Identity / branding / features hydration, gated on an ESTABLISHED session.
  //
  // All three endpoints are `requireAuth`-guarded and answer 401 without one,
  // and lib/api.ts turns a 401 into a hard nav to /login, which re-initiates
  // SSO. Firing them unconditionally therefore bounced every signed-out visitor
  // to the public landing page straight into quikit-auth — including the user
  // who had just landed there FROM sign-out, which is what made logout look
  // broken. `/` is now also exempt in lib/api.ts; this is the other half, so
  // the landing stops making three requests that can only ever 401.
  //
  // `status` flips to 'authenticated' once the session resolves (and again
  // after a fresh sign-in), so authenticated users still hydrate exactly once.
  useEffect(() => {
    if (status !== 'authenticated') return;
    void refreshUser();
    void refreshBranding();
    void refreshFeatures();
  }, [status, refreshUser, refreshBranding, refreshFeatures]);

  // …and the signed-out half. Deliberately mutually exclusive with the effect
  // above (`authenticated` vs `unauthenticated`, neither fires while
  // `loading`), so the two can never race: once a session exists,
  // `/tenants/current` remains the single source of truth for branding.
  useEffect(() => {
    if (status !== 'unauthenticated') return;
    void refreshPublicBranding();
  }, [status, refreshPublicBranding]);

  const toggle = useCallback(() => {
    setDark((d) => {
      const next = !d;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  }, []);

  return (
    // The LMS client contexts below hydrate via GET /api/me and friends; they
    // sit under the SessionProvider mounted by `Providers` above.
    <I18nProvider>
      <HtmlLangSync />
      <ThemeCtx.Provider value={{ dark, toggle }}>
        <UserCtx.Provider value={{ user, refresh: refreshUser }}>
          <BrandingCtx.Provider value={{ branding, refresh: refreshBranding }}>
            <FeatureCtx.Provider value={{ ...feature, refresh: refreshFeatures }}>
              {children}
              {/*
                THE app-wide toaster. `react-hot-toast` is imported by ~45
                pages, but a `<Toaster />` was mounted per-page and only on
                some of them — so on every other page `toast.success(...)`
                resolved, updated the store, and rendered nowhere. Silent, and
                indistinguishable from "the save didn't happen".
                Position/duration match the single mount the old `App.tsx`
                had. The per-page toasters are harmless duplicates and are
                left alone; they can be removed opportunistically.
              */}
              <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
            </FeatureCtx.Provider>
          </BrandingCtx.Provider>
        </UserCtx.Provider>
      </ThemeCtx.Provider>
    </I18nProvider>
  );
}

/**
 * Keeps `<html lang>` in step with the selected locale.
 *
 * The root layout is a server component and renders a static `lang="en"`,
 * while the locale lives in localStorage on the client — so the attribute
 * never changed. That made the `html[lang='hi']` … font-family rules in
 * globals.css (how the self-hosted Indic faces get applied) unmatchable, and
 * also mislabelled the page for screen readers on all six non-English locales.
 *
 * Written in an effect, i.e. after hydration, so it introduces no server/client
 * markup mismatch — and <html> already carries `suppressHydrationWarning`.
 */
function HtmlLangSync() {
  const { locale } = useI18n();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
