"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/**
 * [P3.A5] Automation list/grid + per-item lifecycle controls. Every action calls
 * a route that delegates to the S1 lifecycle service (publish / unpublish /
 * soft-delete / rename) — no lifecycle logic lives here (SPEC §7, §9). After a
 * successful action the server component re-reads via router.refresh().
 */

export interface AutomationRow {
  id: string;
  name: string;
  status: string;
  triggerType: string | null;
  triggerCount: number;
  updatedAt: string;
}

const STATUS_CLASS: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-700",
  Draft: "bg-slate-100 text-slate-700",
  Draining: "bg-amber-100 text-amber-700",
  Stopped: "bg-red-100 text-red-700",
  Paused: "bg-slate-100 text-slate-700",
  Archived: "bg-slate-100 text-slate-700",
};

type Dialog =
  | { kind: "publish"; row: AutomationRow }
  | { kind: "unpublish"; row: AutomationRow }
  | { kind: "rename"; row: AutomationRow }
  | { kind: "delete"; row: AutomationRow }
  | null;

export function AutomationsTable({ rows }: { rows: AutomationRow[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function openDialog(d: Dialog) {
    setError(null);
    if (d?.kind === "rename") setRenameValue(d.row.name);
    setDialog(d);
  }

  async function call(url: string, init?: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? `Request failed (${res.status})`);
        return false;
      }
      setDialog(null);
      router.refresh();
      return true;
    } catch {
      setError("Network error.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const json = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return (
    <>
      <div className="crm-card overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Status</TH>
              <TH>Trigger</TH>
              <TH className="text-right">Triggered</TH>
              <TH>Updated</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TR>
                <TD colSpan={6} className="py-8 text-center text-crm-muted">
                  No workflows yet — create one to get started.
                </TD>
              </TR>
            ) : (
              rows.map((w) => (
                <TR key={w.id}>
                  <TD>
                    <Link href={`/automations/workflows/builder?id=${w.id}`} className="crm-link font-medium">
                      {w.name}
                    </Link>
                  </TD>
                  <TD>
                    <span className={"rounded-full px-2 py-0.5 text-xs " + (STATUS_CLASS[w.status] ?? "bg-slate-100 text-slate-700")}>
                      {w.status}
                    </span>
                  </TD>
                  <TD>{w.triggerType || "—"}</TD>
                  <TD className="text-right">{w.triggerCount}</TD>
                  <TD>{new Date(w.updatedAt).toLocaleString()}</TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/automations/workflows/builder?id=${w.id}`}>
                        <Button variant="ghost" size="sm">
                          Edit
                        </Button>
                      </Link>
                      <Button variant="ghost" size="sm" onClick={() => openDialog({ kind: "rename", row: w })}>
                        Rename
                      </Button>
                      {w.status === "Draft" && (
                        <Button size="sm" onClick={() => openDialog({ kind: "publish", row: w })}>
                          Publish
                        </Button>
                      )}
                      {w.status === "Active" && (
                        <Button variant="secondary" size="sm" onClick={() => openDialog({ kind: "unpublish", row: w })}>
                          Unpublish
                        </Button>
                      )}
                      {w.status === "Draining" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled
                          title="Draining — unpublish Immediately (Stopped) before deleting."
                        >
                          Draining…
                        </Button>
                      ) : (
                        <Button variant="danger" size="sm" onClick={() => openDialog({ kind: "delete", row: w })}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>

      {/* Publish — Yes-confirm (SPEC §9) */}
      <Modal
        open={dialog?.kind === "publish"}
        onClose={() => setDialog(null)}
        title="Publish automation?"
        footer={
          <div className="flex items-center justify-end gap-2">
            {error && <span className="mr-auto text-xs text-red-600">{error}</span>}
            <Button variant="ghost" size="sm" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => dialog?.kind === "publish" && call(`/api/automations/workflows/${dialog.row.id}/publish`, { method: "POST" })}
            >
              {busy ? "Publishing…" : "Yes, publish"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-crm-text">
          <span className="font-medium">{dialog?.kind === "publish" ? dialog.row.name : ""}</span> will go live and
          start running on matching leads. Its structure locks once published (content edits stay allowed).
        </p>
      </Modal>

      {/* Unpublish — Immediate / Delayed choice (SPEC §7) */}
      <Modal
        open={dialog?.kind === "unpublish"}
        onClose={() => setDialog(null)}
        title="Unpublish automation"
        footer={
          <div className="flex items-center justify-end gap-2">
            {error && <span className="mr-auto text-xs text-red-600">{error}</span>}
            <Button variant="ghost" size="sm" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-crm-muted">Choose how in-flight leads are handled.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => dialog?.kind === "unpublish" && call(`/api/automations/workflows/${dialog.row.id}/unpublish`, json({ mode: "delayed" }))}
            className="w-full rounded-lg border border-crm-border p-3 text-left hover:bg-crm-panel disabled:opacity-60"
          >
            <div className="font-medium text-crm-text">Delayed (Drain)</div>
            <div className="text-xs text-crm-muted">Admit no new leads; let leads already mid-flow finish.</div>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => dialog?.kind === "unpublish" && call(`/api/automations/workflows/${dialog.row.id}/unpublish`, json({ mode: "immediate" }))}
            className="w-full rounded-lg border border-crm-border p-3 text-left hover:bg-crm-panel disabled:opacity-60"
          >
            <div className="font-medium text-crm-text">Immediate (Stop)</div>
            <div className="text-xs text-crm-muted">Halt all in-flight leads at once.</div>
          </button>
        </div>
      </Modal>

      {/* Rename — content-only PATCH (allowed at any lifecycle state) */}
      <Modal
        open={dialog?.kind === "rename"}
        onClose={() => setDialog(null)}
        title="Rename automation"
        footer={
          <div className="flex items-center justify-end gap-2">
            {error && <span className="mr-auto text-xs text-red-600">{error}</span>}
            <Button variant="ghost" size="sm" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy || !renameValue.trim()}
              onClick={() =>
                dialog?.kind === "rename" &&
                call(`/api/automations/workflows/${dialog.row.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: renameValue.trim() }),
                })
              }
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        <input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          className="crm-input w-full"
          placeholder="Automation name"
        />
      </Modal>

      {/* Delete — soft-delete confirm (recoverable) */}
      <Modal
        open={dialog?.kind === "delete"}
        onClose={() => setDialog(null)}
        title="Delete automation?"
        footer={
          <div className="flex items-center justify-end gap-2">
            {error && <span className="mr-auto text-xs text-red-600">{error}</span>}
            <Button variant="ghost" size="sm" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => dialog?.kind === "delete" && call(`/api/automations/workflows/${dialog.row.id}`, { method: "DELETE" })}
            >
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-crm-text">
          <span className="font-medium">{dialog?.kind === "delete" ? dialog.row.name : ""}</span> will be removed from
          the list. This is a soft-delete — the definition is retained and can be recovered.
        </p>
      </Modal>
    </>
  );
}
