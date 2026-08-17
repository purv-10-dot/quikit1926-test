"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Checkbox,
  Field,
  Input,
  RightPanel,
  RightPanelCancelButton,
  RightPanelFooter,
  RightPanelSubmitButton,
  Select,
} from "@quikit/ui";
import { useApiData } from "@/lib/hooks/useApiData";
import type { SectionNode } from "../../_components/case-meta";
import { IncludeCasesField, type IncludeMode } from "./include-cases-field";

/**
 * Create a run over a whole suite, or over a hand-picked set of cases
 * (QUIKTR-337).
 *
 * The API takes `suiteId` OR `caseIds` and rejects both together, so `mode`
 * decides which one goes in the body — never both.
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
}

export function NewRunPanel({
  open,
  onClose,
  projectId,
  onCreated,
}: NewRunPanelProps) {
  const router = useRouter();
  const { data: suites } = useApiData<SuiteLite[]>(
    ["quiktrack", "test-suites", projectId],
    open ? `/api/test/suites?projectId=${projectId}` : null,
  );

  const [name, setName] = useState("");
  const [suiteId, setSuiteId] = useState("");
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
    setBuild("");
    setEnvironment("");
    setStartDate("");
    setEndDate("");
    setRefTickets("");
    setIncludeDrafts(false);
    setMode("suite");
    setPicked(new Set());
  }, [open]);

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
          ...(mode === "pick"
            ? { caseIds: Array.from(picked) }
            : { suiteId }),
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
      footer={
        <RightPanelFooter>
          <RightPanelCancelButton onClick={onClose} />
          <RightPanelSubmitButton
            onClick={submit}
            disabled={saving}
            label={saving ? "Creating…" : "Create run"}
          />
        </RightPanelFooter>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <Field label="Name" required>
          <Input
            value={name}
            placeholder="Sprint 14 regression"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="Suite" required>
          <Select
            options={(suites ?? []).map((s) => ({ value: s.id, label: s.name }))}
            value={suiteId}
            placeholder={suites?.length ? "Choose a suite" : "No suites yet"}
            onChange={(e) => setSuiteId(e.target.value)}
          />
        </Field>

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

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Build" hint="Optional. Ties the run to a release build.">
            <Input
              value={build}
              placeholder="1.4.0"
              onChange={(e) => setBuild(e.target.value)}
            />
          </Field>
          <Field label="Environment">
            <Input
              value={environment}
              placeholder="staging"
              onChange={(e) => setEnvironment(e.target.value)}
            />
          </Field>
        </div>

        {/* QUIKTR-320 — the planned execution window. Both optional: an ad-hoc
            or CI run has no planned dates. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Start date">
            <Input
              type="date"
              value={startDate}
              // A native date input can't express "before the end date", so the
              // max is set from the other field — the schema and a DB CHECK both
              // back it up.
              max={endDate || undefined}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="End date" error={dateError}>
            <Input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>

        <Field
          label="References"
          hint="Ticket ids in another tracker, e.g. JIRA-1, JIRA-3."
        >
          <Input
            value={refTickets}
            placeholder="JIRA-1, JIRA-3"
            onChange={(e) => setRefTickets(e.target.value)}
          />
        </Field>

        <Checkbox
          checked={includeDrafts}
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
