"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Archive, ArchiveRestore, Trash2, RotateCcw, Settings } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";

export type ProjectView = "active" | "archived" | "trash";

type LifecycleAction = "archive" | "unarchive" | "trash" | "restore";

interface ActionConfig {
  run: (spaceId: string) => Promise<Response>;
  title: string;
  message: string;
  confirmLabel: string;
  tone: "default" | "danger";
}

const ACTIONS: Record<LifecycleAction, ActionConfig> = {
  archive: {
    run: (id) =>
      fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      }),
    title: "Archive project?",
    message:
      "It'll be hidden from the projects list. You can unarchive it anytime from the Archived tab — nothing is deleted.",
    confirmLabel: "Archive",
    tone: "default",
  },
  unarchive: {
    run: (id) =>
      fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      }),
    title: "Unarchive project?",
    message: "It'll return to the active projects list.",
    confirmLabel: "Unarchive",
    tone: "default",
  },
  trash: {
    run: (id) => fetch(`/api/projects/${id}`, { method: "DELETE" }),
    title: "Move to trash?",
    message:
      "The project will be removed from the list and permanently deleted after 60 days. An admin can restore it from Trash anytime before then.",
    confirmLabel: "Move to trash",
    tone: "danger",
  },
  restore: {
    run: (id) => fetch(`/api/projects/${id}/restore`, { method: "POST" }),
    title: "Restore project?",
    message: "It'll be moved back to the active projects list.",
    confirmLabel: "Restore",
    tone: "default",
  },
};

/**
 * Per-row "..." menu on the projects list. Which items show depends on the
 * current view and the caller's rights:
 *   • Project settings — active/archived views only (any member).
 *   • Archive / Unarchive — global admins OR this space's Space Admin (canArchive).
 *   • Move to trash / Restore — global admins only (isAdmin).
 * Every mutating action confirms first, then calls onChanged() to refresh.
 */
export function SpaceRowMenu({
  spaceId,
  view,
  isAdmin,
  canArchive,
  onChanged,
}: {
  spaceId: string;
  view: ProjectView;
  isAdmin: boolean;
  canArchive: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<LifecycleAction | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function confirmAction() {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await ACTIONS[pending].run(spaceId);
      if (res.ok) {
        setPending(null);
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  const showArchive = view === "active" && canArchive;
  const showUnarchive = view === "archived" && canArchive;
  const showTrash = (view === "active" || view === "archived") && isAdmin;
  const showRestore = view === "trash" && isAdmin;
  const cfg = pending ? ACTIONS[pending] : null;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`p-1 rounded border ${
          open
            ? "border-blue-500 bg-blue-50 text-blue-600"
            : "border-transparent text-gray-500 hover:bg-gray-100"
        }`}
        aria-label="More"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-20 py-1">
          {view !== "trash" && (
            <Link
              href={`/spaces/${spaceId}/settings`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
            >
              <Settings className="h-4 w-4" />
              Project settings
            </Link>
          )}
          {showArchive && (
            <MenuItem
              icon={<Archive className="h-4 w-4" />}
              label="Archive"
              onClick={() => {
                setOpen(false);
                setPending("archive");
              }}
            />
          )}
          {showUnarchive && (
            <MenuItem
              icon={<ArchiveRestore className="h-4 w-4" />}
              label="Unarchive"
              onClick={() => {
                setOpen(false);
                setPending("unarchive");
              }}
            />
          )}
          {showRestore && (
            <MenuItem
              icon={<RotateCcw className="h-4 w-4" />}
              label="Restore"
              onClick={() => {
                setOpen(false);
                setPending("restore");
              }}
            />
          )}
          {showTrash && (
            <MenuItem
              icon={<Trash2 className="h-4 w-4" />}
              label="Move to trash"
              danger
              onClick={() => {
                setOpen(false);
                setPending("trash");
              }}
            />
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!cfg}
        title={cfg?.title ?? ""}
        message={cfg?.message}
        confirmLabel={cfg?.confirmLabel}
        tone={cfg?.tone}
        loading={busy}
        onConfirm={confirmAction}
        onCancel={() => !busy && setPending(null)}
      />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${
        danger ? "text-red-600" : "text-gray-800"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
