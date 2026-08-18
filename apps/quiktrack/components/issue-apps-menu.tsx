"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FlaskConical, Plus } from "lucide-react";

/**
 * "Add apps" menu on a work item, matching Jira's `+` next to the status control.
 *
 * Jira lists the test-management apps installed on the instance (Zephyr, TestRail…)
 * and adding one attaches its panel to the item. QuikTest is our equivalent, so it
 * appears here rather than being permanently mounted — a work item with no tests
 * should not carry an empty test panel.
 *
 * The choice is stored per (project, issue) in localStorage rather than the database:
 * it is view chrome, like the case-list column preference, and does not warrant a
 * table, a migration, or a round-trip. The trade-off is that it does not follow a
 * user between browsers — acceptable for a panel you can re-add in one click, and
 * called out here so nobody assumes otherwise.
 */

const STORAGE_PREFIX = "quiktrack.issueApps.";

export type IssueApp = "quiktest";

function storageKey(issueId: string) {
  return `${STORAGE_PREFIX}${issueId}`;
}

/** Apps attached to this work item. Safe during SSR (returns none). */
export function loadIssueApps(issueId: string): Set<IssueApp> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(issueId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    // Filter against the known apps so a stale key from an older build cannot
    // render a panel that no longer exists.
    return new Set(parsed.filter((v): v is IssueApp => v === "quiktest"));
  } catch {
    return new Set();
  }
}

/** Fired when the attached-apps set changes, so every mounted surface re-reads it. */
const CHANGE_EVENT = "quiktrack:issue-apps-changed";

/** Persists the attached-apps set. Exported so the full view can add inline. */
export function saveIssueApps(issueId: string, apps: Set<IssueApp>) {
  try {
    window.localStorage.setItem(storageKey(issueId), JSON.stringify([...apps]));
  } catch {
    // Storage disabled or full — the panel still works this session.
  }
  // Broadcast so OTHER mounted surfaces update immediately.
  //
  // The drawer opens OVER the full page, so both are mounted at once. Each read
  // localStorage only on mount, which meant hiding the panel in the drawer left the
  // page behind it still showing it until a reload. The native `storage` event does
  // not help: browsers fire it only in OTHER tabs, never the one that wrote.
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { issueId } }));
  } catch {
    // Non-browser environment — nothing to notify.
  }
}

/**
 * Subscribes to attached-app changes for one work item.
 *
 * Returns a cleanup function. Also listens for the native `storage` event so a change
 * made in another TAB is picked up too.
 */
export function onIssueAppsChanged(
  issueId: string,
  handler: () => void,
): () => void {
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent<{ issueId?: string }>).detail;
    // Only react to this item — another work item's change is not ours.
    if (!detail?.issueId || detail.issueId === issueId) handler();
  };
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key === storageKey(issueId)) handler();
  };
  window.addEventListener(CHANGE_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

export function IssueAppsMenu({
  issueId,
  apps,
  onChange,
}: {
  issueId: string;
  apps: Set<IssueApp>;
  onChange: (next: Set<IssueApp>) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (app: IssueApp) => {
    const next = new Set(apps);
    if (next.has(app)) next.delete(app);
    else next.add(app);
    onChange(next);
    saveIssueApps(issueId, next);
    setOpen(false);
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Add apps"
        title="Add apps"
        className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Apps
          </p>
          <button
            type="button"
            onClick={() => toggle("quiktest")}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            <FlaskConical className="h-3.5 w-3.5 text-gray-400" />
            <span className="flex-1">QuikTest: Results</span>
            {apps.has("quiktest") && (
              <Check className="h-3.5 w-3.5 text-accent-600" />
            )}
          </button>
          <p className="px-3 pb-1 pt-1.5 text-[11px] leading-snug text-gray-400">
            Shows the test cases and results linked to this work item.
          </p>
        </div>
      )}
    </div>
  );
}
