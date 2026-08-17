"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import {
  RightPanel,
  RightPanelCancelButton,
  RightPanelFooter,
} from "@quikit/ui";
import { hiddenContentNotice, layoutFor } from "@/lib/test/caseLayout";
import { caseRef, labelOf, type CaseLabel } from "./case-meta";
import {
  ApprovalPill,
  DetailRow,
  EstimateText,
  LabelChips,
  PriorityPill,
  StepList,
  TextBlock,
} from "./case-detail-fields";

/**
 * Read-only case detail panel (QUIKTR-336).
 *
 * The spec opens a case for READING, with an explicit Edit to switch into the
 * form. Previously clicking a row went straight into the editor, which meant
 * every look at a case was an edit session — and saving there always mints a new
 * version, so simply opening a case to check a step invited a pointless version
 * bump. Reading is now the default and editing is deliberate.
 *
 * Empty fields are omitted rather than shown as dashes: on a read-only surface a
 * column of "—" buries the fields that actually carry content.
 */

interface CaseDetail {
  id: string;
  refId: number;
  title: string;
  description: string | null;
  preconditions: string | null;
  expectedResult: string | null;
  priority: string;
  type: string;
  automationStatus: string;
  automationId: string | null;
  automationTool: string | null;
  automationCandidate: string | null;
  refTickets: string | null;
  estimateMs: number | null;
  approvalState: string;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  labels: CaseLabel[];
  owner: { id: string; firstName: string; lastName: string } | null;
  template: { id: string; name: string; kind: string } | null;
  steps: Array<{ id: string; action: string; expected: string | null }>;
}

export function CaseDetailPanel({
  open,
  caseId,
  onClose,
  onEdit,
  canEdit,
}: {
  open: boolean;
  caseId: string | null;
  onClose: () => void;
  onEdit: () => void;
  canEdit: boolean;
}) {
  const [data, setData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !caseId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    // Clear the previous case's data so a slow fetch never shows the last case's
    // fields under the new one's header.
    setData(null);

    fetch(`/api/test/cases/${caseId}`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: CaseDetail; error?: string }) => {
        if (!alive) return;
        if (!j.success || !j.data) {
          setError(j.error ?? "Could not load this case.");
          return;
        }
        setData(j.data);
      })
      .catch(() => {
        if (alive) setError("Could not load this case.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [open, caseId]);

  const { showSteps, showExpected } = layoutFor(data?.template?.kind);
  const hidden = data
    ? hiddenContentNotice(data.template?.kind, {
        stepCount: data.steps.length,
        hasExpectedResult: Boolean(data.expectedResult),
      })
    : null;

  return (
    <RightPanel
      open={open}
      onClose={onClose}
      title={data ? data.title : "Test case"}
      subtitle={
        data
          ? `${caseRef(data.refId)} · version ${data.currentVersion}`
          : undefined
      }
      size="lg"
      footer={
        <RightPanelFooter>
          <RightPanelCancelButton onClick={onClose} label="Close" />
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              disabled={!data}
              className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-xs text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
        </RightPanelFooter>
      }
    >
      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {data && (
        <div className="space-y-5">
          <dl className="divide-y divide-gray-100">
            <DetailRow label="Status">
              <ApprovalPill value={data.approvalState} />
            </DetailRow>
            <DetailRow label="Priority">
              <PriorityPill value={data.priority} />
            </DetailRow>
            <DetailRow label="Type">{labelOf(data.type)}</DetailRow>
            <DetailRow label="Template">{data.template?.name ?? null}</DetailRow>
            <DetailRow label="Assigned to">
              {data.owner
                ? `${data.owner.firstName} ${data.owner.lastName}`.trim()
                : null}
            </DetailRow>
            <DetailRow label="Estimate">
              <EstimateText ms={data.estimateMs} />
            </DetailRow>
            <DetailRow label="Automation">
              {data.automationStatus === "AUTOMATED" ? "Automated" : "Manual"}
            </DetailRow>
            <DetailRow label="Automation type">{data.automationTool}</DetailRow>
            <DetailRow label="Automation candidate">
              {data.automationCandidate
                ? labelOf(data.automationCandidate)
                : null}
            </DetailRow>
            <DetailRow label="Automation ID">
              {data.automationId ? (
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                  {data.automationId}
                </code>
              ) : null}
            </DetailRow>
            <DetailRow label="Labels">
              <LabelChips labels={data.labels} />
            </DetailRow>
            <DetailRow label="References">{data.refTickets}</DetailRow>
          </dl>

          {data.description && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Description
              </h3>
              <TextBlock text={data.description} />
            </section>
          )}

          {data.preconditions && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Preconditions
              </h3>
              <TextBlock text={data.preconditions} />
            </section>
          )}

          {/* Which body shape is authoritative follows the template, exactly as
              the editor does. Both are stored on every case, so showing the one
              the template doesn't use would surface content the author can't see
              while editing. */}
          {showSteps && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Steps
              </h3>
              <StepList steps={data.steps} />
            </section>
          )}

          {showExpected && data.expectedResult && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Expected result
              </h3>
              <TextBlock text={data.expectedResult} />
            </section>
          )}

          {/* Content authored under a different template is preserved but hidden
              by the rules above. Say so, rather than letting it look deleted. */}
          {hidden === "steps" && (
            <p className="text-xs text-gray-400">
              This case also has {data.steps.length} saved step
              {data.steps.length === 1 ? "" : "s"} from a step-based template.
              They are kept, and reappear if the template is switched back.
            </p>
          )}
          {hidden === "expected" && (
            <p className="text-xs text-gray-400">
              This case also has a case-level expected result from a text-based
              template. It is kept, and reappears if the template is switched
              back.
            </p>
          )}

          <p className="border-t border-gray-100 pt-3 text-xs text-gray-400">
            Created {new Date(data.createdAt).toLocaleString()} · Updated{" "}
            {new Date(data.updatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </RightPanel>
  );
}
