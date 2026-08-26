"use client";

import { useEffect, useState } from "react";
import { Field, Input, RightPanel, Textarea } from "@quikit/ui";
import { PanelFooter } from "@/components/test/panel-footer";
import { SelectMenu } from "@/components/test/select-menu";
import { useApiData } from "@/lib/hooks/useApiData";
import { useProjectMembers } from "../../_components/use-project-members";
import { IncludeCasesSummary } from "./include-cases-summary";
import { RunContextFields } from "./run-context-fields";
import { SelectCasesModal } from "./select-cases-modal";
import type { RunRow } from "./run-types";

/**
 * Edit a run's metadata, plus adding/removing test cases via the same
 * `SelectCasesModal` used at creation (QUIKTR-341).
 *
 * A case with any recorded result is LOCKED in the modal (ticked, checkbox
 * disabled) — `QtTestResult` is append-only by database trigger, so that
 * history can never be discarded. An untested case already in the run shows
 * ticked but removable; a case never in the run starts unticked. On save, the
 * panel diffs the modal's returned selection against what was in the run to
 * know which ids to add and which to remove — the modal itself only tracks
 * one flat set, it doesn't know "add" from "remove".
 *
 * A CLOSED run is read-only. Its metadata is part of a signed-off record, so letting
 * someone quietly retitle or re-date it would make the audit trail lie — the panel
 * says "reopen first" rather than failing on save. The server enforces the same rule.
 */
export function EditRunPanel({
  open,
  run,
  projectId,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Null while nothing is selected. */
  run: RunRow | null;
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { members } = useProjectMembers(projectId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [build, setBuild] = useState("");
  const [environment, setEnvironment] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [refTickets, setRefTickets] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  // The run's case selection AS EDITED this session — seeded from the run's
  // current cases when the panel opens, then freely add/remove-able through
  // the modal. `null` until the current tests have loaded, so the modal never
  // opens with a false-empty "0 selected" while the fetch is in flight.
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closed = run?.state === "closed";

  // The run's current tests — case ids for the modal's initial selection, plus
  // which ones are locked (have recorded results). Reuses the same endpoint
  // the runner grid itself reads from.
  const { data: currentTests } = useApiData<{
    items: Array<{ case: { id: string }; hasResults?: boolean }>;
  }>(
    ["quiktrack", "run-tests", run?.id ?? "none", "edit-picker"],
    open && run ? `/api/test/runs/${run.id}/tests?pageSize=500` : null,
  );
  const originalIds = new Set((currentTests?.items ?? []).map((t) => t.case.id));
  const lockedIds = new Set(
    (currentTests?.items ?? []).filter((t) => t.hasResults).map((t) => t.case.id),
  );

  /** Stored timestamps come back as ISO; the date inputs want YYYY-MM-DD. */
  const toDateInput = (v: string | null) => (v ? v.slice(0, 10) : "");

  // Reload from the run each time the panel opens, so a cancelled edit leaves no
  // residue and switching rows never shows the previous run's values.
  useEffect(() => {
    if (!open || !run) return;
    setError(null);
    setName(run.name);
    setDescription(run.description ?? "");
    setAssigneeId(run.owner?.id ?? "");
    setBuild(run.build ?? "");
    setEnvironment(run.environment ?? "");
    setStartDate(toDateInput(run.startDate));
    setEndDate(toDateInput(run.endDate));
    setRefTickets(run.refTickets ?? "");
    setSelection(null);
  }, [open, run]);

  // Seed the working selection once the run's current tests arrive — separate
  // from the reset effect above, since `currentTests` loads asynchronously
  // after `open` flips true.
  useEffect(() => {
    if (open && currentTests && selection === null) {
      setSelection(new Set(originalIds));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentTests, selection]);

  const dateError =
    startDate && endDate && endDate < startDate
      ? "End date cannot be before the start date."
      : undefined;

  const submit = async () => {
    if (!run) return;
    if (!name.trim()) {
      setError("Give the run a name.");
      return;
    }
    if (dateError) {
      setError(dateError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/test/runs/${run.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          name: name.trim(),
          description: description.trim() || null,
          // null, not undefined: an omitted key means "leave alone" server-side, so
          // clearing a field has to be explicit.
          assigneeId: assigneeId || null,
          build: build.trim() || null,
          environment: environment.trim() || null,
          startDate: startDate || null,
          endDate: endDate || null,
          refTickets: refTickets.trim() || null,
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) {
        setError(json.error ?? "Could not save the run.");
        return;
      }

      // Case-list changes are diffed against what the run started with and
      // sent as up to two SEPARATE calls — distinct actions on the same PATCH
      // endpoint (see api/test/runs/[id]/route.ts) — so saving metadata alone
      // (selection unchanged) never touches the case list at all.
      const current = selection ?? originalIds;
      const toAdd = [...current].filter((id) => !originalIds.has(id));
      const toRemove = [...originalIds].filter((id) => !current.has(id));

      if (toAdd.length > 0) {
        const addRes = await fetch(`/api/test/runs/${run.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "addCases", caseIds: toAdd }),
        });
        const addJson = (await addRes.json()) as { success: boolean; error?: string };
        if (!addJson.success) {
          // Metadata already saved successfully at this point — say so, rather
          // than implying the whole save failed and inviting a repeat attempt
          // that would re-save identical metadata.
          setError(addJson.error ?? "Run details saved, but the new cases could not be added.");
          return;
        }
      }

      if (toRemove.length > 0) {
        const removeRes = await fetch(`/api/test/runs/${run.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "removeCases", caseIds: toRemove }),
        });
        const removeJson = (await removeRes.json()) as { success: boolean; error?: string };
        if (!removeJson.success) {
          setError(removeJson.error ?? "Run details saved, but some cases could not be removed.");
          return;
        }
      }

      onSaved();
      onClose();
    } catch {
      setError("Could not save the run.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <RightPanel
        open={open}
        onClose={onClose}
        title="Edit test run"
        subtitle={run ? `R${run.refId} · ${run.name}` : undefined}
        size="lg"
        footer={
          <PanelFooter>
            {/* Primary action first (left): the bottom-right corner is covered by the
                floating chat bubble. */}
            <button
              type="button"
              onClick={submit}
              disabled={saving || closed}
              className="rounded-lg bg-accent-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
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
          {closed && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              This run is closed, so its details are frozen. Reopen it from the run page
              if you need to change something.
            </p>
          )}

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <Field label="Name" required>
            <Input
              value={name}
              disabled={saving || closed}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
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
                disabled={saving || closed}
                ariaLabel="Assign to"
                onChange={setAssigneeId}
              />
            </Field>
            <Field label="Description">
              <Textarea
                rows={2}
                value={description}
                disabled={saving || closed}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </div>

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
            disabled={saving || closed}
          />

          <Field label="Include test cases">
            <IncludeCasesSummary
              count={(selection ?? originalIds).size}
              onOpen={() => setPickerOpen(true)}
              disabled={saving || closed || selection === null}
            />
          </Field>

          <p className="text-xs text-gray-400">
            A case with a recorded result can&apos;t be removed — it may carry
            history, and that&apos;s never discarded. Untested cases can be
            added or removed freely.
          </p>
        </div>
      </RightPanel>

      {run && (
        <SelectCasesModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onConfirm={setSelection}
          projectId={projectId}
          initialSelected={selection ?? originalIds}
          lockedIds={lockedIds}
        />
      )}
    </>
  );
}
