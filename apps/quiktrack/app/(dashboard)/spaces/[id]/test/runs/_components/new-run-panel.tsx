"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Checkbox, Field, Input, RightPanel } from "@quikit/ui";
import { PanelFooter } from "@/components/test/panel-footer";
import { SelectMenu } from "@/components/test/select-menu";
import { useApiData } from "@/lib/hooks/useApiData";
import type { SectionNode } from "../../_components/case-meta";
import { useProjectMembers } from "../../_components/use-project-members";
import { IncludeCasesField, type IncludeMode } from "./include-cases-field";
import { RunContextFields } from "./run-context-fields";

/**
 * Create a run over a whole suite, or over a hand-picked set of cases
 * (QUIKTR-337), with an owner (QUIKTR-317).
 *
 * The API takes `suiteId` OR `caseIds` and rejects both together, so `mode`
 * decides which one goes in the body — never both.
 *
 * "Assign to" here sets the RUN's owner (`QtTestRun.assigneeId`). It deliberately
 * does NOT pre-assign the materialised tests: per-test assignment is independent,
 * so a lead can own the run while individual cases go to different testers, and
 * whoever executes a test need not be its assignee.
 */

interface SuiteLite {
  id: string;
  name: string;
  sections?: SectionNode[];
}

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
  const { data: suites } = useApiData<SuiteLite[]>(
    ["quiktrack", "test-suites", projectId],
    open ? `/api/test/suites?projectId=${projectId}` : null,
  );
  const { members } = useProjectMembers(projectId);

  const [name, setName] = useState("");
  const [suiteId, setSuiteId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [mode, setMode] = useState<IncludeMode>("suite");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [build, setBuild] = useState("");
  const [environment, setEnvironment] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [refTickets, setRefTickets] = useState("");
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeSuite = (suites ?? []).find((s) => s.id === suiteId);

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
    setMode("suite");
    setPicked(new Set());
  }, [open, prefillRefTickets]);

  // Switching suite invalidates the selection — those case ids belong to the
  // suite that was open when they were ticked.
  useEffect(() => {
    setPicked(new Set());
  }, [suiteId]);

  // Preselect the only suite so the common case is one click.
  useEffect(() => {
    if (suites && suites.length > 0 && !suiteId) setSuiteId(suites[0].id);
  }, [suites, suiteId]);

  const submit = async () => {
    if (!name.trim()) {
      setError("Give the run a name.");
      return;
    }
    if (!suiteId) {
      setError("Choose a suite to run.");
      return;
    }
    if (mode === "pick" && picked.size === 0) {
      setError("Select at least one test case, or run the whole suite.");
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
          // Exactly one of these — the schema rejects both together, and sending
          // suiteId alongside caseIds would silently run the WHOLE suite
          // (suiteId wins in the service's case query).
          ...(mode === "pick" ? { caseIds: Array.from(picked) } : { suiteId }),
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
    <RightPanel
      open={open}
      onClose={onClose}
      title="New test run"
      subtitle="Materialises one test per case in the suite"
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Suite" required>
            <SelectMenu
              value={suiteId}
              options={(suites ?? []).map((s) => ({ value: s.id, label: s.name }))}
              placeholder={suites?.length ? "Choose a suite" : "No suites yet"}
              disabled={saving}
              ariaLabel="Suite"
              onChange={setSuiteId}
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
        </div>

        {/* QUIKTR-337 — whole suite, or a hand-picked subset. */}
        <IncludeCasesField
          open={open}
          projectId={projectId}
          suiteId={suiteId}
          sections={activeSuite?.sections ?? []}
          mode={mode}
          onMode={setMode}
          selected={picked}
          onSelected={setPicked}
          disabled={saving}
        />

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
          description={
            mode === "pick"
              ? "A run normally covers only approved cases. Cases marked Draft above are skipped unless you tick this — even when selected."
              : "A run normally covers only approved cases. Tick this to include cases still in Draft or In Review — useful while a suite is being written."
          }
        />
      </div>
    </RightPanel>
  );
}
