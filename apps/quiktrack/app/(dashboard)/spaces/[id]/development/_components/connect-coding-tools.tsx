"use client";

import { Github, Gitlab } from "lucide-react";

/**
 * "Connect your coding tools" panel — the empty-state on the Development tab,
 * matching Jira's layout: a heading, a lead line, and a row of SCM buttons.
 * GitHub is wired to the org connect flow; GitLab / Bitbucket are shown as
 * "coming soon" (the provider seam in lib/services/scm makes them additive).
 */
export function ConnectCodingTools() {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Connect your coding tools
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
        Bring development activity into QuikTrack to surface branches, commits,
        and pull requests on your work items, spot risks early, and keep your
        team focused on delivering value.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <a
          href="/settings/integrations/github"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
        >
          <Github className="h-4 w-4" />
          GitHub
        </a>
        <ToolButtonSoon icon={Gitlab} label="GitLab" />
        <ToolButtonSoon icon={BitbucketGlyph} label="Bitbucket" />
      </div>

      <p className="mt-3 text-[12px] text-gray-400">
        GitHub is available now. GitLab and Bitbucket are on the way.
      </p>
    </section>
  );
}

function ToolButtonSoon({
  icon: Icon,
  label,
}: {
  icon: React.ElementType;
  label: string;
}) {
  return (
    <span
      className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-400 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-500"
      title="Coming soon"
    >
      <Icon className="h-4 w-4" />
      {label}
      <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700 dark:text-gray-400">
        soon
      </span>
    </span>
  );
}

/** Bitbucket has no lucide glyph — a small inline mark keeps the row consistent. */
function BitbucketGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M2.6 3a.7.7 0 0 0-.7.8l2.9 17.1a.9.9 0 0 0 .9.8h13a.7.7 0 0 0 .7-.6l2.9-17.3a.7.7 0 0 0-.7-.8H2.6Zm11.7 12.3H9.8L8.7 9.4h6.7l-1.1 5.9Z" />
    </svg>
  );
}
