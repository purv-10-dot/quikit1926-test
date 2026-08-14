"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  RELEASE_STATUS_OPTIONS,
  memberLabel,
  toDateInput,
  fmtDate,
  type ReleaseDetail,
  type ReleaseMember,
  type ReleaseStatus,
} from "./release-detail-meta";

export function ReleaseHeaderBar({
  release,
  members,
  canEdit,
  onPatch,
}: {
  release: ReleaseDetail;
  members: ReleaseMember[];
  canEdit: boolean;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const [descEditing, setDescEditing] = useState(false);
  const [descDraft, setDescDraft] = useState(release.description ?? "");

  useEffect(() => setDescDraft(release.description ?? ""), [release.description]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (statusOpen && statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [statusOpen]);

  const statusMeta = RELEASE_STATUS_OPTIONS.find((s) => s.value === release.status);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <div className="relative" ref={statusRef}>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setStatusOpen((v) => !v)}
            className="w-full h-9 px-3 text-sm font-medium text-left border border-gray-300 rounded flex items-center justify-between disabled:cursor-default hover:bg-gray-50"
          >
            {statusMeta?.label ?? release.status}
            {canEdit && <ChevronDown className="h-3.5 w-3.5 text-gray-500" />}
          </button>
          {statusOpen && (
            <div className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1">
              {RELEASE_STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setStatusOpen(false);
                    if (opt.value !== release.status) onPatch({ status: opt.value as ReleaseStatus });
                  }}
                  className={`block w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${
                    opt.value === release.status ? "text-blue-700 font-medium" : "text-gray-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-[11px] font-medium text-gray-500 mb-1">Start date</div>
            {canEdit ? (
              <input
                type="date"
                value={toDateInput(release.startDate)}
                onChange={(e) =>
                  onPatch({ startDate: e.target.value ? new Date(e.target.value).toISOString() : null })
                }
                className="w-full h-8 px-1 text-sm border border-transparent hover:border-gray-300 focus:border-blue-500 rounded focus:outline-none"
              />
            ) : (
              <div className="text-gray-700">{fmtDate(release.startDate)}</div>
            )}
          </div>
          <div>
            <div className="text-[11px] font-medium text-gray-500 mb-1">Release date</div>
            {canEdit ? (
              <input
                type="date"
                value={toDateInput(release.releaseDate)}
                onChange={(e) =>
                  onPatch({ releaseDate: e.target.value ? new Date(e.target.value).toISOString() : null })
                }
                className="w-full h-8 px-1 text-sm border border-transparent hover:border-gray-300 focus:border-blue-500 rounded focus:outline-none"
              />
            ) : (
              <div className="text-gray-700">{fmtDate(release.releaseDate)}</div>
            )}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-gray-500 mb-1">Driver</div>
          {canEdit ? (
            <select
              value={release.driverId ?? ""}
              onChange={(e) => onPatch({ driverId: e.target.value || null })}
              className="w-full h-8 px-1 text-sm border border-transparent hover:border-gray-300 focus:border-blue-500 rounded bg-white focus:outline-none"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {memberLabel(m)}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-sm text-gray-700">
              {members.find((m) => m.userId === release.driverId)
                ? memberLabel(members.find((m) => m.userId === release.driverId)!)
                : "Unassigned"}
            </div>
          )}
        </div>

        <div>
          <div className="text-[11px] font-medium text-gray-500 mb-1">Description</div>
          {descEditing ? (
            <div>
              <textarea
                autoFocus
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                rows={3}
                className="w-full px-2 py-1.5 text-sm border border-blue-500 rounded focus:outline-none"
              />
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDescEditing(false);
                    onPatch({ description: descDraft.trim() || null });
                  }}
                  className="h-7 px-2.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDescDraft(release.description ?? "");
                    setDescEditing(false);
                  }}
                  className="h-7 px-2.5 text-xs text-gray-700 hover:bg-gray-100 rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => canEdit && setDescEditing(true)}
              className={`text-sm text-gray-700 rounded px-2 py-1.5 -mx-2 whitespace-pre-wrap ${
                canEdit ? "cursor-text hover:bg-gray-50" : ""
              }`}
            >
              {release.description || (canEdit ? "Add a description…" : "—")}
            </div>
          )}
        </div>
      </div>
  );
}

