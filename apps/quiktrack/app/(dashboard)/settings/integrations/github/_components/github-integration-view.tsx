"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Github, Loader2, Plug } from "lucide-react";
import { Button } from "@quikit/ui";
import { ConnectedOrgs, type Installation } from "./connected-orgs";
import { RepoLinker } from "./repo-linker";

interface ConnectionsResponse {
  configured: boolean;
  installations: Installation[];
}

async function fetchConnections(): Promise<ConnectionsResponse> {
  const r = await fetch("/api/integrations/github/connections");
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to load");
  return j.data as ConnectionsResponse;
}

/** Map the ?connect=... redirect status to a human banner. */
const CONNECT_MESSAGES: Record<string, { tone: "ok" | "err"; text: string }> = {
  success: { tone: "ok", text: "GitHub connected. Backfill will populate development data shortly." },
  denied: { tone: "err", text: "GitHub authorization was declined." },
  invalid_state: { tone: "err", text: "The connect link expired or was invalid. Please try again." },
  exchange_failed: { tone: "err", text: "Could not complete GitHub authorization. Please try again." },
  install_failed: { tone: "err", text: "The GitHub App installation could not be recorded." },
  cancelled: { tone: "err", text: "GitHub App installation was cancelled." },
};

export function GithubIntegrationView() {
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // Read the one-shot ?connect=... status the callback routes set, then clean
  // it out of the URL so a refresh doesn't re-show it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("connect");
    if (status && CONNECT_MESSAGES[status]) {
      setBanner(CONNECT_MESSAGES[status]);
      params.delete("connect");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["github-connections"],
    queryFn: fetchConnections,
  });

  const installations = data?.installations ?? [];
  const activeInstallation = installations.find((i) => i.status === "ACTIVE");

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      <div className="px-8 py-8 space-y-6 max-w-4xl">
        <header className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white shadow-md dark:bg-gray-700">
              <Github className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-600 dark:text-accent-400">
                Development integration
              </p>
              <h1 className="mt-0.5 text-xl font-semibold text-gray-900 dark:text-gray-100">
                GitHub
              </h1>
              <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                Connect a GitHub organization to surface branches, commits, and
                pull requests on work items. Include a work-item key like{" "}
                <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[12px] dark:bg-gray-900">
                  QT-123
                </code>{" "}
                in branch names, commit messages, or PR titles to link them.
              </p>
            </div>
          </div>
        </header>

        {banner && (
          <div
            className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
              banner.tone === "ok"
                ? "border-green-200 bg-green-50 text-green-800 dark:border-green-700/50 dark:bg-green-900/20 dark:text-green-200"
                : "border-red-200 bg-red-50 text-red-800 dark:border-red-700/50 dark:bg-red-900/20 dark:text-red-200"
            }`}
          >
            {banner.tone === "ok" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            {banner.text}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading connections…
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-700/50 dark:bg-red-900/20 dark:text-red-200">
            <AlertCircle className="h-4 w-4" />
            {(error as Error).message}
          </div>
        )}

        {data && !data.configured && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-100">
            <p className="font-semibold">One-time server setup pending</p>
            <p className="mt-1 text-amber-800 dark:text-amber-200">
              Connecting GitHub is one click for admins — authorize and pick
              repositories, no app to create. But that requires the QuikTrack
              GitHub App to be registered <span className="font-medium">once,
              by an operator</span>, and its secrets set as server environment
              variables (the same one-time step Atlassian did for their
              marketplace app). After that, this page shows a{" "}
              <span className="font-medium">Connect</span> button and nobody
              creates an app again.
            </p>
            <p className="mt-2 text-amber-800 dark:text-amber-200">
              Operator, set these environment variables:
            </p>
            <code className="mt-1 block rounded bg-amber-100/70 px-2 py-1.5 font-mono text-[12px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              GITHUB_APP_ID · GITHUB_APP_SLUG · GITHUB_APP_CLIENT_ID ·
              GITHUB_APP_CLIENT_SECRET · GITHUB_APP_PRIVATE_KEY ·
              GITHUB_APP_WEBHOOK_SECRET · GITHUB_TOKEN_ENCRYPTION_KEY
            </code>
            <p className="mt-2 text-amber-800 dark:text-amber-200">
              Operator only —{" "}
              <a
                href="https://github.com/settings/apps/new"
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium underline hover:no-underline"
              >
                register the GitHub App once
              </a>
              , then map each value per the guide:
              <span className="font-mono"> apps/quiktrack/docs/github-app-setup.md</span>
            </p>
          </div>
        )}

        {data?.configured && installations.length === 0 && (
          <section className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-900">
              <Plug className="h-6 w-6 text-gray-500" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              No GitHub organization connected
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
              Connect a GitHub organization to start bringing development
              activity into your work items.
            </p>
            <a href="/api/integrations/github/oauth/start" className="mt-4 inline-block">
              <Button className="bg-gray-900 hover:bg-black text-white inline-flex items-center gap-2 dark:bg-gray-700 dark:hover:bg-gray-600">
                <Github className="h-4 w-4" />
                Connect GitHub
              </Button>
            </a>
          </section>
        )}

        {installations.length > 0 && (
          <ConnectedOrgs installations={installations} onChanged={() => refetch()} />
        )}

        {activeInstallation && (
          <RepoLinker installationRowId={activeInstallation.id} />
        )}
      </div>
    </div>
  );
}
