"use client";

import { useEffect, useState } from "react";
import { PortalDropdown } from "../../_shared/portal-dropdown";
import { DatePickerInput } from "../../_shared/date-picker-input";
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
  const [descEditing, setDescEditing] = useState(false);
  const [descDraft, setDescDraft] = useState(release.description ?? "");

  useEffect(() => setDescDraft(release.description ?? ""), [release.description]);

  const statusMeta = RELEASE_STATUS_OPTIONS.find((s) => s.value === release.status);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      {canEdit ? (
        <PortalDropdown
          placeholder={statusMeta?.label ?? release.status}
          options={RELEASE_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          selected={[release.status]}
          onChange={(next) => {
            const value = next[0] as ReleaseStatus | undefined;
            if (value && value !== release.status) onPatch({ status: value });
          }}
        />
      ) : (
        <div className="h-9 px-3 flex items-center text-sm font-medium border border-gray-200 rounded bg-gray-50 text-gray-700">
          {statusMeta?.label ?? release.status}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-[11px] font-medium text-gray-500 mb-1">Start date</div>
          {canEdit ? (
            <DatePickerInput
              value={toDateInput(release.startDate)}
              onChange={(v) => onPatch({ startDate: v ? new Date(v).toISOString() : null })}
            />
          ) : (
            <div className="text-gray-700">{fmtDate(release.startDate)}</div>
          )}
        </div>
        <div>
          <div className="text-[11px] font-medium text-gray-500 mb-1">Release date</div>
          {canEdit ? (
            <DatePickerInput
              value={toDateInput(release.releaseDate)}
              onChange={(v) => onPatch({ releaseDate: v ? new Date(v).toISOString() : null })}
            />
          ) : (
            <div className="text-gray-700">{fmtDate(release.releaseDate)}</div>
          )}
        </div>
      </div>

      <div>
        <div className="text-[11px] font-medium text-gray-500 mb-1">Driver</div>
        {canEdit ? (
          <PortalDropdown
            placeholder="Unassigned"
            options={[
              { value: "", label: "Unassigned" },
              ...members.map((m) => ({ value: m.userId, label: memberLabel(m) })),
            ]}
            selected={[release.driverId ?? ""]}
            onChange={(next) => onPatch({ driverId: next[0] || null })}
          />
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

