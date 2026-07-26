"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Mail, Plug, Trash2, CheckCircle2, AlertCircle, Send } from "lucide-react";
import { apiGet, apiSend } from "@/lib/client/fetcher";
import { StatusPill } from "@/components/ui/status-pill";
import { LoadingState, ErrorState } from "@/components/ui/page-states";
import type { ConnectionDTO } from "@/types";

/** Mail providers offered as one-click OAuth connects. */
const MAIL_PROVIDERS: { id: string; name: string; blurb: string; accent: string }[] = [
  { id: "gmail", name: "Gmail", blurb: "Send email from & trigger on a connected Google account.", accent: "text-red-500" },
  { id: "outlook", name: "Outlook", blurb: "Send email from & trigger on a connected Microsoft account.", accent: "text-blue-500" },
];

const LABELS: Record<string, string> = {
  quikscale: "QuikScale",
  quikcrm: "QuikCRM",
  quikhrms: "QuikHRMS",
  quikinfra: "QuikInfra",
  quiktrack: "QuikTrack",
  outlook: "Outlook",
  teams: "Microsoft Teams",
  gmail: "Gmail",
  slack: "Slack",
  sheets: "Google Sheets",
  webhook: "Webhook",
};

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <IntegrationsInner />
    </Suspense>
  );
}

/** Result banner, from either the popup postMessage or a fallback URL flag. */
type Banner = { ok: boolean; text: string } | null;

function IntegrationsInner() {
  const qc = useQueryClient();
  const params = useSearchParams();
  // Fallback (popup blocked → full-page redirect leaves ?connected=/?error=).
  const urlBanner: Banner = params.get("connected")
    ? { ok: true, text: `Connected ${params.get("connected")} successfully.` }
    : params.get("error")
      ? { ok: false, text: `Couldn't connect: ${params.get("error")}` }
      : null;
  const [banner, setBanner] = useState<Banner>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["connections"],
    queryFn: () => apiGet<ConnectionDTO[]>("/api/connections"),
  });

  // Listen for the OAuth popup's completion message (Zapier-style connect).
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; status?: string; label?: string; error?: string };
      if (d?.type !== "quikflow:connection") return;
      if (d.status === "connected") {
        setBanner({ ok: true, text: `Connected ${d.label ?? ""} successfully.` });
        void qc.invalidateQueries({ queryKey: ["connections"] });
      } else {
        setBanner({ ok: false, text: `Couldn't connect: ${d.error ?? "failed"}` });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [qc]);

  // Open the provider consent screen in a centered popup.
  const openConnect = useCallback((provider: string) => {
    const w = 520;
    const h = 660;
    const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
    const popup = window.open(
      `/api/connections/${provider}/authorize`,
      "quikflow-connect",
      `width=${w},height=${h},left=${left},top=${top}`,
    );
    // Popup blocked → fall back to a same-tab navigation (redirect flow).
    if (!popup) window.location.href = `/api/connections/${provider}/authorize`;
  }, []);

  const disconnect = useMutation({
    mutationFn: (id: string) => apiSend(`/api/connections?id=${encodeURIComponent(id)}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["connections"] }),
  });

  const sendTest = useMutation({
    mutationFn: (id: string) => apiSend<{ to: string }>("/api/connections/test", "POST", { id }),
    onSuccess: (d) => setBanner({ ok: true, text: `Test email sent to ${d.to}. Check the inbox.` }),
    onError: (e) => setBanner({ ok: false, text: `Test failed: ${(e as Error).message}` }),
  });

  const shown = banner ?? urlBanner;

  const byProvider = (provider: string) => (data ?? []).filter((c) => c.provider === provider);
  const mailProviderIds = new Set(MAIL_PROVIDERS.map((p) => p.id));
  const otherConnections = (data ?? []).filter((c) => !mailProviderIds.has(c.provider));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Integrations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect the accounts your workflows send from and trigger on.
        </p>
      </div>

      {shown ? (
        <div
          className={`mb-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            shown.ok
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {shown.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {shown.text}
        </div>
      ) : null}

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={(error as Error).message} /> : null}

      {data ? (
        <>
          {/* ── Mail accounts ────────────────────────────────────────────── */}
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Mail accounts
          </h2>
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            {MAIL_PROVIDERS.map((p) => {
              const accounts = byProvider(p.id);
              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Mail className={`h-6 w-6 ${p.accent}`} />
                      <div>
                        <p className="font-semibold">{p.name}</p>
                        <p className="text-xs text-gray-500">{p.blurb}</p>
                      </div>
                    </div>
                  </div>

                  {accounts.length > 0 ? (
                    <ul className="mt-4 space-y-2">
                      {accounts.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center justify-between rounded-lg bg-[var(--color-bg-secondary)] px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{c.label}</p>
                            <StatusPill status={c.status} />
                          </div>
                          <div className="ml-3 flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => sendTest.mutate(c.id)}
                              disabled={sendTest.isPending}
                              title="Send a test email"
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-50"
                            >
                              <Send className="h-3.5 w-3.5" />
                              {sendTest.isPending && sendTest.variables === c.id ? "Sending…" : "Test"}
                            </button>
                            <button
                              type="button"
                              onClick={() => disconnect.mutate(c.id)}
                              disabled={disconnect.isPending}
                              title="Disconnect"
                              className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => openConnect(p.id)}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
                  >
                    <Plug className="h-4 w-4" />
                    {accounts.length > 0 ? "Connect another account" : `Connect ${p.name}`}
                  </button>
                </div>
              );
            })}
          </div>

          {/* ── Other connections ────────────────────────────────────────── */}
          {otherConnections.length > 0 ? (
            <>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Other connections
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {otherConnections.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold">{LABELS[c.provider] ?? c.label}</p>
                        <p className="text-xs text-gray-500">{c.external ? "External" : "QuikIT app"}</p>
                      </div>
                      <StatusPill status={c.status} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
