"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Zap } from "lucide-react";
import { useApiData } from "@/lib/hooks/useApiData";
import { WorkflowStatusControl } from "@/components/workflow-status-control";
import { CustomFieldsSection } from "@/components/custom-fields/custom-fields-section";
import type { MemberOption } from "@/components/custom-fields/field-control";
import type { FieldValue } from "@/lib/customFields/registry";
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

/**
 * Right-rail Details panel for the full-page issue view. Shows status pill,
 * "My pinned fields" + "Details" cards. Each editable row uses a thin
 * `PATCH /api/issues/[id]` round-trip via the parent's `onPatch` callback.
 */
export function IssueDetailsPanel({
  issue,
  projectKey,
  members,
  onPatch,
}: {
  issue: IssuePageData;
  /** Readable project key for links, so URLs don't expose the project UUID. */
  projectKey: string;
  // Members are fetched once by the parent (IssueFullView) and passed down so
  // the panel doesn't fire a duplicate /api/projects/[id]/members request.
  members: Member[];
  onPatch: (data: Record<string, unknown>) => Promise<void>;
}) {
  // Project-scoped lookups — cached & shared via React Query so the status
  // dropdown and sprint picker don't refetch on every panel mount.
  const { data: statuses = [] } = useApiData<{ id: string; name: string; category: string }[]>(
    ["quiktrack", "project-statuses", issue.projectId],
    `/api/projects/${issue.projectId}/statuses`,
  );
  const { data: sprints = [] } = useApiData<{ id: string; name: string }[]>(
    ["quiktrack", "project-sprints", issue.projectId],
    `/api/sprints?projectId=${issue.projectId}`,
  );
  const reporter = members.find((m) => m.userId === issue.reporterId);

  // Custom (JPD/global + space) fields for this issue. The full-page view
  // hydrates these from `/api/issues/[id]/full`; we keep a local mirror of the
  // values so inline edits show instantly, then persist via the shared PATCH
  // (`{ customFields: { [id]: value } }`) — the same contract the side modal
  // uses.
  const customFields = issue.customFields ?? [];
  const [customValues, setCustomValues] = useState<Record<string, FieldValue>>(
    issue.customFieldValues ?? {},
  );
  const memberOptions: MemberOption[] = useMemo(
    () =>
      members
        .filter((m) => m.user)
        .map((m) => ({ id: m.userId, label: memberName(m.user) })),
    [members],
  );
  function commitCustomField(id: string, value: FieldValue) {
    setCustomValues((prev) => ({ ...prev, [id]: value }));
    void onPatch({ customFields: { [id]: value } });
  }

  return (
    <aside className="space-y-3 text-sm">
      {/* Status pill + lightning automation slot — pill colour follows the
          status category (BACKLOG = gray, IN_PROGRESS = blue, DONE = green)
          so the button reads at-a-glance. Dropdown options use the same
          coloured-pill treatment. */}
      <div className="flex items-center gap-2">
        <WorkflowStatusControl
          issueId={issue.id}
          projectId={issue.projectId}
          currentStatusId={issue.statusId}
          currentStatusName={issue.status?.name ?? "To Do"}
          currentStatusCategory={issue.status?.category}
          statuses={statuses}
          onChange={(statusId) => onPatch({ statusId })}
          onViewWorkflow={() =>
            window.open(`/spaces/${issue.projectId}/settings/workflows`, "_blank")
          }
        />
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
        {/* Sprint row hidden on epics (epics span sprints by definition) and on
            functional projects, which have no sprints (so none to pick). */}
        {issue.type !== "EPIC" && sprints.length > 0 && (
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
        {/* QuikTest deep links — mirror the TestRail-for-Jira sidebar fields.
            Not editable: they are navigation into the test module, filtered to
            this work item, not properties of the issue.
            QUIKTR-341: also carry create+link params, so opening either one
            drops the user straight into a NEW case/run already associated with
            this work item, rather than a generic unfiltered list. See
            use-link-issue-deeplink.ts (cases) / use-link-issue-run-deeplink.ts
            (runs) for how the receiving page consumes them. */}
        <Row label="QuikTest: Cases">
          <Link
            href={`/spaces/${projectKey}/test?createCase=1&linkIssueId=${encodeURIComponent(issue.id)}&linkIssueKey=${encodeURIComponent(issue.key)}`}
            className="text-blue-700 hover:underline dark:text-blue-400"
          >
            Open QuikTest: Cases
          </Link>
        </Row>
        <Row label="QuikTest: Runs">
          <Link
            href={`/spaces/${projectKey}/test/runs?createRun=1&linkIssueKey=${encodeURIComponent(issue.key)}`}
            className="text-blue-700 hover:underline dark:text-blue-400"
          >
            Open QuikTest: Runs
          </Link>
        </Row>
        {/* JPD/global + space custom fields — same picker the side modal uses,
            so the full-page panel stays in parity. Compact "detail" variant. */}
        {customFields.length > 0 && (
          <div className="pt-1">
            <CustomFieldsSection
              variant="detail"
              fields={customFields}
              values={customValues}
              onChange={commitCustomField}
              members={memberOptions}
            />
          </div>
        )}
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
