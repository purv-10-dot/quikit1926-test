'use client';
/**
 * Console appearance — the super-admin's counterpart to the tenant `/branding`
 * page.
 *
 * The difference that shapes the whole page: a tenant admin's choice is written
 * to `Org.branding` and re-skins the portal for every user in that org. A
 * super-admin has no org, and this must NEVER touch a tenant, so the choice
 * lives only in this browser (see components/super-admin/theme.tsx). The copy on
 * the page says so plainly — the scope is the point, not a footnote.
 *
 * There is deliberately no logo control here (unlike the tenant page): the
 * console logo is the product's, not a customer's, so only the accent is
 * adjustable.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Palette, Check, RotateCcw, ToggleLeft, ToggleRight, Eye, Info,
  LayoutDashboard, Building2, BarChart3,
} from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { PageHero } from '@/components/super-admin/PageHero';
import {
  CONSOLE_PRESETS, DEFAULT_CONSOLE_THEME, consoleThemeVars, inkOn, normalizeHex,
  useConsoleTheme, type ConsoleTheme,
} from '@/components/super-admin/theme';

export default function AppearancePage() {
  const { theme, setTheme, reset, ready } = useConsoleTheme();

  // Draft state — edits are previewed live but only committed on Save, so a
  // half-typed hex never blanks the whole console mid-keystroke.
  const [draft, setDraft] = useState<ConsoleTheme>(theme);
  const [solid, setSolid] = useState(theme.primary === theme.secondary);
  const [dirty, setDirty] = useState(false);

  // Adopt the stored theme once it has hydrated (the provider paints the
  // default on the first render, same as the tenant branding page).
  useEffect(() => {
    if (!ready) return;
    setDraft(theme);
    setSolid(theme.primary === theme.secondary);
    setDirty(false);
  }, [ready, theme]);

  const previewVars = useMemo(() => consoleThemeVars(draft), [draft]);

  const applyPreset = (presetId: string) => {
    const p = CONSOLE_PRESETS.find((x) => x.presetId === presetId);
    if (!p) return;
    setDraft({ presetId: p.presetId, primary: p.primary, secondary: p.secondary });
    setSolid(p.primary === p.secondary);
    setDirty(true);
  };

  const changePrimary = (raw: string) => {
    setDraft((d) => ({
      presetId: '',
      primary: raw,
      secondary: solid ? raw : d.secondary,
    }));
    setDirty(true);
  };

  const changeSecondary = (raw: string) => {
    setDraft((d) => ({ ...d, presetId: '', secondary: raw }));
    setDirty(true);
  };

  const toggleSolid = () => {
    setSolid((s) => {
      const next = !s;
      if (next) setDraft((d) => ({ ...d, presetId: '', secondary: d.primary }));
      setDirty(true);
      return next;
    });
  };

  const handleSave = () => {
    const primary = normalizeHex(draft.primary);
    const secondary = normalizeHex(solid ? draft.primary : draft.secondary);
    if (!primary || !secondary) {
      toast.error('Enter valid hex colours (e.g. #4f46e5) before saving.');
      return;
    }
    setTheme({ presetId: draft.presetId, primary, secondary });
    setDirty(false);
    toast.success('Console theme saved — it applies only to this browser.');
  };

  const handleReset = () => {
    reset();
    setDraft(DEFAULT_CONSOLE_THEME);
    setSolid(DEFAULT_CONSOLE_THEME.primary === DEFAULT_CONSOLE_THEME.secondary);
    setDirty(false);
    toast.success('Reverted to the default console theme.');
  };

  const activePreset = draft.presetId;

  return (
    <div className="space-y-6 pb-12">
      <Toaster position="top-right" />

      <PageHero
        icon={Palette}
        title="Console"
        highlight="Appearance"
        badge="Local"
        subtitle="Recolour your super-admin console. This preference is saved to this browser only and never changes any tenant's portal."
        actions={
          <>
            <button
              type="button"
              onClick={handleReset}
              className="qs-hero-btn qs-hero-btn-ghost"
            >
              <RotateCcw className="size-4" />
              Reset
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty}
              className="qs-hero-btn qs-hero-btn-solid"
            >
              <Check className="size-4" />
              {dirty ? 'Save theme' : 'Saved'}
            </button>
          </>
        }
      />

      {/* Scope notice — this is the one thing a super-admin must understand. */}
      <div className="flex items-start gap-3 rounded-2xl border border-info/30 bg-info-soft/60 px-5 py-4">
        <Info className="mt-0.5 size-5 shrink-0 text-info" />
        <p className="text-sm font-medium text-fg">
          This theme is local to your browser. It re-tints the super-admin
          console — sidebar, top bar, page headers and buttons — for you only.
          Tenant portals keep their own branding, which tenant admins control on
          their <span className="font-semibold">Branding</span> page.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Controls */}
        <div className="space-y-6 lg:col-span-8">
          {/* Presets */}
          <section className="rounded-3xl border border-line bg-surface p-6 shadow-sm sm:p-8">
            <h2 className="mb-6 flex items-center gap-3 text-base font-bold text-fg">
              <span className="grid size-9 place-items-center rounded-xl bg-surface-muted text-fg-muted">
                <Palette className="size-5" />
              </span>
              Presets
            </h2>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {CONSOLE_PRESETS.map((p) => {
                const active = activePreset === p.presetId;
                return (
                  <button
                    key={p.presetId}
                    type="button"
                    onClick={() => applyPreset(p.presetId)}
                    className={`group relative rounded-2xl border-2 p-4 text-left transition-all ${
                      active
                        ? 'border-[var(--brand-primary)] bg-[color-mix(in_srgb,var(--brand-primary)_8%,transparent)] shadow-md'
                        : 'border-line hover:border-line-strong hover:bg-surface-muted'
                    }`}
                  >
                    {active && (
                      <span className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-[var(--brand-primary)] text-white shadow-lg">
                        <Check className="size-4" />
                      </span>
                    )}
                    <div className="mb-3 flex items-center gap-2">
                      <span
                        className="size-9 rounded-xl border-2 border-white shadow-inner dark:border-white/20"
                        style={{ backgroundColor: p.primary }}
                      />
                      {p.primary !== p.secondary && (
                        <span
                          className="size-9 rounded-xl border-2 border-white shadow-inner dark:border-white/20"
                          style={{ backgroundColor: p.secondary }}
                        />
                      )}
                    </div>
                    <p className="text-[13px] font-bold text-fg">{p.name}</p>
                    <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-fg-subtle">
                      {p.hint}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Custom colours */}
          <section className="rounded-3xl border border-line bg-surface p-6 shadow-sm sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-3 text-base font-bold text-fg">
                <span className="grid size-9 place-items-center rounded-xl bg-surface-muted text-fg-muted">
                  <Palette className="size-5" />
                </span>
                Custom colours
              </h2>
              <button
                type="button"
                onClick={toggleSolid}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                  solid
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white shadow-sm'
                    : 'border-line text-fg-muted hover:border-line-strong'
                }`}
              >
                {solid ? <ToggleRight className="size-4" /> : <ToggleLeft className="size-4" />}
                Solid
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <ColorField
                label="Primary"
                hint="Main accent"
                value={draft.primary}
                onChange={changePrimary}
              />
              <div className={solid ? 'pointer-events-none opacity-40 transition-opacity' : 'transition-opacity'}>
                <ColorField
                  label="Secondary"
                  hint="Gradient end"
                  value={draft.secondary}
                  onChange={changeSecondary}
                />
              </div>
            </div>
          </section>
        </div>

        {/* Live preview — mirrors the real console chrome, driven by the draft. */}
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-6">
            <section className="overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-sm sm:p-8">
              <h2 className="mb-6 flex items-center gap-3 text-base font-bold text-fg">
                <span className="grid size-9 place-items-center rounded-xl bg-surface-muted text-fg-muted">
                  <Eye className="size-5" />
                </span>
                Live preview
              </h2>

              <div
                style={previewVars}
                className="overflow-hidden rounded-2xl border border-line shadow-lg"
              >
                {/* Mini hero */}
                <div className="qs-hero px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="qs-hero-icon grid size-8 place-items-center rounded-lg">
                      <LayoutDashboard className="size-4" aria-hidden />
                    </span>
                    <div>
                      <p className="text-[13px] font-bold leading-none">
                        Platform <span className="qs-hero-accent">Console</span>
                      </p>
                      <p className="qs-hero-sub mt-1 text-[10px] font-medium leading-none">
                        Preview of your accent
                      </p>
                    </div>
                  </div>
                </div>

                {/* Mini body */}
                <div className="space-y-3 bg-canvas p-4">
                  <div className="grid grid-cols-2 gap-2">
                    {[{ i: Building2, v: '128', l: 'Tenants' }, { i: BarChart3, v: '94%', l: 'Uptime' }].map(
                      (c, idx) => {
                        const Icon = c.i;
                        return (
                          <div key={idx} className="rounded-xl border border-line bg-surface p-3">
                            <Icon
                              className="mb-1.5 size-4"
                              style={{ color: 'var(--brand-primary)' }}
                              aria-hidden
                            />
                            <p className="text-lg font-black text-fg tabular">{c.v}</p>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-fg-subtle">
                              {c.l}
                            </p>
                          </div>
                        );
                      },
                    )}
                  </div>

                  <button
                    type="button"
                    className="w-full rounded-xl py-2.5 text-xs font-bold shadow-sm"
                    style={{
                      background: solid
                        ? 'var(--brand-primary)'
                        : 'linear-gradient(112deg, var(--brand-primary), var(--brand-secondary))',
                      color: inkOn(draft.primary),
                    }}
                  >
                    Primary action
                  </button>
                  <p
                    className="text-center text-[11px] font-bold underline"
                    style={{ color: 'var(--brand-primary)' }}
                  >
                    Secondary link
                  </p>
                </div>
              </div>

              <p className="mt-6 text-center text-[11px] font-medium leading-relaxed text-fg-muted">
                Changes apply the moment you save, across every super-admin page.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  // The native picker needs a valid 6-digit hex; fall back to black while the
  // text field holds a partial value so it never throws.
  const swatch = normalizeHex(value) ?? '#000000';
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="px-1 text-xs font-bold uppercase tracking-wider text-fg-muted">
          {label}
        </label>
        <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-fg-subtle">
          {hint}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
          className="size-14 shrink-0 cursor-pointer rounded-2xl border-4 border-surface p-1 shadow-md ring-1 ring-line"
          aria-label={`${label} colour picker`}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-line bg-surface-muted px-4 py-3 font-mono text-sm font-bold uppercase text-fg focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--brand-primary)_35%,transparent)]"
          spellCheck={false}
          aria-label={`${label} hex value`}
        />
      </div>
    </div>
  );
}
