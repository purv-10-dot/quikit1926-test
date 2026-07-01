"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  deleteDraft,
  listDraftEntries,
  type DraftListEntry,
  type NamedDraft,
} from "@/lib/activities/activity-drafts";
import type { ActivityTypeDefinition } from "@/types/activity-type";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Resume a draft in the Log-activity composer (opens it prefilled). */
  onResume: (draft: NamedDraft) => void;
}

// Human labels for the related-record kind stored on a draft.
const KIND_LABEL: Record<string, string> = {
  None: "Standalone",
  Lead: "Lead",
  Opportunity: "Opportunity",
  Contact: "Contact",
  Account: "Account",
};

/**
 * Lists the activity drafts saved on this device (localStorage) and lets the
 * user Resume one (opens the composer prefilled) or Delete it. Drafts are NOT
 * DB rows — they are unfinished composer forms — so this is a client-only view,
 * kept separate from the DB-backed activities table.
 */
export function DraftActivitiesModal({ open, onClose, onResume }: Props) {
  const toast = useToast();
  const [entries, setEntries] = useState<DraftListEntry[]>([]);
  const [typeLabels, setTypeLabels] = useState<Map<string, string>>(new Map());

  // localStorage isn't reactive: re-read every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setEntries(listDraftEntries());
  }, [open]);

  // Resolve activityTypeId → label so the list shows a readable type name.
  // Same public endpoint the composer uses; failure just falls back to "—".
  useEffect(() => {
    if (!open || typeLabels.size > 0) return;
    void fetch("/api/activities/types")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const types: ActivityTypeDefinition[] = Array.isArray(body?.data) ? body.data : [];
        setTypeLabels(new Map(types.map((t) => [t.id, t.label])));
      })
      .catch(() => {
        /* leave labels empty — the list still renders */
      });
  }, [open, typeLabels.size]);

  const rows = useMemo(
    () =>
      entries.map((e) => ({
        ...e,
        typeLabel: e.draft?.activityTypeId
          ? typeLabels.get(e.draft.activityTypeId) ?? "—"
          : "—",
        kindLabel: e.draft?.relatedKind ? KIND_LABEL[e.draft.relatedKind] ?? e.draft.relatedKind : null,
      })),
    [entries, typeLabels],
  );

  function handleDelete(key: string) {
    if (deleteDraft(key)) {
      setEntries((prev) => prev.filter((e) => e.key !== key));
      toast.success("Draft deleted");
    } else {
      toast.error("Could not delete draft");
    }
  }

  function handleResume(draft: NamedDraft | undefined) {
    if (!draft) {
      // Legacy v1 entry has no inline payload — the composer's own Drafts menu
      // still restores it. Guide the user there rather than silently no-op.
      toast.info("Open Log activity → Drafts to restore this older draft.");
      return;
    }
    onResume(draft);
  }

  return (
    <Modal open={open} onClose={onClose} title="Draft activities" width="max-w-xl">
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <FileText size={28} className="text-crm-muted" />
          <p className="text-sm font-medium text-crm-text">No saved drafts</p>
          <p className="max-w-sm text-xs text-crm-muted">
            Drafts you save from the Log activity form appear here. They&apos;re stored on this
            device only.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-crm-border">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-crm-text">{r.label}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-crm-muted">
                  <span>{r.typeLabel}</span>
                  {r.kindLabel ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>{r.kindLabel}</span>
                    </>
                  ) : null}
                  {r.savedAt ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>{r.savedAt.toLocaleString()}</span>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => handleResume(r.draft)}
                >
                  Resume
                </Button>
                <button
                  type="button"
                  onClick={() => handleDelete(r.key)}
                  className="crm-btn-ghost h-8 w-8 p-0 text-crm-muted hover:text-red-600"
                  aria-label={`Delete draft ${r.label}`}
                  title="Delete draft"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
