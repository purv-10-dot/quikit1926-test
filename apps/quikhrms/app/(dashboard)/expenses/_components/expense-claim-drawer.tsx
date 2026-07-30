"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Receipt, Send, Check, X, FileText, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { Drawer } from "@/components/hrms/drawer";
import { Modal } from "@/components/hrms/modal";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { FileUploadInput } from "@/components/hrms/file-upload-input";
import { useToast } from "@/components/hrms/toast";
import { useDialog } from "@/components/hrms/dialog";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";

interface Item { id: string; date: string; description: string; amount: string | number; }
interface Person { id: string; firstName: string; lastName: string; employeeCode: string | null; }
interface Approval { id: string; approverId: string; approver: Person | null; level: number; action: string; comments: string | null; actionAt: string; }
interface Claim {
  id: string; employeeId: string; category: string; title: string; description: string | null;
  totalAmount: string | number; currency: string; expenseDate: string | null; status: string;
  receiptUrl: string | null; rejectionReason: string | null; submittedAt: string | null; approvedAt: string | null;
  employee: Person | null;
  items?: Item[]; approvals?: Approval[];
  policy: { id: string; name: string } | null;
}

function personName(
  e: { firstName?: string | null; lastName?: string | null; employeeCode?: string | null } | null | undefined,
  fallback: string,
): string {
  if (!e) return fallback;
  const full = `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim();
  return full || e.employeeCode || fallback;
}

const statusPill = (status: string) =>
  status === "Approved" || status === "Paid" ? "bg-green-100 text-green-700" :
  status === "Rejected" ? "bg-red-100 text-red-700" :
  status === "Draft" ? "bg-gray-100 text-gray-600" : "bg-[#dcfce7] text-[#16a34a]";

/**
 * Self-contained expense claim drawer — view + every action (submit / edit /
 * delete for owner drafts, approve / reject for approvers, line items, approval
 * trail). Replaces the old full detail page.
 */
export function ExpenseClaimDrawer({
  claimId,
  onClose,
  allowApprove = false,
}: {
  claimId: string | null;
  onClose: () => void;
  /** Approve/Reject only shows when opened in an approval context. */
  allowApprove?: boolean;
}) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const dialog = useDialog();
  const { hasPermission, employee: currentUser } = useDashboardConfig();
  const [comment, setComment] = useState("");
  const [submitResult, setSubmitResult] = useState<string[] | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState<{ title: string; description: string; totalAmount: number | null; expenseDate: string; receiptUrl: string }>(
    { title: "", description: "", totalAmount: null, expenseDate: "", receiptUrl: "" },
  );

  const { data } = useQuery({
    queryKey: ["expense-claim", claimId],
    queryFn: () => api.get<Claim>(`/api/v1/hrms/expenses/claims/${claimId}`),
    enabled: !!claimId,
  });
  const claim = data?.data;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["expense-claim", claimId] });
    qc.invalidateQueries({ queryKey: ["expenses"] });
  };

  const submitMut = useMutation({
    mutationFn: () => api.post<{ claim: Claim; violations: string[] }>(`/api/v1/hrms/expenses/claims/${claimId}/submit`, {}),
    onSuccess: (res) => { invalidate(); setSubmitResult(res.data.violations); if ((res.data.violations?.length ?? 0) === 0) toast.success("Submitted for approval"); },
    onError: (e: unknown) => toast.error("Couldn't submit", e instanceof Error ? e.message : undefined),
  });
  const approveMut = useMutation({
    mutationFn: (action: "ExpApproved" | "ExpRejected") =>
      api.post(`/api/v1/hrms/expenses/claims/${claimId}/approve`, { action, comments: comment || undefined }),
    onSuccess: (_r, action) => { invalidate(); setComment(""); toast.success(action === "ExpApproved" ? "Approved" : "Rejected"); },
    onError: (e: unknown) => toast.error("Couldn't submit decision", e instanceof Error ? e.message : undefined),
  });
  const updateMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put(`/api/v1/hrms/expenses/claims/${claimId}`, body),
    onSuccess: () => { invalidate(); setShowEdit(false); toast.success("Claim updated"); },
    onError: (e: unknown) => toast.error("Couldn't update", e instanceof Error ? e.message : undefined),
  });
  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/api/v1/hrms/expenses/claims/${claimId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); toast.success("Claim deleted"); onClose(); },
    onError: (e: unknown) => toast.error("Couldn't delete", e instanceof Error ? e.message : undefined),
  });

  // Prefill the edit form when opening it.
  useEffect(() => {
    if (claim && showEdit) {
      setEditForm({
        title: claim.title,
        description: claim.description ?? "",
        totalAmount: Number(claim.totalAmount),
        expenseDate: claim.expenseDate ? claim.expenseDate.slice(0, 10) : "",
        receiptUrl: claim.receiptUrl ?? "",
      });
    }
  }, [showEdit, claim]);

  const isOwner = !!claim && currentUser?.id === claim.employeeId;
  const isDraft = claim?.status === "Draft";
  const canSubmit = isOwner && isDraft;
  const canEditDelete = isOwner && isDraft;
  const canApprove =
    allowApprove &&
    !!claim &&
    hasPermission("hrms.expense.approve") &&
    !isOwner &&
    ["Submitted", "ManagerApproved", "FinanceApproved"].includes(claim.status);

  return (
    <Drawer open={!!claimId} onClose={onClose} width="max-w-lg" title={claim ? claim.title : "Expense claim"}>
      {!claim ? (
        <div className="p-5 space-y-2">
          <SkeletonLine w="50%" h={16} />
          <SkeletonLine w="70%" h={12} />
          <SkeletonLine w="60%" h={12} />
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <div className="flex-1 p-5 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="mt-0.5 h-9 w-9 shrink-0 rounded-lg bg-green-50 text-green-600 grid place-items-center">
                  <Receipt size={17} />
                </div>
                <div className="min-w-0">
                  <div className="text-[15px] font-bold text-slate-900 break-words">{claim.title}</div>
                  <div className="mt-0.5 text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
                    <span>{personName(claim.employee, claim.employeeId)}</span>
                    <span>·</span>
                    <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[11px] font-medium">{claim.category}</span>
                    {claim.policy && <><span>·</span><span>{claim.policy.name}</span></>}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold text-slate-900 tabular-nums">{claim.currency} {Number(claim.totalAmount).toLocaleString("en-IN")}</div>
                <span className={clsx("mt-1 inline-block px-2 py-0.5 rounded-full text-[11px] font-medium", statusPill(claim.status))}>{claim.status}</span>
              </div>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-3 gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
              {[
                { label: "Expense Date", value: claim.expenseDate ? new Date(claim.expenseDate).toLocaleDateString("en-IN") : "—" },
                { label: "Submitted", value: claim.submittedAt ? new Date(claim.submittedAt).toLocaleDateString("en-IN") : "—" },
                { label: "Approved", value: claim.approvedAt ? new Date(claim.approvedAt).toLocaleDateString("en-IN") : "—" },
              ].map((m) => (
                <div key={m.label}>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{m.label}</div>
                  <div className="text-xs font-medium text-slate-800 mt-0.5">{m.value}</div>
                </div>
              ))}
            </div>

            {claim.description && (
              <div className="text-xs text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{claim.description}</div>
            )}
            {claim.rejectionReason && (
              <div className="text-xs text-red-700 bg-red-50 rounded-lg p-3"><b>Rejection reason:</b> {claim.rejectionReason}</div>
            )}
            {claim.receiptUrl && (
              <a href={claim.receiptUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 hover:underline">
                <FileText size={13} /> View receipt
              </a>
            )}

            {submitResult && submitResult.length > 0 && (
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
                <div className="flex items-center gap-2 text-yellow-800 font-medium text-xs mb-1"><AlertTriangle size={14} /> Policy violations</div>
                <ul className="text-[11px] text-yellow-900 list-disc list-inside">
                  {submitResult.map((v, i) => <li key={i}>{v}</li>)}
                </ul>
              </div>
            )}

            {/* Line items */}
            {(claim.items?.length ?? 0) > 0 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Line items</div>
                <div className="rounded-xl border border-slate-100 divide-y divide-slate-100">
                  {(claim.items ?? []).map((it) => (
                    <div key={it.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="text-slate-800 truncate">{it.description}</div>
                        <div className="text-slate-400">{new Date(it.date).toLocaleDateString("en-IN")}</div>
                      </div>
                      <div className="text-slate-900 font-semibold shrink-0 tabular-nums">₹{Number(it.amount).toLocaleString("en-IN")}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Approval trail */}
            {(claim.approvals?.length ?? 0) > 0 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Approval trail</div>
                <div className="rounded-xl border border-slate-100 divide-y divide-slate-100">
                  {(claim.approvals ?? []).map((a) => (
                    <div key={a.id} className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-1.5 py-0.5 bg-[#dcfce7] text-[#16a34a] rounded text-[10px] font-semibold">L{a.level}</span>
                          <span className="truncate">{personName(a.approver, a.approverId)}</span>
                          <span className={clsx("px-1.5 py-0.5 rounded-full text-[10px] font-medium",
                            a.action === "ExpApproved" ? "bg-green-100 text-green-700" :
                            a.action === "ExpRejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700")}>
                            {a.action}
                          </span>
                        </div>
                        {a.comments && <div className="text-slate-600 mt-0.5">{a.comments}</div>}
                      </div>
                      <div className="text-slate-400 shrink-0">{new Date(a.actionAt).toLocaleDateString("en-IN")}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sticky action bar */}
          {(canSubmit || canEditDelete || canApprove) && (
            <div className="shrink-0 border-t border-slate-100 p-4 bg-white space-y-2">
              {canSubmit && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => submitMut.mutate()}
                    disabled={submitMut.isPending}
                    className="inline-flex items-center gap-1.5 bg-green-600 text-white px-3.5 py-2 rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
                  >
                    <Send size={13} /> {submitMut.isPending ? "Submitting…" : "Submit for Approval"}
                  </button>
                  {canEditDelete && (
                    <>
                      <button onClick={() => setShowEdit(true)} className="inline-flex items-center gap-1.5 ring-1 ring-slate-300 text-slate-700 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-slate-50">
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await dialog.confirm({ title: "Delete claim?", description: "This action cannot be undone.", confirmLabel: "Delete", variant: "danger" });
                          if (ok) deleteMut.mutate();
                        }}
                        disabled={deleteMut.isPending}
                        className="inline-flex items-center gap-1.5 ring-1 ring-red-300 text-red-600 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </>
                  )}
                </div>
              )}
              {canApprove && (
                <div className="flex items-center gap-2">
                  <input
                    placeholder="Comments (optional)"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                  />
                  <button onClick={() => approveMut.mutate("ExpApproved")} disabled={approveMut.isPending} className="inline-flex items-center gap-1 bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50">
                    <Check size={13} /> Approve
                  </button>
                  <button onClick={() => approveMut.mutate("ExpRejected")} disabled={approveMut.isPending} className="inline-flex items-center gap-1 border border-red-300 text-red-600 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-red-50 disabled:opacity-50">
                    <X size={13} /> Reject
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit modal (owner drafts) */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Expense Claim">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateMut.mutate({
              title: editForm.title,
              description: editForm.description || undefined,
              totalAmount: editForm.totalAmount ?? 0,
              expenseDate: editForm.expenseDate || undefined,
              receiptUrl: editForm.receiptUrl || undefined,
            });
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input required value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <NumberInput step="0.01" required value={editForm.totalAmount} onChange={(v) => setEditForm({ ...editForm, totalAmount: v })} className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expense Date</label>
              <input type="date" value={editForm.expenseDate} onChange={(e) => setEditForm({ ...editForm, expenseDate: e.target.value })} className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Receipt</label>
            <FileUploadInput value={editForm.receiptUrl} onChange={(url) => setEditForm({ ...editForm, receiptUrl: url })} accept="application/pdf,image/png,image/jpeg,image/webp" label="" placeholder="Upload receipt (PDF / image)" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={2} className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowEdit(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium">Cancel</button>
            <button type="submit" disabled={updateMut.isPending} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">Save changes</button>
          </div>
        </form>
      </Modal>
    </Drawer>
  );
}
