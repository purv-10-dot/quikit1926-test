"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Mail, Plug, Trash2, CheckCircle2, AlertCircle, Send, Video, KeyRound, X, CalendarDays, Copy, Check } from "lucide-react";
import { apiGet, apiSend } from "@/lib/client/fetcher";
import { StatusPill } from "@/components/ui/status-pill";
import { LoadingState, ErrorState } from "@/components/ui/page-states";
import type { ConnectionDTO } from "@/types";

/** Mail providers offered as one-click OAuth connects. */
const MAIL_PROVIDERS: { id: string; name: string; blurb: string; accent: string }[] = [
  { id: "gmail", name: "Gmail", blurb: "Send email from & trigger on a connected Google account.", accent: "text-red-500" },
  { id: "outlook", name: "Outlook", blurb: "Send email from & trigger on a connected Microsoft account.", accent: "text-blue-500" },
];

/** Calendar providers offered as one-click OAuth connects (Teams = Outlook/Exchange calendar). */
const CALENDAR_PROVIDERS: { id: string; name: string; blurb: string; accent: string }[] = [
  { id: "teams", name: "Microsoft Teams", blurb: "Create Teams meetings & sync events onto a connected Microsoft calendar.", accent: "text-indigo-500" },
];

const FATHOM_PROVIDER = "fathom";

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
  fathom: "Fathom.ai",
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
  const [fathomOpen, setFathomOpen] = useState(false);

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

  const saveNotetaker = useMutation({
    mutationFn: (vars: { id: string; notetakerEmail: string }) =>
      apiSend("/api/connections", "PATCH", vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connections"] });
      setBanner({ ok: true, text: "Fathom auto-join updated." });
    },
    onError: (e) => setBanner({ ok: false, text: `Couldn't save: ${(e as Error).message}` }),
  });

  const sendTest = useMutation({
    mutationFn: (id: string) => apiSend<{ to?: string; ok?: boolean; label?: string }>("/api/connections/test", "POST", { id }),
    onSuccess: (d) =>
      setBanner({
        ok: true,
        text: d.to ? `Test email sent to ${d.to}. Check the inbox.` : `Connection verified${d.label ? ` (${d.label})` : ""}.`,
      }),
    onError: (e) => setBanner({ ok: false, text: `Test failed: ${(e as Error).message}` }),
  });

  const shown = banner ?? urlBanner;

  const byProvider = (provider: string) => (data ?? []).filter((c) => c.provider === provider);
  const mailProviderIds = new Set(MAIL_PROVIDERS.map((p) => p.id));
  const calendarProviderIds = new Set(CALENDAR_PROVIDERS.map((p) => p.id));
  const otherConnections = (data ?? []).filter(
    (c) =>
      !mailProviderIds.has(c.provider) &&
      !calendarProviderIds.has(c.provider) &&
      c.provider !== FATHOM_PROVIDER,
  );
  const fathomAccounts = byProvider(FATHOM_PROVIDER);

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

          {/* ── Calendar & meetings (Microsoft Teams) ────────────────────── */}
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Calendar &amp; meetings
          </h2>
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            {CALENDAR_PROVIDERS.map((p) => {
              const accounts = byProvider(p.id);
              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5"
                >
                  <div className="flex items-center gap-3">
                    <CalendarDays className={`h-6 w-6 ${p.accent}`} />
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.blurb}</p>
                    </div>
                  </div>

                  {accounts.length > 0 ? (
                    <ul className="mt-4 space-y-2">
                      {accounts.map((c) => (
                        <li key={c.id} className="rounded-lg bg-[var(--color-bg-secondary)] px-3 py-2">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{c.label}</p>
                              <StatusPill status={c.status} />
                            </div>
                            <button
                              type="button"
                              onClick={() => disconnect.mutate(c.id)}
                              disabled={disconnect.isPending}
                              title="Disconnect"
                              className="ml-3 shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          {p.id === "teams" ? (
                            <NotetakerEmailField
                              connectionId={c.id}
                              organizerMailbox={c.label}
                              value={c.notetakerEmail ?? ""}
                              onSave={(notetakerEmail) => saveNotetaker.mutate({ id: c.id, notetakerEmail })}
                              saving={saveNotetaker.isPending && saveNotetaker.variables?.id === c.id}
                            />
                          ) : null}
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

          {/* ── Meeting intelligence (Fathom.ai) ─────────────────────────── */}
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Meeting intelligence
          </h2>
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5">
              <div className="flex items-center gap-3">
                <Video className="h-6 w-6 text-violet-500" />
                <div>
                  <p className="font-semibold">Fathom.ai</p>
                  <p className="text-xs text-gray-500">
                    Auto-save Daily Huddle &amp; Weekly Meeting transcripts into QuikScale.
                  </p>
                </div>
              </div>

              {fathomAccounts.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {fathomAccounts.map((c) => (
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
                          title="Verify the API key"
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-50"
                        >
                          <Send className="h-3.5 w-3.5" />
                          {sendTest.isPending && sendTest.variables === c.id ? "Testing…" : "Test"}
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
                onClick={() => setFathomOpen(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
              >
                <KeyRound className="h-4 w-4" />
                {fathomAccounts.length > 0 ? "Connect another account" : "Connect Fathom"}
              </button>
            </div>
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

      {fathomOpen ? (
        <FathomConnectModal
          onClose={() => setFathomOpen(false)}
          onConnected={(label) => {
            setFathomOpen(false);
            setBanner({ ok: true, text: `Connected ${label} successfully.` });
            void qc.invalidateQueries({ queryKey: ["connections"] });
          }}
        />
      ) : null}
    </div>
  );
}

/** API-key connect modal for Fathom (no OAuth popup — Fathom uses an API key). */
function FathomConnectModal({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  onConnected: (label: string) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  // Set once the connection is created — switches the modal into the
  // "register this webhook URL with Fathom" step instead of closing outright.
  const [connected, setConnected] = useState<{ id: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const connect = useMutation({
    mutationFn: () =>
      apiSend<{ id: string; label: string }>("/api/connections/fathom", "POST", {
        apiKey: apiKey.trim(),
        ...(label.trim() ? { label: label.trim() } : {}),
        ...(webhookSecret.trim() ? { webhookSecret: webhookSecret.trim() } : {}),
      }),
    onSuccess: (d) => {
      // Notify the parent right away so the connections list refreshes,
      // but keep the modal open on the webhook step if a signing secret
      // was supplied (otherwise there's nothing to register).
      onConnected(d.label);
      if (webhookSecret.trim()) setConnected(d);
    },
  });

  const webhookUrl =
    connected && typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/fathom?c=${connected.id}`
      : "";

  const copyWebhookUrl = useCallback(async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [webhookUrl]);

  if (connected) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <h3 className="text-lg font-semibold">One more step</h3>
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100">
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mb-3 text-sm text-gray-500">
            {connected.label} is connected. To get transcripts in real time (instead of waiting for the
            next poll), paste this URL into Fathom → Settings → Integrations / API → Webhooks.
          </p>

          <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2">
            <code className="flex-1 truncate text-xs">{webhookUrl}</code>
            <button
              type="button"
              onClick={copyWebhookUrl}
              title="Copy webhook URL"
              className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-accent-700"
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-violet-500" />
            <h3 className="text-lg font-semibold">Connect Fathom.ai</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-500">
          Paste an API key from Fathom → Settings → Integrations / API. We validate it and store it encrypted.
        </p>

        <label className="mb-1 block text-xs font-medium text-gray-600">Fathom API key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="fathom_sk_…"
          autoFocus
          className="mb-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-400"
        />

        <label className="mb-1 block text-xs font-medium text-gray-600">Label (optional)</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Success Alchemists — Fathom"
          className="mb-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-400"
        />

        <label className="mb-1 block text-xs font-medium text-gray-600">
          Webhook signing secret (optional)
        </label>
        <input
          type="password"
          value={webhookSecret}
          onChange={(e) => setWebhookSecret(e.target.value)}
          placeholder="whsec_… (only for real-time webhooks)"
          className="mb-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-400"
        />
        <p className="mb-4 text-xs text-gray-400">
          Create a webhook in Fathom first to get this secret — we&apos;ll show you the callback URL to
          paste back into Fathom once connected. Leave blank to rely on polling only (checks every ~60s).
        </p>

        {connect.isError ? (
          <p className="mb-3 text-sm text-red-600">{(connect.error as Error).message}</p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => connect.mutate()}
            disabled={connect.isPending || apiKey.trim().length < 10}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
          >
            <Plug className="h-4 w-4" />
            {connect.isPending ? "Connecting…" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Fathom ACCOUNT email for a Teams connection — invited as a required attendee
 * on every online meeting QuikFlow creates.
 *
 * Not a bot address: Fathom has no invitable mailbox. Its notetaker joins
 * meetings that appear on the calendar connected to a Fathom USER account, so
 * inviting that person is what puts a QuikFlow-created meeting into their
 * Fathom "Upcoming Meetings" — which is what auto-joins. The organiser here is
 * a QuikFlow integration account whose calendar Fathom does not sync, so
 * without this the meeting is invisible to Fathom entirely.
 *
 * Blank clears the override (falls back to the org-wide FATHOM_NOTETAKER_EMAIL).
 */
function NotetakerEmailField({
  connectionId,
  organizerMailbox,
  value,
  onSave,
  saving,
}: {
  connectionId: string;
  /** The connected mailbox that organises the meetings — this connection's label. */
  organizerMailbox: string;
  value: string;
  onSave: (notetakerEmail: string) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const dirty = draft.trim() !== value;

  return (
    <div className="mt-2 border-t border-[var(--color-border)] pt-2">
      <label htmlFor={`notetaker-${connectionId}`} className="mb-1 block text-xs font-medium text-gray-500">
        Fathom account email (drives auto-join)
      </label>
      <div className="flex items-center gap-2">
        <input
          id={`notetaker-${connectionId}`}
          type="email"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="name@company.com"
          className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-accent-400"
        />
        <button
          type="button"
          onClick={() => onSave(draft.trim())}
          disabled={saving || !dirty}
          className="shrink-0 rounded-md bg-accent-600 px-2 py-1 text-xs font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Readiness. QuikFlow can only verify the first line — the two Fathom
          settings have no API, so they are stated as a checklist rather than a
          status QuikFlow pretends to know. */}
      <div className="mt-2 space-y-1 text-[11px] leading-relaxed text-gray-500">
        <p>
          Meetings are organised by <span className="font-medium text-gray-600">{organizerMailbox}</span>, whose calendar
          Fathom does not sync — the address above is invited as a required attendee so the meeting also lands on{" "}
          <em>its</em> calendar.
        </p>
        {draft.trim() ? null : (
          <p className="text-amber-600">
            Not set — QuikFlow-created meetings will not be recorded.
          </p>
        )}
        <p className="pt-0.5 font-medium text-gray-600">Then, in Fathom (once):</p>
        <ul className="list-disc space-y-0.5 pl-4">
          <li>Settings → Calendar: connect the calendar of this same address.</li>
          <li>Settings → Recording: auto-record ON for all meetings.</li>
          <li>Confirm the meeting shows in Fathom&apos;s Upcoming Meetings — if it does not, nothing will auto-join.</li>
        </ul>
      </div>
    </div>
  );
}
