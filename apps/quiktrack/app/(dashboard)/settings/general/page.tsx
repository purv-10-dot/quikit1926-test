"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Loader2, Monitor, Moon, Sun } from "lucide-react";
import { THEME_MODES, type ThemeMode } from "@/lib/validation/settings";

const OPTIONS: {
  value: ThemeMode;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  { value: "light", label: "Light", description: "Bright UI for daytime work.", icon: Sun },
  { value: "dark", label: "Dark", description: "Reduced glare for low-light environments.", icon: Moon },
  { value: "system", label: "System", description: "Follow your operating-system preference.", icon: Monitor },
];

const VALID = new Set<string>(THEME_MODES);
function asThemeMode(value: unknown, fallback: ThemeMode): ThemeMode {
  return typeof value === "string" && VALID.has(value) ? (value as ThemeMode) : fallback;
}

export default function GeneralSettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ThemeMode | null>(null);
  const [persisted, setPersisted] = useState<ThemeMode>("system");
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/company");
      const json = (await res.json()) as {
        success?: boolean;
        data?: { themeMode?: string | null };
      };
      if (json.success) {
        const mode = asThemeMode(json.data?.themeMode, "system");
        setPersisted(mode);
        setTheme(mode);
      }
    } catch {
      setToast({ kind: "error", msg: "Couldn't load your saved theme — using default." });
    } finally {
      setLoading(false);
    }
  }, [setTheme]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  async function handleSelect(next: ThemeMode) {
    if (next === persisted || saving) return;
    const previous = persisted;
    setSaving(next);
    setPersisted(next);
    setTheme(next);
    try {
      const res = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeMode: next }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to save theme");
      }
      setToast({ kind: "success", msg: "Theme saved" });
    } catch (error: unknown) {
      setPersisted(previous);
      setTheme(previous);
      const message = error instanceof Error ? error.message : "Failed to save theme";
      setToast({ kind: "error", msg: message });
    } finally {
      setSaving(null);
    }
  }

  const current: ThemeMode = asThemeMode(theme, persisted);

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-3xl px-8 py-8">
        <header className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">General Settings</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Preferences saved to your account and synced across devices.
          </p>
        </header>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Appearance</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Choose how QuikTrack looks. &quot;System&quot; follows your OS setting and updates automatically.
              </p>
            </div>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-label="Loading" />
            ) : null}
          </div>

          <div
            role="radiogroup"
            aria-label="Theme"
            aria-busy={loading}
            className="grid gap-3 sm:grid-cols-3"
          >
            {OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = current === opt.value;
              const isSaving = saving === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={loading || Boolean(saving)}
                  onClick={() => handleSelect(opt.value)}
                  className={`relative flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
                    selected
                      ? "border-accent-500 bg-accent-50 dark:border-accent-400 dark:bg-accent-900/30"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600 dark:hover:bg-gray-700/40"
                  }`}
                >
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
                      selected
                        ? "bg-accent-600 text-white"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{opt.label}</span>
                  <span className="text-xs leading-snug text-gray-500 dark:text-gray-400">{opt.description}</span>
                  {opt.value === "system" && resolvedTheme ? (
                    <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      Now: {resolvedTheme}
                    </span>
                  ) : null}
                  {selected ? (
                    <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-600 text-white">
                      {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    </span>
                  ) : isSaving ? (
                    <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-200">
                      <Loader2 className="h-3 w-3 animate-spin" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg"
          style={{
            backgroundColor: toast.kind === "success" ? "#0f172a" : "#b91c1c",
          }}
        >
          {toast.msg}
        </div>
      ) : null}
    </div>
  );
}
