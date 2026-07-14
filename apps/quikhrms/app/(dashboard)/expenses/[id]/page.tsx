"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Receipt, Send, Check, X, FileText, AlertTriangle, Pencil, Trash2, ArrowLeft } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { Modal } from "@/components/hrms/modal";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { FileUploadInput } from "@/components/hrms/file-upload-input";
import { useToast } from "@/components/hrms/toast";
import { useDialog } from "@/components/hrms/dialog";
import { useRouter } from "next/navigation";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";

interface Item { id: string; date: string; description: string; amount: string | number; receipt: string | null; }
interface Person { id: string; firstName: string; lastName: string; employeeCode: string | null; }
interface Approval { id: string; approverId: string; approver: Person | null; level: number; action: string; comments: string | null; actionAt: string; }

function personName(
  e: { firstName?: string | null; lastName?: string | null; employeeCode?: string | null } | null | undefined,
  fallback: string,
): string {
  if (!e) return fallback;
  const full = `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim();
  return full || e.employeeCode || fallback;
}
interface PolicySnapshot {
  policyId: string; name: string; category: string;
  maxPerTransaction: number | null; maxPerMonth: number | null; maxPerYear: number | null;
  requiresReceipt: boolean; receiptThreshold: number;
  requiresPreApproval: boolean; approvalLevels: number; snapshotAt: string;
}
interface Claim {
  id: string; employeeId: string; category: string; title: string; description: string | null;
  totalAmount: string | number; currency: string; expenseDate: string | null; status: string;
  receiptUrl: string | null; rejectionReason: string | null; submittedAt: string | null;
  approvedBy: string | null; approvedAt: string | null; paidAt: string | null;
  employee: Person | null;
  items?: Item[]; approvals?: Approval[];
  policy: { id: string; name: string; approvalLevels: number; approvalChain: unknown } | null;
  policySnapshot: PolicySnapshot | null;
}

export default function ExpenseDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const dialog = useDialog();
  const router = useRouter();
  const { hasPermission, employee: currentUser } = useDashboardConfig();
  const [approvalComment, setApprovalComment] = useState("");
  const [submitResult, setSubmitResult] = useState<string[] | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState<{
    title: string; description: string; totalAmount: number | null;
    expenseDate: string; receiptUrl: string;
  }>({ title: "", description: "", totalAmount: null, expenseDate: "", receiptUrl: "" });

  const { data } = useQuery({
    queryKey: ["expense-claim", id],
    queryFn: () => api.get<Claim>(`/api/v1/hrms/expenses/claims/${id}`),
  });

  const submitMut = useMutation({
    mutationFn: () => api.post<{ claim: Claim; violations: string[] }>(`/api/v1/hrms/expenses/claims/${id}/submit`, {}),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["expense-claim", id] }); setSubmitResult(res.data.violations); },
  });

  const approveMut = useMutation({
    mutationFn: (action: "ExpApproved" | "ExpRejected") =>
      api.post(`/api/v1/hrms/expenses/claims/${id}/approve`, { action, comments: approvalComment || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expense-claim", id] }); setApprovalComment(""); },
  });

  const updateMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put(`/api/v1/hrms/expenses/claims/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense-claim", id] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setShowEdit(false);
      toast.success("Claim updated");
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/api/v1/hrms/expenses/claims/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Claim deleted");
      router.push("/expenses");
    },
  });

  const claim = data?.data;

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

  if (!claim) return (
    <div className="p-4 space-y-2">
      <SkeletonLine w="40%" h={16} />
      <SkeletonLine w="70%" h={12} />
      <SkeletonLine w="60%" h={12} />
    </div>
  );

  const canSubmit = claim.status === "Draft";
  // Only actual approvers see Approve/Reject — and never on their own claim.
  const canApprove =
    hasPermission("hrms.expense.approve") &&
    currentUser?.id !== claim.employeeId &&
    ["Submitted", "ManagerApproved", "FinanceApproved"].includes(claim.status);

  return (
    <div className="max-w-4xl">
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined" && window.history.length > 1) router.back();
          else router.push("/expenses");
        }}
        aria-label="Go back"
        className="mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-[14px] font-semibold text-green-700 bg-green-600/10 hover:bg-green-600 hover:text-white rounded-full transition-colors"
      >
        <ArrowLeft size={14} /> Back
      </button>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Receipt className="text-[#22c55e]" />
              <h1 className="text-section text-gray-900 break-words">{claim.title}</h1>
            </div>
            <div className="text-xs text-gray-500 flex items-center gap-2">
              <span>{personName(claim.employee, claim.employeeId)}</span>
              <span>•</span>
              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-[11px] font-medium">{claim.category}</span>
              {claim.policy && <><span>•</span><span>{claim.policy.name}</span></>}
            </div>
          </div>
          <div className="text-right">
            <div className="font-serif-display text-lg md:text-xl font-bold text-gray-900">{claim.currency} {Number(claim.totalAmount).toLocaleString("en-IN")}</div>
            <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium mt-1 inline-block",
              claim.status === "Approved" || claim.status === "Paid" ? "bg-green-100 text-green-700" :
              claim.status === "Rejected" ? "bg-red-100 text-red-700" :
              claim.status === "Draft" ? "bg-gray-100 text-gray-600" : "bg-[#dcfce7] text-[#16a34a]")}>
              {claim.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-xs">
          <div><div className="text-xs text-gray-500 uppercase">Expense Date</div><div>{claim.expenseDate ? new Date(claim.expenseDate).toLocaleDateString("en-IN") : "—"}</div></div>
          <div><div className="text-xs text-gray-500 uppercase">Submitted</div><div>{claim.submittedAt ? new Date(claim.submittedAt).toLocaleDateString("en-IN") : "—"}</div></div>
          <div><div className="text-xs text-gray-500 uppercase">Approved</div><div>{claim.approvedAt ? new Date(claim.approvedAt).toLocaleDateString("en-IN") : "—"}</div></div>
        </div>

        {claim.description && <div className="mt-3 text-xs text-gray-700 bg-gray-50 p-3 rounded">{claim.description}</div>}
        {claim.rejectionReason && <div className="mt-3 text-xs text-red-700 bg-red-50 p-3 rounded"><b>Rejection reason:</b> {claim.rejectionReason}</div>}

        {claim.policySnapshot && (
          <div className="mt-3 rounded-lg ring-1 ring-green-200 bg-green-50/60 p-3 text-xs text-gray-700">
            <p className="font-semibold text-green-700 mb-1">
              Policy snapshot · frozen at {new Date(claim.policySnapshot.snapshotAt).toLocaleString("en-IN")}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div><b>Name:</b> {claim.policySnapshot.name}</div>
              <div><b>Category:</b> {claim.policySnapshot.category}</div>
              {claim.policySnapshot.maxPerTransaction != null && <div><b>Per txn:</b> ₹{claim.policySnapshot.maxPerTransaction}</div>}
              {claim.policySnapshot.maxPerMonth != null && <div><b>Monthly:</b> ₹{claim.policySnapshot.maxPerMonth}</div>}
              {claim.policySnapshot.maxPerYear != null && <div><b>Yearly:</b> ₹{claim.policySnapshot.maxPerYear}</div>}
              <div><b>Approval levels:</b> {claim.policySnapshot.approvalLevels}</div>
              {claim.policySnapshot.requiresReceipt && <div><b>Receipt above:</b> ₹{claim.policySnapshot.receiptThreshold}</div>}
              {claim.policySnapshot.requiresPreApproval && <div><b>Pre-approval:</b> Required</div>}
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              Approvers validate against this frozen snapshot. Later policy edits do not affect this claim.
            </p>
          </div>
        )}

        {claim.receiptUrl && (
          <a href={claim.receiptUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-[#22c55e] hover:underline">
            <FileText size={13} /> View receipt
          </a>
        )}

        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-200">
          {canSubmit && (
            <>
              <button onClick={() => submitMut.mutate()} className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700">
                <Send size={13} /> Submit for Approval
              </button>
              <button
                onClick={() => setShowEdit(true)}
                className="flex items-center gap-1 ring-1 ring-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50"
              >
                <Pencil size={13} /> Edit
              </button>
              <button
                onClick={async () => {
                  const ok = await dialog.confirm({
                    title: "Delete claim?",
                    description: "This action cannot be undone.",
                    confirmLabel: "Delete",
                    variant: "danger",
                  });
                  if (ok) deleteMut.mutate();
                }}
                disabled={deleteMut.isPending}
                className="flex items-center gap-1 ring-1 ring-red-300 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 size={13} /> Delete
              </button>
            </>
          )}
          {canApprove && (
            <>
              <input placeholder="Comments" value={approvalComment} onChange={(e) => setApprovalComment(e.target.value)}
                className="flex-1 border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" />
              <button onClick={() => approveMut.mutate("ExpApproved")} className="flex items-center gap-1 bg-green-600 text-white px-2.5 py-1 rounded-lg text-xs font-normal hover:bg-green-700">
                <Check size={12} /> Approve
              </button>
              <button onClick={() => approveMut.mutate("ExpRejected")} className="flex items-center gap-1 border border-red-300 text-red-600 px-2.5 py-1 rounded-lg text-xs font-normal hover:bg-red-50">
                <X size={12} /> Reject
              </button>
            </>
          )}
        </div>
      </div>

      {submitResult && submitResult.length > 0 && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-yellow-800 font-medium mb-1"><AlertTriangle size={14} /> Policy violations</div>
          <ul className="text-xs text-yellow-900 list-disc list-inside">
            {submitResult.map((v, i) => <li key={i}>{v}</li>)}
          </ul>
        </div>
      )}

      {(claim.items?.length ?? 0) > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-4">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-[13px] font-semibold text-gray-700">Line Items</div>
          <table className="w-full text-xs">
            <thead className="text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-500">
              <tr><th className="text-left px-4 py-2.5">Date</th><th className="text-left px-4 py-2.5">Description</th><th className="text-right px-4 py-2.5">Amount</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(claim.items ?? []).map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-2.5">{new Date(i.date).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-2.5">{i.description}</td>
                  <td className="px-4 py-2.5 text-right">₹{Number(i.amount).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(claim.approvals?.length ?? 0) > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-[13px] font-semibold text-gray-700">Approval Trail</div>
          <div className="divide-y divide-gray-100">
            {(claim.approvals ?? []).map((a) => (
              <div key={a.id} className="px-4 py-3 flex items-center justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-[#dcfce7] text-[#16a34a] rounded text-[11px] font-medium">L{a.level}</span>
                    <span className="text-xs">{personName(a.approver, a.approverId)}</span>
                    <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium",
                      a.action === "ExpApproved" ? "bg-green-100 text-green-700" :
                      a.action === "ExpRejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700")}>
                      {a.action}
                    </span>
                  </div>
                  {a.comments && <div className="text-xs text-gray-600 mt-1">{a.comments}</div>}
                </div>
                <div className="text-xs text-gray-400">{new Date(a.actionAt).toLocaleString("en-IN")}</div>
              </div>
            ))}
          </div>
        </div>
      )}

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
            <input
              required
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <NumberInput
                step="0.01"
                required
                value={editForm.totalAmount}
                onChange={(v) => setEditForm({ ...editForm, totalAmount: v })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expense Date</label>
              <input
                type="date"
                value={editForm.expenseDate}
                onChange={(e) => setEditForm({ ...editForm, expenseDate: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Receipt</label>
            <FileUploadInput
              value={editForm.receiptUrl}
              onChange={(url) => setEditForm({ ...editForm, receiptUrl: url })}
              accept="application/pdf,image/png,image/jpeg,image/webp"
              label=""
              placeholder="Upload receipt (PDF / image)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              rows={2}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowEdit(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium">
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMut.isPending}
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50"
            >
              Save changes
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
