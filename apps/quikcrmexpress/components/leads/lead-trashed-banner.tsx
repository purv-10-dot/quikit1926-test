"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { useConfirm } from "@quikit/ui";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Props {
  leadId: string;
  leadName: string;
  deletedAt: Date | string;
  isAdmin: boolean;
}

/**
 * Banner shown on the lead detail page when the lead is in trash. Replaces the
 * normal action bar with Restore + (admin-only) Permanent Delete. Detail tabs
 * still render below in read-only state — the API blocks edits with 410 Gone.
 */
export function LeadTrashedBanner({ leadId, leadName, deletedAt, isAdmin }: Props) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const trashedAt = typeof deletedAt === "string" ? new Date(deletedAt) : deletedAt;

  async function restore() {
    setBusy(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/restore`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Restore failed");
      }
      toast.success("Lead restored");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  }

  async function permanentDelete() {
    const ok = await confirm({
      title: "Permanently delete this lead?",
      description: `"${leadName}" will be permanently removed. This cannot be undone.`,
      confirmLabel: "Permanently delete",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/permanent`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Permanent delete failed");
      }
      toast.success("Lead permanently deleted");
      router.push("/leads");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Permanent delete failed");
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
      <div className="flex items-center gap-2 text-amber-900">
        <Trash2 className="h-4 w-4" />
        <span className="font-semibold">This lead is in Trash</span>
        <span className="text-xs text-amber-700">
          · deleted {trashedAt.toLocaleString()} · read-only
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" onClick={restore} disabled={busy}>
          <RotateCcw size={14} /> Restore lead
        </Button>
        {isAdmin && (
          <button
            type="button"
            onClick={permanentDelete}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 size={14} /> Delete forever
          </button>
        )}
      </div>
    </div>
  );
}
