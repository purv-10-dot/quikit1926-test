"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  X,
  CheckSquare,
  Bug,
  BookOpen,
  Zap,
  ListTree,
  CornerDownLeft,
} from "lucide-react";
import { useApiData } from "@/lib/hooks/useApiData";
import { CreateIssueModal } from "@/components/create-issue-modal";

type LinkType = "RELATES_TO";
const LINK_TYPE_LABELS: Record<LinkType, string> = {
  RELATES_TO: "relates to",
};

interface LinkedIssue {
  id: string;
  key: string;
  title: string;
  type: string;
  priority: string;
  assigneeId: string | null;
  statusId: string;
  status: { id: string; name: string; color: string; category: string } | null;
}

interface LinkRow {
  id: string;
  type: LinkType;
  createdAt: string;
  targetIssue: LinkedIssue;
}

interface SearchHit {
  id: string;
  key: string;
  title: string;
  type: string;
}

const TYPE_ICON: Record<string, { Icon: React.ElementType; color: string }> = {
  TASK: { Icon: CheckSquare, color: "text-blue-500" },
  BUG: { Icon: Bug, color: "text-red-500" },
  STORY: { Icon: BookOpen, color: "text-green-500" },
  EPIC: { Icon: Zap, color: "text-purple-500" },
  SUBTASK: { Icon: ListTree, color: "text-gray-500" },
};

const RECENT_KEY = "qt-recent-issues";
const MAX_RECENT = 8;

function readRecent(): SearchHit[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SearchHit[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function pushRecent(hit: SearchHit) {
  if (typeof window === "undefined") return;
  const cur = readRecent().filter((h) => h.id !== hit.id);
  cur.unshift(hit);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, MAX_RECENT)));
}

/**
 * "Linked work items" panel for the issue detail modal.
 *
 * - Renders the current outgoing links grouped by relationship type.
 * - The header `+` opens an inline creator: relationship dropdown + search
 *   input that surfaces "Recently viewed" issues from localStorage and
 *   searches the project's issues live as the user types.
 * - On selection, POSTs the link and re-renders. On row hover, an ✕ unlinks.
 * - Clicking a linked row calls `onOpenIssue` so the parent modal can swap
 *   to the linked issue.
 *
 * Only `RELATES_TO` is exposed as a relationship type for v1; the API and
 * schema accept other types so we can add them later without UI churn.
 */
export function LinkedWorkItems({
  issueId,
  projectId,
  onOpenIssue,
}: {
  issueId: string;
  projectId: string;
  onOpenIssue?: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const linksKey = ["quiktrack", "issue-links", issueId];
  const { data: links = [], isLoading } = useApiData<LinkRow[]>(
    linksKey,
    `/api/issues/${issueId}/links`,
  );
  const refreshLinks = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["quiktrack", "issue-links", issueId] }),
    [queryClient, issueId],
  );

  const [creatorOpen, setCreatorOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [pendingLinkType, setPendingLinkType] = useState<LinkType>("RELATES_TO");
  const [open, setOpen] = useState(true);

  // While the "Create linked work item" modal is open, intercept the global
  // issue-created event and auto-link the new issue to this one. We only
  // listen during the open window so we don't grab unrelated creates.
  useEffect(() => {
    if (!createModalOpen) return;
    function onCreated(e: Event) {
      const detail = (e as CustomEvent<{ id?: string; issue?: { id?: string; key?: string; type?: string } }>).detail;
      const newId = detail?.id ?? detail?.issue?.id;
      if (!newId) return;
      void fetch(`/api/issues/${issueId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetIssueId: newId, type: pendingLinkType }),
      })
        .then((r) => r.json())
        .then((res) => {
          if (res?.success) void refreshLinks();
        })
        .catch(() => undefined)
        .finally(() => {
          setCreateModalOpen(false);
          setCreatorOpen(false);
        });
    }
    window.addEventListener("quiktrack:issue-created", onCreated);
    return () => window.removeEventListener("quiktrack:issue-created", onCreated);
  }, [createModalOpen, issueId, pendingLinkType, refreshLinks]);

  async function unlink(linkId: string) {
    const res = await fetch(`/api/issues/${issueId}/links/${linkId}`, {
      method: "DELETE",
    }).then((r) => r.json());
    if (res?.success) {
      void refreshLinks();
    }
  }

  async function createLink(target: SearchHit, type: LinkType) {
    const res = await fetch(`/api/issues/${issueId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetIssueId: target.id, type }),
    }).then((r) => r.json());
    if (res?.success) {
      void refreshLinks();
      pushRecent(target);
      setCreatorOpen(false);
    }
  }

  // Group links by type so each relationship gets its own header (Jira-style).
  const groups = links.reduce<Record<LinkType, LinkRow[]>>(
    (acc, l) => {
      const k = l.type as LinkType;
      acc[k] = acc[k] ?? [];
      acc[k]!.push(l);
      return acc;
    },
    {} as Record<LinkType, LinkRow[]>,
  );

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Linked work items
        </button>
        {open && (
          <button
            type="button"
            onClick={() => setCreatorOpen((v) => !v)}
            className="p-1 hover:bg-gray-100 rounded text-gray-500"
            aria-label="Add linked work item"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <CreateIssueModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        initialProjectId={projectId}
      />

      {open && (
        <>
          {creatorOpen && (
            <LinkCreator
              projectId={projectId}
              excludeIssueId={issueId}
              onCreate={createLink}
              onCancel={() => setCreatorOpen(false)}
              onCreateNew={(type) => {
                setPendingLinkType(type);
                setCreateModalOpen(true);
              }}
            />
          )}

          {!isLoading && links.length === 0 && !creatorOpen && (
            <p className="text-xs text-gray-400">No linked work items yet.</p>
          )}

          {(Object.keys(groups) as LinkType[]).map((type) => (
            <div key={type} className="mt-2">
              <div className="text-xs text-gray-500 mb-1">{LINK_TYPE_LABELS[type]}</div>
              <div className="space-y-1">
                {groups[type]!.map((link) => (
                  <LinkRowCard
                    key={link.id}
                    link={link}
                    onOpen={() => onOpenIssue?.(link.targetIssue.id)}
                    onUnlink={() => unlink(link.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function LinkRowCard({
  link,
  onOpen,
  onUnlink,
}: {
  link: LinkRow;
  onOpen: () => void;
  onUnlink: () => void;
}) {
  const T = TYPE_ICON[link.targetIssue.type] ?? TYPE_ICON.TASK!;
  return (
    <div className="group flex items-center gap-2 px-2 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50">
      <T.Icon className={`h-4 w-4 shrink-0 ${T.color}`} />
      <button
        type="button"
        onClick={onOpen}
        className="text-xs font-medium text-gray-900 hover:underline shrink-0"
      >
        {link.targetIssue.key}
      </button>
      <span className="text-xs text-gray-700 truncate flex-1 min-w-0" title={link.targetIssue.title}>
        {link.targetIssue.title}
      </span>
      {link.targetIssue.status && (
        <span
          className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 shrink-0"
          title={link.targetIssue.status.name}
        >
          {link.targetIssue.status.name}
        </span>
      )}
      <button
        type="button"
        onClick={onUnlink}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 text-gray-500 shrink-0"
        aria-label="Unlink"
        title="Unlink"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function LinkCreator({
  projectId,
  excludeIssueId,
  onCreate,
  onCancel,
  onCreateNew,
}: {
  projectId: string;
  excludeIssueId: string;
  onCreate: (target: SearchHit, type: LinkType) => void | Promise<void>;
  onCancel: () => void;
  onCreateNew: (type: LinkType) => void;
}) {
  const [type, setType] = useState<LinkType>("RELATES_TO");
  const [typeOpen, setTypeOpen] = useState(false);
  const typeRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  // Default list of issues from the same project — shown when the search
  // box is empty so the user can pick from a real list, not a "type to
  // search" placeholder.
  const [defaults, setDefaults] = useState<SearchHit[]>([]);
  const [recent] = useState<SearchHit[]>(() => readRecent().filter((h) => h.id !== excludeIssueId));
  const [picked, setPicked] = useState<SearchHit | null>(null);
  // Default the popover open so the user sees "Recently viewed" the moment
  // the creator appears — no extra click required.
  const [popoverOpen, setPopoverOpen] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Auto-focus the input on mount so typing starts immediately.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Pre-fetch a default page of issues from the same project so the dropdown
  // shows real options the moment it opens — no need to type first.
  useEffect(() => {
    let alive = true;
    void fetch(
      `/api/issues?projectId=${encodeURIComponent(projectId)}&excludeType=SUBTASK&limit=20`,
    )
      .then((r) => r.json())
      .then((res) => {
        if (!alive || !res?.success) return;
        const hits: SearchHit[] = (res.data ?? [])
          .filter((i: SearchHit) => i.id !== excludeIssueId)
          .map((i: SearchHit) => ({ id: i.id, key: i.key, title: i.title, type: i.type }));
        setDefaults(hits);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [projectId, excludeIssueId]);

  // Debounce search input.
  useEffect(() => {
    const t = setTimeout(() => setAppliedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Live search.
  useEffect(() => {
    if (!appliedQuery) {
      setResults([]);
      return;
    }
    let alive = true;
    void fetch(
      `/api/issues?projectId=${encodeURIComponent(projectId)}&search=${encodeURIComponent(
        appliedQuery,
      )}&excludeType=SUBTASK&limit=10`,
    )
      .then((r) => r.json())
      .then((res) => {
        if (!alive) return;
        if (res?.success) {
          const hits: SearchHit[] = (res.data ?? [])
            .filter((i: SearchHit) => i.id !== excludeIssueId)
            .map((i: SearchHit) => ({ id: i.id, key: i.key, title: i.title, type: i.type }));
          setResults(hits);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [appliedQuery, projectId, excludeIssueId]);

  // Outside-click closes type + popover (popover only; the panel itself stays).
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (typeOpen && typeRef.current && !typeRef.current.contains(t)) setTypeOpen(false);
      if (popoverOpen && popoverRef.current && !popoverRef.current.contains(t)) setPopoverOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [typeOpen, popoverOpen]);

  async function submit() {
    if (!picked || submitting) return;
    setSubmitting(true);
    try {
      await onCreate(picked, type);
    } finally {
      setSubmitting(false);
    }
  }

  const showRecent = !appliedQuery && recent.length > 0;
  // When no query: recents first (deduped), then the rest of the project's
  // issues. When searching: live API results.
  const idle: SearchHit[] = (() => {
    const seen = new Set(recent.map((r) => r.id));
    const fill = defaults.filter((d) => !seen.has(d.id));
    return [...recent, ...fill];
  })();
  const hits = appliedQuery ? results : idle;

  return (
    <div className="border border-gray-200 rounded-md p-3 mb-2 bg-white">
      <div className="flex items-center gap-2">
        <div className="relative" ref={typeRef}>
          <button
            type="button"
            onClick={() => setTypeOpen((v) => !v)}
            className="inline-flex items-center justify-between gap-2 h-9 px-3 min-w-[140px] text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            <span>{LINK_TYPE_LABELS[type]}</span>
            <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
          </button>
          {typeOpen && (
            <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1">
              {(Object.keys(LINK_TYPE_LABELS) as LinkType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setType(t);
                    setTypeOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${
                    t === type ? "text-blue-700 bg-blue-50" : "text-gray-700"
                  }`}
                >
                  {LINK_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative flex-1" ref={popoverRef}>
          <input
            ref={inputRef}
            value={picked ? `${picked.key} ${picked.title}` : query}
            onChange={(e) => {
              setPicked(null);
              setQuery(e.target.value);
              setPopoverOpen(true);
            }}
            onFocus={() => setPopoverOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
              if (e.key === "Enter" && picked) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="Type, search or paste URL"
            className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {popoverOpen && (
            <div className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1 max-h-72 overflow-y-auto">
              {!appliedQuery && (
                <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {showRecent ? "Recently viewed" : "Work items"}
                </div>
              )}
              {hits.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-400">
                  {appliedQuery ? "No matches" : "No other work items in this project"}
                </div>
              )}
              {hits.map((h) => {
                const T = TYPE_ICON[h.type] ?? TYPE_ICON.TASK!;
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      setPicked(h);
                      setPopoverOpen(false);
                      setQuery("");
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50"
                  >
                    <T.Icon className={`h-4 w-4 shrink-0 ${T.color}`} />
                    <span className="font-medium text-gray-800 shrink-0">{h.key}</span>
                    <span className="text-gray-700 truncate min-w-0">{h.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onCreateNew(type)}
          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
        >
          <Plus className="h-3.5 w-3.5" />
          Create linked work item
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!picked || submitting}
            className="h-8 px-3 inline-flex items-center gap-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500"
          >
            <CornerDownLeft className="h-3.5 w-3.5" />
            Link
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-8 px-3 text-xs text-gray-700 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
