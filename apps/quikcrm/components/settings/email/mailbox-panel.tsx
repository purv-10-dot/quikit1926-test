"use client";

/**
 * Settings → Email Accounts. Connect / disconnect the current user's own
 * mailbox (Gmail or Microsoft 365) and see connection status. Uses the shared
 * toast + a native fetch (matches the app's react-query-free settings pages).
 *
 * OAuth connect is a full-page navigation (window.location) to /connect so the
 * provider redirect chain works; the callback returns to this page with a
 * ?connected=1 or ?error=... query the panel surfaces.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, RefreshCw, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Connection {
  provider: string;
  emailAddress: string;
  status: string;
  syncState?: string; // "initial" | "backfilling" | "live"
  lastSyncedAt: string | null;
  lastError: string | null;
}
interface ConfigStatus {
  tokenEncryptionKey: boolean;
  gmail: boolean;
  microsoft: boolean;
  anyAvailable: boolean;
}
interface StatusResponse {
  availableProviders: string[];
  configStatus: ConfigStatus;
  connection: Connection | null;
}

const PROVIDER_LABEL: Record<string, string> = {
  gmail: "Gmail / Google Workspace",
  microsoft: "Outlook / Microsoft 365",
};

const ERROR_COPY: Record<string, string> = {
  invalid_state: "The connection request expired. Please try again.",
  session_mismatch: "That connection was started by a different user.",
  no_refresh_token: "Google/Microsoft did not grant offline access. Please retry and approve all permissions.",
  provider_mismatch: "Provider mismatch — please retry.",
  connect_failed: "Could not connect the mailbox. Please try again.",
  invalid_callback: "The provider returned an invalid response.",
  access_denied: "You declined the permission request.",
};

export function MailboxPanel() {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email/mailbox", { credentials: "include" });
      const json = await res.json();
      if (json.success) setStatus(json.data);
    } catch {
      toast.error("Failed to load mailbox status.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Surface the callback result once, then clean the URL.
  useEffect(() => {
    if (params.get("connected")) {
      toast.success("Mailbox connected.");
      router.replace("/settings/email");
    } else {
      const err = params.get("error");
      if (err) {
        toast.error(ERROR_COPY[err] ?? "Mailbox connection failed.");
        router.replace("/settings/email");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function connect(provider: string) {
    // Full-page navigation so the OAuth redirect chain runs at the top level.
    window.location.href = `/api/email/mailbox/connect?provider=${provider}`;
  }

  async function disconnect() {
    if (!confirm("Disconnect this mailbox? Sent history stays; new sync stops.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/email/mailbox/disconnect", {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Mailbox disconnected.");
        await load();
      } else {
        toast.error(json.error ?? "Failed to disconnect.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    try {
      const res = await fetch("/api/email/mailbox/sync", {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Synced — ${json.data.created} new, ${json.data.skipped} skipped.`);
        await load();
      } else {
        toast.error(json.error ?? "Sync failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-crm-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const conn = status?.connection;
  const cfg = status?.configStatus;

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-lg font-semibold text-crm-text">Email Accounts</h1>
        <p className="mt-1 text-sm text-crm-muted">
          Connect your mailbox to send email from CRM records and automatically
          log replies to the activity timeline. Only you can access your mailbox.
        </p>
      </header>

      {conn ? (
        <div className="crm-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-accent-100 p-2 text-accent-700">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium text-crm-text">{conn.emailAddress}</div>
                <div className="text-sm text-crm-muted">
                  {PROVIDER_LABEL[conn.provider] ?? conn.provider}
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  {conn.status !== "active" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                      <AlertTriangle className="h-3 w-3" /> Needs attention
                    </span>
                  ) : conn.syncState === "initial" || conn.syncState === "backfilling" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                      <Loader2 className="h-3 w-3 animate-spin" /> Importing mail history…
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-700">
                      <CheckCircle2 className="h-3 w-3" /> Connected
                    </span>
                  )}
                  {conn.lastSyncedAt && (
                    <span className="text-crm-muted">
                      Last synced {new Date(conn.lastSyncedAt).toLocaleString()}
                    </span>
                  )}
                </div>
                {conn.status !== "active" && conn.lastError && (
                  <p className="mt-2 text-xs text-red-600">{conn.lastError}</p>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={syncNow}
              disabled={busy}
              className="crm-btn-secondary inline-flex items-center gap-1.5 text-sm"
            >
              <RefreshCw className={"h-4 w-4" + (busy ? " animate-spin" : "")} /> Sync now
            </button>
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="crm-btn-ghost text-sm text-red-600 hover:bg-red-50"
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Provider cards render whenever that provider's OAuth creds exist. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <ProviderCard
              provider="gmail"
              title="Google Workspace"
              subtitle="Gmail"
              hasCreds={!!cfg?.gmail}
              tokenKeyMissing={!cfg?.tokenEncryptionKey}
              onConnect={() => connect("gmail")}
            />
            <ProviderCard
              provider="microsoft"
              title="Microsoft 365"
              subtitle="Outlook"
              hasCreds={!!cfg?.microsoft}
              tokenKeyMissing={!cfg?.tokenEncryptionKey}
              onConnect={() => connect("microsoft")}
            />
          </div>

          {/* Precise diagnostic — never a silent blanket "not configured". */}
          {cfg && !cfg.gmail && !cfg.microsoft && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-medium">Email integration is not fully configured on this server.</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {!cfg.tokenEncryptionKey && <li>MAILBOX_TOKEN_ENCRYPTION_KEY is missing or invalid.</li>}
                {!cfg.gmail && <li>Gmail: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set.</li>}
                {!cfg.microsoft && <li>Microsoft: MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET not set.</li>}
              </ul>
              <p className="mt-1 text-xs">
                Add them to <code>apps/quikcrm/.env.local</code> and restart the dev server.
              </p>
            </div>
          )}
          {cfg && cfg.gmail && !cfg.tokenEncryptionKey && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              OAuth credentials are set, but MAILBOX_TOKEN_ENCRYPTION_KEY is missing — tokens
              can&apos;t be stored securely, so connecting is disabled. Set that key and restart.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProviderCard({
  title,
  subtitle,
  hasCreds,
  tokenKeyMissing,
  onConnect,
}: {
  provider: string;
  title: string;
  subtitle: string;
  hasCreds: boolean;
  tokenKeyMissing: boolean;
  onConnect: () => void;
}) {
  const connectable = hasCreds && !tokenKeyMissing;
  return (
    <div className="crm-card flex flex-col justify-between gap-4 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-accent-100 p-2 text-accent-700">
          <Mail className="h-5 w-5" />
        </div>
        <div>
          <div className="font-medium text-crm-text">{title}</div>
          <div className="text-sm text-crm-muted">{subtitle}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onConnect}
        disabled={!connectable}
        title={
          !hasCreds
            ? "OAuth credentials not configured on this server"
            : tokenKeyMissing
              ? "MAILBOX_TOKEN_ENCRYPTION_KEY is not set"
              : undefined
        }
        className="crm-btn-primary inline-flex items-center justify-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Mail className="h-4 w-4" /> Connect {subtitle}
      </button>
    </div>
  );
}
