"use client";

import { useCallback, useEffect, useState } from "react";
import { ToggleSwitch } from "@quikit/ui";

interface Settings {
  inAppEnabled: boolean;
  emailInstantEnabled: boolean;
}

const DEFAULTS: Settings = { inAppEnabled: true, emailInstantEnabled: true };

export default function NotificationSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [savingKey, setSavingKey] = useState<keyof Settings | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/settings");
      const json = (await res.json()) as { success?: boolean; data?: Settings };
      if (json.success && json.data) setSettings(json.data);
    } catch {
      setToast({ kind: "error", msg: "Couldn't load your notification settings — using defaults." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  async function handleToggle(key: keyof Settings, next: boolean) {
    if (savingKey) return;
    const previous = settings;
    setSavingKey(key);
    setSettings((s) => ({ ...s, [key]: next }));
    try {
      const res = await fetch("/api/notifications/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
      const json = (await res.json()) as { success?: boolean; data?: Settings; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to save notification settings");
      }
      if (json.data) setSettings(json.data);
    } catch (error: unknown) {
      setSettings(previous);
      const message = error instanceof Error ? error.message : "Failed to save notification settings";
      setToast({ kind: "error", msg: message });
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-3xl px-8 py-8">
        <header className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Notification Settings</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Choose how QuikTrack lets you know about activity on your work items — saved to your account.
          </p>
        </header>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            <div className="flex items-center justify-between gap-4 py-4 first:pt-0">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">In-app notifications</h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Show assignment, mention, status-change, and other activity in the notification bell.
                </p>
              </div>
              <ToggleSwitch
                checked={settings.inAppEnabled}
                onChange={(next) => handleToggle("inAppEnabled", next)}
                disabled={loading}
                loading={savingKey === "inAppEnabled"}
                ariaLabel="In-app notifications"
              />
            </div>
            <div className="flex items-center justify-between gap-4 py-4 last:pb-0">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Email notifications</h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Get an email for the same activity — assignments, mentions, status changes, project invites, and overdue reminders.
                </p>
              </div>
              <ToggleSwitch
                checked={settings.emailInstantEnabled}
                onChange={(next) => handleToggle("emailInstantEnabled", next)}
                disabled={loading}
                loading={savingKey === "emailInstantEnabled"}
                ariaLabel="Email notifications"
              />
            </div>
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
