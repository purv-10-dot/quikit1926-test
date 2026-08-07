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

/**
 * Create a run over a whole suite.
 *
 * Suite-scoped only for now — a case-level picker is the separate "select cases"
 * modal (#21 in the inventory). The API already accepts `caseIds`, so that
 * lands without touching the endpoint.
 */

interface SuiteLite {
  id: string;
  name: string;
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
  const [build, setBuild] = useState("");
  const [environment, setEnvironment] = useState("");
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName("");
    setBuild("");
    setEnvironment("");
    setIncludeDrafts(false);
  }, [open]);

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

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/test/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: name.trim(),
          suiteId,
          build: build.trim() || undefined,
          environment: environment.trim() || undefined,
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

        <Checkbox
          checked={includeDrafts}
          onChange={(e) => setIncludeDrafts(e.target.checked)}
          label="Include draft cases"
          description="Draft cases are excluded by default, so a run only covers cases that have been reviewed."
        />
      </div>
    </RightPanel>
  );
}
