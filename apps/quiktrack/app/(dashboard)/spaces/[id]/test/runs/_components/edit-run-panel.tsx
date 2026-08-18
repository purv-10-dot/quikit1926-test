"use client";

import { useEffect, useState } from "react";
import { Field, Input, RightPanel, Textarea } from "@quikit/ui";
import { PanelFooter } from "@/components/test/panel-footer";
import { SelectMenu } from "@/components/test/select-menu";
import { useProjectMembers } from "../../_components/use-project-members";
import { RunContextFields } from "./run-context-fields";
import type { RunRow } from "./run-types";

/**
 * Edit a run's metadata.
 *
 * Deliberately NOT the case list: removing a case that already has results would
 * discard execution history, and `QtTestResult` is append-only by database trigger
 * precisely so that cannot happen. Adding or removing cases is a separate decision
 * with real data consequences, so it is not folded into a generic "edit".
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closed = run?.state === "closed";

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
  }, [open, run]);

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
      onSaved();
      onClose();
    } catch {
      setError("Could not save the run.");
    } finally {
      setSaving(false);
    }
  };

  return (
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

        <p className="text-xs text-gray-400">
          Which test cases are in this run cannot be changed here — a case that has
          already been executed carries results, and those are never discarded. Use
          &ldquo;Rerun&rdquo; on the run page to start a fresh pass instead.
        </p>
      </div>
    </RightPanel>
  );
}
