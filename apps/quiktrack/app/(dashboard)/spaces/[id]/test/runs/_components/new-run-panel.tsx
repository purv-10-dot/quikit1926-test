"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Checkbox, Field, Input, RightPanel } from "@quikit/ui";
import { PanelFooter } from "@/components/test/panel-footer";
import { SelectMenu } from "@/components/test/select-menu";
import { useProjectMembers } from "../../_components/use-project-members";
import { IncludeCasesSummary } from "./include-cases-summary";
import { RunContextFields } from "./run-context-fields";
import { SelectCasesModal } from "./select-cases-modal";

/**
 * Create a run over a hand-picked set of cases, with an owner (QUIKTR-317).
 *
 * QUIKTR-341 — the old top-level "Suite" dropdown + "All cases in this suite /
 * Select specific cases" toggle are both gone, replaced by the same
 * `SelectCasesModal` Edit's panel uses: a summary line + "Select cases…"
 * button. The modal's own suite tree covers what the dropdown used to (browse
 * to a suite), and its "Select all" covers what the old "whole suite" mode
 * did — there is no longer a distinct code path for "run everything", just a
 * selection that happens to contain everything.
 *
 * "Assign to" here sets the RUN's owner (`QtTestRun.assigneeId`). It deliberately
 * does NOT pre-assign the materialised tests: per-test assignment is independent,
 * so a lead can own the run while individual cases go to different testers, and
 * whoever executes a test need not be its assignee.
 */

interface NewRunPanelProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onCreated: () => void;
  /**
   * Pre-fills References on open — set when this panel was opened via
   * "QuikTest: Runs" on a work item (QUIKTR-341). Runs have no structured
   * Coverage relation (only cases do), so References — the same free-text
   * mechanism cases already use for "mentioned in another tracker" — is the
   * closest existing association. Still a plain editable field, not a link.
   */
  prefillRefTickets?: string;
}

export function NewRunPanel({
  open,
  onClose,
  projectId,
  onCreated,
  prefillRefTickets,
}: NewRunPanelProps) {
  const router = useRouter();
  const { members } = useProjectMembers(projectId);

  const [name, setName] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [build, setBuild] = useState("");
  const [environment, setEnvironment] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [refTickets, setRefTickets] = useState("");
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shown inline on the End date field rather than only as a save error, so the
  // problem is visible where it was made.
  const dateError =
    startDate && endDate && endDate < startDate
      ? "End date cannot be before the start date."
      : undefined;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName("");
    setAssigneeId("");
    setBuild("");
    setEnvironment("");
    setStartDate("");
    setEndDate("");
    setRefTickets(prefillRefTickets ?? "");
    setIncludeDrafts(false);
    setPicked(new Set());
  }, [open, prefillRefTickets]);

  const submit = async () => {
    if (!name.trim()) {
      setError("Give the run a name.");
      return;
    }
    if (picked.size === 0) {
      setError("Select at least one test case.");
      return;
    }
    if (dateError) {
      setError(dateError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/test/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: name.trim(),
          caseIds: Array.from(picked),
          assigneeId: assigneeId || undefined,
          build: build.trim() || undefined,
          environment: environment.trim() || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          refTickets: refTickets.trim() || undefined,
          source: "manual",
          includeDrafts,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: { id: string };
      };
      if (!json.success || !json.data) {
        setError(json.error ?? "Could not create the run.");
        return;
      }
      onCreated();
      onClose();
      // Straight into the runner — creating a run is almost always followed by
      // executing it.
      router.push(`/spaces/${projectId}/test/runs/${json.data.id}`);
    } catch {
      setError("Could not create the run.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <RightPanel
        open={open}
        onClose={onClose}
        title="New test run"
        subtitle="Materialises one test per selected case"
        size="lg"
        footer={
          <PanelFooter>
            {/* Primary action FIRST (left): the panel's bottom-right corner is
                covered by the floating chat bubble. */}
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="rounded-lg bg-accent-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create run"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-gray-200 px-4 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </PanelFooter>
        }
      >
        <div className="space-y-6">
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <Field label="Name" required>
            <Input
              value={name}
              placeholder="Sprint 14 regression"
              disabled={saving}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Field
            label="Assign to"
            hint="Who owns this run. Individual test cases are assigned separately."
          >
            <SelectMenu
              value={assigneeId}
              options={[
                { value: "", label: "Unassigned" },
                ...members.map((m) => ({ value: m.userId, label: m.name })),
              ]}
              placeholder={members.length ? "Unassigned" : "No members"}
              disabled={saving}
              ariaLabel="Assign to"
              onChange={setAssigneeId}
            />
          </Field>

          <Field label="Include test cases" required>
            <IncludeCasesSummary
              count={picked.size}
              onOpen={() => setPickerOpen(true)}
              disabled={saving}
            />
          </Field>

          <RunContextFields
            build={build}
            onBuild={setBuild}
            environment={environment}
            onEnvironment={setEnvironment}
            startDate={startDate}
            onStartDate={setStartDate}
            endDate={endDate}
            onEndDate={setEndDate}
            dateError={dateError}
            refTickets={refTickets}
            onRefTickets={setRefTickets}
            projectId={projectId}
            disabled={saving}
          />

          <Checkbox
            checked={includeDrafts}
            disabled={saving}
            onChange={(e) => setIncludeDrafts(e.target.checked)}
            label="Include draft cases"
            description="A run normally covers only approved cases. Draft/In Review cases selected above are skipped unless you tick this."
          />
        </div>
      </RightPanel>

      <SelectCasesModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={setPicked}
        projectId={projectId}
        initialSelected={picked}
        // Create has nothing to lock — every case is a plain, freely
        // toggleable "include this or not" choice.
        lockedIds={new Set()}
      />
    </>
  );
}
