"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { CheckCircle2, Plus, UserCheck, X } from "lucide-react";
import { showToast } from "@/lib/ui/toast";
import { confirmDialog } from "@/lib/ui/confirm";
import {
  APPROVER_STATUS_META,
  memberInitials,
  memberLabel,
  type ReleaseApprover,
  type ReleaseMember,
} from "./release-detail-meta";

export function ApproversSection({
  releaseId,
  approvers,
  members,
  canManage,
  onChanged,
}: {
  releaseId: string;
  approvers: ReleaseApprover[];
  members: ReleaseMember[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? null;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerUserId, setPickerUserId] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const availableMembers = members.filter((m) => !approvers.some((a) => a.userId === m.userId));

  async function addApprover() {
    if (!pickerUserId) return;
    const res = await fetch(`/api/releases/${releaseId}/approvers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: pickerUserId }),
    }).then((r) => r.json());
    if (res?.success) {
      setPickerOpen(false);
      setPickerUserId("");
      onChanged();
    } else {
      showToast(res?.error || "Couldn't add the approver.", "error");
    }
  }

  async function removeApprover(a: ReleaseApprover) {
    const ok = await confirmDialog({
      title: "Remove approver",
      message: "Remove this person from the approvers list?",
      confirmText: "Remove",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/releases/${releaseId}/approvers/${a.id}`, {
      method: "DELETE",
    }).then((r) => r.json());
    if (res?.success) onChanged();
    else showToast(res?.error || "Couldn't remove the approver.", "error");
  }

  async function act(a: ReleaseApprover, status: "APPROVED" | "CHANGES_REQUESTED") {
    setBusyId(a.id);
    try {
      const res = await fetch(`/api/releases/${releaseId}/approvers/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, comment: commentDrafts[a.id]?.trim() || undefined }),
      }).then((r) => r.json());
      if (res?.success) onChanged();
      else showToast(res?.error || "Couldn't record your decision.", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">
          Approvers <span className="text-gray-400 font-normal">{approvers.length}</span>
        </h3>
        {canManage && !pickerOpen && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="p-1 hover:bg-gray-100 rounded text-gray-500"
            aria-label="Add approver"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {pickerOpen && (
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <select
            value={pickerUserId}
            onChange={(e) => setPickerUserId(e.target.value)}
            className="flex-1 h-8 px-2 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Choose a member</option>
            {availableMembers.map((m) => (
              <option key={m.userId} value={m.userId}>
                {memberLabel(m)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!pickerUserId}
            onClick={addApprover}
            className="h-8 px-2.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:bg-gray-200 disabled:text-gray-500"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setPickerOpen(false);
              setPickerUserId("");
            }}
            className="h-8 px-2 text-xs text-gray-700 hover:bg-gray-100 rounded"
          >
            Cancel
          </button>
        </div>
      )}

      {approvers.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <UserCheck className="mx-auto h-6 w-6 text-gray-300" />
          <div className="mt-2 text-sm font-medium text-gray-700">No approvers have been added</div>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {approvers.map((a) => {
            const m = members.find((x) => x.userId === a.userId);
            const meta = APPROVER_STATUS_META[a.status];
            const isSelf = a.userId === currentUserId;
            return (
              <div key={a.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-6 w-6 shrink-0 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center">
                      {m ? memberInitials(m) : "?"}
                    </span>
                    <span className="text-sm text-gray-800 truncate">
                      {m ? memberLabel(m) : "Unknown member"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${meta.className}`}>
                      {meta.label}
                    </span>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => void removeApprover(a)}
                        className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-red-600"
                        aria-label="Remove approver"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {a.comment && (
                  <div className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5">{a.comment}</div>
                )}
                {a.actedAt && (
                  <div className="text-[11px] text-gray-400">
                    Acted {new Date(a.actedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                )}

                {isSelf && a.status === "PENDING" && (
                  <div className="space-y-1.5">
                    <input
                      value={commentDrafts[a.id] ?? ""}
                      onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [a.id]: e.target.value }))}
                      placeholder="Optional comment"
                      className="w-full h-8 px-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() => void act(a, "APPROVED")}
                        className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() => void act(a, "CHANGES_REQUESTED")}
                        className="h-7 px-2.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded disabled:opacity-60"
                      >
                        Request changes
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
