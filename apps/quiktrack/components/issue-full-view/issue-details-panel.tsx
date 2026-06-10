"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Zap } from "lucide-react";
import type { IssuePageData } from "./types";
import {
  AssigneeField,
  PriorityField,
  SprintField,
  DateField,
  NumberField,
} from "./issue-details-fields";
import {
  avatarColor,
  userInitials,
  memberName,
  type FieldMember,
} from "./issue-field-utils";

type Member = FieldMember;

function statusPillClass(category?: string) {
  if (category === "DONE") return "qt-issue-status-pill qt-issue-status-pill--done bg-green-100 text-green-700 hover:bg-green-200";
  if (category === "IN_PROGRESS") return "qt-issue-status-pill qt-issue-status-pill--progress bg-blue-100 text-blue-700 hover:bg-blue-200";
  return "qt-issue-status-pill qt-issue-status-pill--todo bg-gray-100 text-gray-700 hover:bg-gray-200";
}

/**
 * Right-rail Details panel for the full-page issue view. Shows status pill,
 * "My pinned fields" + "Details" cards. Each editable row uses a thin
 * `PATCH /api/issues/[id]` round-trip via the parent's `onPatch` callback.
 */
export function IssueDetailsPanel({
  issue,
  onPatch,
}: {
  issue: IssuePageData;
  onPatch: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [statuses, setStatuses] = useState<{ id: string; name: string; category: string }[]>([]);
  const [sprints, setSprints] = useState<{ id: string; name: string }[]>([]);
  const [statusOpen, setStatusOpen] = useState(false);

  useEffect(() => {
    void fetch(`/api/projects/${issue.projectId}/members`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) {
          const list = Array.isArray(j.data?.members) ? j.data.members : j.data ?? [];
          setMembers(list);
        }
      })
      .catch(() => undefined);
    void fetch(`/api/projects/${issue.projectId}/statuses`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setStatuses(j.data ?? []);
      })
      .catch(() => undefined);
    void fetch(`/api/sprints?projectId=${issue.projectId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setSprints(j.data ?? []);
      })
      .catch(() => undefined);
  }, [issue.projectId]);

  const reporter = members.find((m) => m.userId === issue.reporterId);

  return (
    <aside className="space-y-3 text-sm">
      {/* Status pill + lightning automation slot — pill colour follows the
          status category (BACKLOG = gray, IN_PROGRESS = blue, DONE = green)
          so the button reads at-a-glance. Dropdown options use the same
          coloured-pill treatment. */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setStatusOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold uppercase tracking-wider rounded ${statusPillClass(
              issue.status?.category,
            )}`}
          >
            {issue.status?.name ?? "To Do"}
            <ChevronDown className="h-3 w-3" />
          </button>
          {statusOpen && (
            <div className="absolute left-0 top-full mt-1 min-w-[180px] bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1.5">
              {statuses.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={async () => {
                    await onPatch({ statusId: s.id });
                    setStatusOpen(false);
                  }}
                  className={`w-full flex items-center px-2.5 py-1 text-left hover:bg-gray-50 ${
                    s.id === issue.statusId ? "bg-blue-50/60" : ""
                  }`}
                >
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${statusPillClass(
                      s.category,
                    )}`}
                  >
                    {s.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Details */}
      <Card title="Details">
        <Row label="Assignee">
          <AssigneeField
            members={members}
            value={issue.assigneeId}
            onChange={(id) => void onPatch({ assigneeId: id })}
          />
        </Row>
        <Row label="Priority">
          <PriorityField
            value={issue.priority}
            onChange={(p) => void onPatch({ priority: p })}
          />
        </Row>
        {/* Parent row — only meaningful for SUBTASKs (which sit under a
            task). Epics and top-level work items hide this row. */}
        {issue.type === "SUBTASK" && (
          <Row label="Parent">
            {issue.parent ? (
              <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-xs">
                <Zap className="h-3 w-3" />
                {issue.parent.key} {issue.parent.title}
              </span>
            ) : (
              <span className="text-gray-500">None</span>
            )}
          </Row>
        )}
        <Row label="Start date">
          <DateField
            value={issue.startDate}
            onChange={(iso) => void onPatch({ startDate: iso ?? undefined })}
          />
        </Row>
        <Row label="Due date">
          <DateField
            value={issue.dueDate}
            onChange={(iso) => void onPatch({ dueDate: iso ?? undefined })}
          />
        </Row>
        <Row label="Labels">
          <span className="text-gray-500">None</span>
        </Row>
        <Row label="Team">
          <span className="text-gray-500">None</span>
        </Row>
        {/* Sprint row hidden on epics (epics span sprints by definition). */}
        {issue.type !== "EPIC" && (
          <Row label="Sprint">
            <SprintField
              sprints={sprints}
              value={issue.sprintId}
              onChange={(id) => void onPatch({ sprintId: id })}
            />
          </Row>
        )}
        <Row label="Original estimate">
          <NumberField
            value={issue.eta}
            suffix="h"
            onCommit={(n) => void onPatch({ eta: n ?? undefined })}
          />
        </Row>
        <Row label="Time remaining">
          <span className="text-gray-700">0m</span>
        </Row>
        <Row label="Story point estimate">
          <NumberField
            value={issue.storyPoints}
            onCommit={(n) => void onPatch({ storyPoints: n ?? undefined })}
          />
        </Row>
        <Row label="Reporter">
          {reporter?.user ? (
            <span className="inline-flex items-center gap-2">
              <span
                className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                style={{ background: avatarColor(reporter.userId) }}
              >
                {userInitials(reporter.user)}
              </span>
              {memberName(reporter.user)}
            </span>
          ) : (
            <span className="text-gray-500">None</span>
          )}
        </Row>
      </Card>
    </aside>
  );
}

function Card({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-gray-200 rounded-md">
      <div
        className={`flex items-center justify-between px-3 py-2 ${
          open ? "border-b border-gray-100" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {title}
        </button>
        {trailing}
      </div>
      {open && <div className="px-4 py-3 space-y-2.5">{children}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-2 text-xs">
      <div className="text-gray-500 pt-0.5">{label}</div>
      <div className="text-gray-800 min-w-0">{children}</div>
    </div>
  );
}
