"use client";

import { useMemo, useState } from "react";
import { Github, Search } from "lucide-react";

export interface PrRow {
  id: string;
  number: number;
  title: string;
  state: string;
  url: string | null;
  repoFullName: string;
  authorName: string | null;
  updatedAtGh: string | null;
}

const STATE_CLS: Record<string, string> = {
  OPEN: "border-green-300 text-green-700 dark:border-green-500/50 dark:text-green-300",
  MERGED: "border-purple-300 text-purple-700 dark:border-purple-500/50 dark:text-purple-300",
  CLOSED: "border-red-300 text-red-700 dark:border-red-500/50 dark:text-red-300",
  DRAFT: "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300",
};

function rel(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`;
  if (s < 86400) return `about ${Math.floor(s / 3600)} hour${Math.floor(s / 3600) === 1 ? "" : "s"} ago`;
  return `${Math.floor(s / 86400)} day${Math.floor(s / 86400) === 1 ? "" : "s"} ago`;
}

/**
 * Jira-style "Related work → Pull requests" table: search box + Repository /
 * Owner / Status filter dropdowns, then a Summary / Status / Owner / Reviewers
 * / Updated table.
 */
export function PrTable({ prs }: { prs: PrRow[] }) {
  const [q, setQ] = useState("");
  const [repo, setRepo] = useState("");
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState("");

  const repos = useMemo(() => uniq(prs.map((p) => p.repoFullName)), [prs]);
  const owners = useMemo(() => uniq(prs.map((p) => p.authorName ?? "")), [prs]);
  const statuses = useMemo(() => uniq(prs.map((p) => p.state)), [prs]);

  const rows = prs.filter(
    (p) =>
      (!q || p.title.toLowerCase().includes(q.toLowerCase())) &&
      (!repo || p.repoFullName === repo) &&
      (!owner || (p.authorName ?? "") === owner) &&
      (!status || p.state === status),
  );

  return (
    <div>
      <p className="mb-3 text-[12px] text-gray-500 dark:text-gray-400">
        Your team&apos;s linked pull requests, limited to your repository access.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pull requests"
            className="h-8 w-56 rounded-md border border-gray-200 bg-white pl-7 pr-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
        <FilterSelect label="Repository" value={repo} onChange={setRepo} options={repos} />
        <FilterSelect label="Owner" value={owner} onChange={setOwner} options={owners} />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={statuses} />
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <th className="bg-accent-50 px-3 py-2 font-medium dark:bg-accent-900/20">Summary</th>
            <th className="bg-accent-50 px-3 py-2 font-medium dark:bg-accent-900/20">Status</th>
            <th className="bg-accent-50 px-3 py-2 font-medium dark:bg-accent-900/20">Owner</th>
            <th className="bg-accent-50 px-3 py-2 font-medium dark:bg-accent-900/20">Reviewers</th>
            <th className="bg-accent-50 px-3 py-2 text-right font-medium dark:bg-accent-900/20">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-gray-500">No pull requests match.</td>
            </tr>
          )}
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-3 py-2.5">
                <a href={p.url ?? "#"} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 hover:underline">
                  <Github className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-[13px] text-gray-900 dark:text-gray-100">{p.title}</span>
                </a>
                <div className="pl-5 text-[11px] text-gray-400">Repository: {p.repoFullName}</div>
              </td>
              <td className="px-3 py-2.5">
                <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STATE_CLS[p.state] ?? STATE_CLS.OPEN}`}>
                  {p.state}
                </span>
              </td>
              <td className="px-3 py-2.5 text-[12px] text-gray-600 dark:text-gray-300">{p.authorName ?? "—"}</td>
              <td className="px-3 py-2.5 text-[12px] text-gray-400 italic">No reviewers</td>
              <td className="px-3 py-2.5 text-right text-[12px] text-gray-500 dark:text-gray-400">{rel(p.updatedAtGh)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean))).sort();
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-md border border-gray-200 bg-white px-2 text-[12px] text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
