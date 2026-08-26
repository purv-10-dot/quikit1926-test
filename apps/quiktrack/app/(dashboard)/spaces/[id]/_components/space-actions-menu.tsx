"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Archive,
  Image as ImageIcon,
  LayoutTemplate,
  MoreHorizontal,
  Settings,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import type { SpaceBackground } from "@/lib/spaceBackgrounds";
import { DeleteSpaceDialog } from "./delete-space-dialog";
import { LinkedTeamsDialog } from "./linked-teams-dialog";
import { SaveAsTemplateDialog } from "./save-as-template-dialog";
import { SpaceBackgroundDialog } from "./space-background-dialog";
import { SpaceMenuItem } from "./space-menu-item";
import { managementStyleLabel, projectTypeLabel, type SpaceSummary } from "./space-actions-meta";

type Dialog = "teams" | "template" | "background" | "delete" | null;

/**
 * The project header's "..." menu — quick access to space-level actions,
 * modelled on Jira's space ellipsis menu.
 *
 * Visibility mirrors what the API already enforces, so nothing on show would
 * 403 if clicked:
 *   • Star / Linked teams / Space settings — any project member.
 *   • Save as template, Set space background — Project:update (Space Admins and
 *     org/app admins), the same gate the rest of space configuration uses.
 *   • Archive — `canArchive` from GET /api/projects/:id (global admin OR this
 *     space's Space Admin).
 *   • Delete — `isAdmin` from the same payload (global admins only).
 */
export function SpaceActionsMenu({
  projectId,
  space,
  onChanged,
}: {
  projectId: string;
  space: SpaceSummary | null;
  onChanged: () => void;
}) {
  const router = useRouter();
  const perms = useMyProjectPermissions(projectId);
  const canConfigure = perms.has("Project", "update");

  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  // Optimistic star so the label flips instantly; the refetched project is the
  // source of truth once onChanged() lands.
  const [starOverride, setStarOverride] = useState<boolean | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const starred = starOverride ?? space?.starred ?? false;

  useEffect(() => setStarOverride(null), [space?.starred]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      // Stop here so closing the menu doesn't also exit the header's fullscreen.
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  async function toggleStar() {
    if (!space) return;
    const next = !starred;
    setStarOverride(next);
    setOpen(false);
    try {
      const res = await fetch(`/api/projects/${space.id}/star`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred: next }),
      });
      if (!res.ok) {
        setStarOverride(!next);
        return;
      }
      // Keep the sidebar's Starred group in sync without a page reload.
      window.dispatchEvent(new CustomEvent("quiktrack:stars-changed"));
      onChanged();
    } catch {
      setStarOverride(!next);
    }
  }

  async function archive() {
    if (!space) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${space.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (res.ok) {
        setConfirmArchive(false);
        // The space drops out of the active list, so staying on it would show a
        // view the user can no longer reach from anywhere else.
        router.push("/spaces?view=archived");
      }
    } finally {
      setBusy(false);
    }
  }

  const settingsHref = `/spaces/${space?.projectKey ?? projectId}/settings`;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!space}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More space actions"
        title="More actions"
        // p-1 (not p-1.5) so it matches the Add-member button it sits beside.
        className={`rounded border p-1 disabled:opacity-50 ${
          open
            ? "border-accent-300 bg-accent-50 text-accent-700"
            : "border-gray-200 text-gray-600 hover:bg-gray-100"
        }`}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>

      {open && space && (
        <div
          role="menu"
          // left-0: the trigger now sits beside the space name on the LEFT of
          // the header, so the panel opens down-and-right into open space.
          // Right-anchoring here would push it back across the space title.
          className="absolute left-0 top-full z-30 mt-2 w-64 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          <SpaceMenuItem
            icon={
              <Star
                className={`h-4 w-4 ${starred ? "fill-amber-400 text-amber-400" : ""}`}
              />
            }
            label={starred ? "Remove from starred" : "Add to starred"}
            onClick={() => void toggleStar()}
          />
          <SpaceMenuItem
            icon={<Users className="h-4 w-4" />}
            label="Linked teams"
            onClick={() => {
              setOpen(false);
              setDialog("teams");
            }}
          />
          {canConfigure && (
            <>
              <SpaceMenuItem
                icon={<LayoutTemplate className="h-4 w-4" />}
                label="Save as template"
                onClick={() => {
                  setOpen(false);
                  setDialog("template");
                }}
              />
              <SpaceMenuItem
                icon={<ImageIcon className="h-4 w-4" />}
                label="Set space background"
                onClick={() => {
                  setOpen(false);
                  setDialog("background");
                }}
              />
            </>
          )}
          <Link
            href={settingsHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
          >
            <Settings className="h-4 w-4 text-gray-500" />
            Space settings
          </Link>

          {(space.canArchive || space.isAdmin) && (
            <div className="my-1 border-t border-gray-100" />
          )}
          {space.canArchive && (
            <SpaceMenuItem
              icon={<Archive className="h-4 w-4" />}
              label="Archive space"
              onClick={() => {
                setOpen(false);
                setConfirmArchive(true);
              }}
            />
          )}
          {space.isAdmin && (
            <SpaceMenuItem
              icon={<Trash2 className="h-4 w-4" />}
              label="Delete space"
              danger
              onClick={() => {
                setOpen(false);
                setDialog("delete");
              }}
            />
          )}

          {/* Read-only space metadata, Jira-style, pinned to the bottom. */}
          <div className="mt-1 border-t border-gray-100 px-3 py-2">
            <p className="text-xs font-medium text-gray-700">
              {projectTypeLabel(space.projectType)}
            </p>
            <p className="text-xs text-gray-500">
              {managementStyleLabel(space.managementStyle)}
            </p>
          </div>
        </div>
      )}

      {dialog === "teams" && (
        <LinkedTeamsDialog
          projectId={projectId}
          spaceName={space?.name ?? "this space"}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "template" && (
        <SaveAsTemplateDialog
          projectId={projectId}
          spaceName={space?.name ?? "Space"}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "background" && (
        <SpaceBackgroundDialog
          projectId={projectId}
          current={(space?.background as SpaceBackground | null) ?? null}
          onClose={() => setDialog(null)}
          onSaved={() => onChanged()}
        />
      )}
      {dialog === "delete" && space && (
        <DeleteSpaceDialog
          projectId={space.id}
          spaceName={space.name}
          onClose={() => setDialog(null)}
          onDeleted={() => {
            setDialog(null);
            router.push("/spaces");
          }}
        />
      )}

      <ConfirmDialog
        open={confirmArchive}
        title="Archive space?"
        message="It'll be hidden from the spaces list and drop off everyone's sidebar. Nothing is deleted — you can unarchive it anytime from the Archived tab."
        confirmLabel="Archive"
        loading={busy}
        onConfirm={() => void archive()}
        onCancel={() => !busy && setConfirmArchive(false)}
      />
    </div>
  );
}
