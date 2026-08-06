"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Gauge, Plus, Trash2, RefreshCw, Sparkles, HelpCircle } from "lucide-react";
import { SettingsReturnBackButton } from "@/components/settings/settings-return-back";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  LEAD_SCORING_FIELD_DEFS,
  operatorsForField,
} from "@/lib/services/leads/lead-scoring/fields";
import { operatorsNeedValue } from "@/lib/services/leads/lead-scoring/compute-score";
import { recommendedLeadScoringRules } from "@/lib/services/leads/lead-scoring/defaults";
import type {
  LeadScoringConfig,
  LeadScoringOperator,
  LeadScoringRule,
} from "@/lib/services/leads/lead-scoring/types";

function newRuleId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const EMPTY_RULE: Omit<LeadScoringRule, "id"> = {
  label: "",
  enabled: true,
  field: "source",
  operator: "equals",
  value: "",
  points: 10,
};

export function LeadScoringPageClient() {
  const toast = useToast();
  const [config, setConfig] = useState<LeadScoringConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [editing, setEditing] = useState<LeadScoringRule | null>(null);
  const [draft, setDraft] = useState<Omit<LeadScoringRule, "id">>(EMPTY_RULE);
  const [previewLeadId, setPreviewLeadId] = useState("");
  const [previewResult, setPreviewResult] = useState<{
    score: number;
    breakdown: {
      fitPoints: number;
      engagementPoints: number;
      rulePoints: number;
      matchedRules: { label: string; points: number }[];
    };
  } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/lead-scoring", { credentials: "include" });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || "Failed to load");
    setConfig(json.data.config as LeadScoringConfig);
  }, []);

  useEffect(() => {
    load().catch(() => toast.error("Failed to load lead scoring settings"));
  }, [load, toast]);

  async function saveConfig(next: LeadScoringConfig, message?: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/lead-scoring", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: next }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Save failed");
      setConfig(json.data.config as LeadScoringConfig);
      if (message) toast.success(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function openAdd() {
    setEditing(null);
    setDraft({ ...EMPTY_RULE });
    setModalOpen(true);
  }

  function openEdit(rule: LeadScoringRule) {
    setEditing(rule);
    setDraft({
      label: rule.label ?? "",
      enabled: rule.enabled,
      field: rule.field,
      operator: rule.operator,
      value: rule.value ?? "",
      points: rule.points,
    });
    setModalOpen(true);
  }

  function commitRule() {
    if (!config) return;
    const rule: LeadScoringRule = {
      id: editing?.id ?? newRuleId(),
      label: draft.label?.trim() || undefined,
      enabled: draft.enabled,
      field: draft.field,
      operator: draft.operator,
      value: draft.value,
      points: Number(draft.points) || 0,
    };
    const rules = editing
      ? config.rules.map((r) => (r.id === editing.id ? rule : r))
      : [...config.rules, rule];
    void saveConfig({ ...config, rules }, editing ? "Rule updated" : "Rule added");
    setModalOpen(false);
  }

  function removeRule(id: string) {
    if (!config || !confirm("Remove this scoring rule?")) return;
    void saveConfig(
      { ...config, rules: config.rules.filter((r) => r.id !== id) },
      "Rule removed",
    );
  }

  function toggleRule(rule: LeadScoringRule) {
    if (!config) return;
    void saveConfig({
      ...config,
      rules: config.rules.map((r) =>
        r.id === rule.id ? { ...r, enabled: !r.enabled } : r,
      ),
    });
  }

  function addRecommended() {
    if (!config) return;
    void saveConfig(
      { ...config, rules: [...config.rules, ...recommendedLeadScoringRules()] },
      "Recommended rules added",
    );
  }

  async function recalculateAll() {
    setRecalculating(true);
    try {
      const res = await fetch("/api/settings/lead-scoring", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recalculateAll: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Recalculate failed");
      const r = json.data.recalculateAll as { processed: number; updated: number };
      toast.success(`Recalculated ${r.processed} leads (${r.updated} scores changed)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recalculate failed");
    } finally {
      setRecalculating(false);
    }
  }

  async function runPreview() {
    if (!previewLeadId.trim()) {
      toast.error("Enter a lead ID to preview");
      return;
    }
    try {
      const res = await fetch("/api/settings/lead-scoring", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewLeadId: previewLeadId.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Preview failed");
      if (!json.data.preview) {
        toast.error("Lead not found");
        return;
      }
      setPreviewResult(json.data.preview);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    }
  }

  const ops = useMemo(
    () => operatorsForField(draft.field),
    [draft.field],
  );

  const needsValue = operatorsNeedValue(draft.operator);

  if (!config) {
    return (
      <div className="p-6 text-sm text-crm-muted">Loading lead scoring…</div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsReturnBackButton />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-lg font-semibold text-crm-text">
            <Gauge size={20} className="text-accent-600" />
            Lead Scoring
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-crm-border px-2 text-xs font-medium text-crm-muted transition hover:bg-crm-panel hover:text-crm-text"
              aria-label="Open lead scoring guide"
              title="How lead scoring works"
            >
              <HelpCircle size={18} />
              Help
            </button>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-crm-muted">
            Dynamic 0–100 score from profile fit, engagement signals, and your custom rules.
            Scores recalculate when leads change or activities are logged.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={recalculating || saving}
            onClick={() => void recalculateAll()}
          >
            <RefreshCw size={14} className={recalculating ? "animate-spin" : ""} />
            Recalculate all leads
          </Button>
          <Button type="button" onClick={openAdd}>
            <Plus size={14} />
            Add rule
          </Button>
        </div>
      </div>

      <section className="crm-card space-y-4 p-4">
        <h2 className="text-sm font-semibold text-crm-text">Scoring mode</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => void saveConfig({ ...config, enabled: e.target.checked })}
              className="rounded border-crm-border text-accent-600"
            />
            Enable scoring
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.autoRecalculate}
              onChange={(e) =>
                void saveConfig({ ...config, autoRecalculate: e.target.checked })
              }
              className="rounded border-crm-border text-accent-600"
            />
            Auto-recalculate on changes
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.allowManualOverride}
              onChange={(e) =>
                void saveConfig({ ...config, allowManualOverride: e.target.checked })
              }
              className="rounded border-crm-border text-accent-600"
            />
            Allow manual score override
          </label>
        </div>
        <p className="text-xs text-crm-muted">
          Formula: clamp(fit + engagement + rule points, 0–100). Fit and engagement use CRM
          profile + activity data; rules add or subtract when conditions match.
        </p>
      </section>

      <section className="crm-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-crm-border px-4 py-3">
          <h2 className="text-sm font-semibold text-crm-text">
            Rules ({config.rules.length})
          </h2>
          <Button type="button" variant="secondary" size="sm" onClick={addRecommended}>
            <Sparkles size={14} />
            Add recommended rules
          </Button>
        </div>
        {config.rules.length === 0 ? (
          <p className="p-4 text-sm text-crm-muted">
            No custom rules yet. Baseline fit + engagement still produce a score. Add rules to
            boost referrals, qualified stages, or penalize disengaged leads.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>On</TH>
                <TH>Rule</TH>
                <TH>Field</TH>
                <TH>Condition</TH>
                <TH className="text-right">Points</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {config.rules.map((rule) => (
                <TR key={rule.id}>
                  <TD>
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => toggleRule(rule)}
                      aria-label="Enable rule"
                    />
                  </TD>
                  <TD className="font-medium">{rule.label ?? "—"}</TD>
                  <TD className="text-crm-muted">{rule.field}</TD>
                  <TD className="text-xs text-crm-muted">
                    {rule.operator}
                    {operatorsNeedValue(rule.operator)
                      ? ` "${String(rule.value ?? "")}"`
                      : ""}
                  </TD>
                  <TD className="text-right font-medium tabular-nums">
                    {rule.points > 0 ? `+${rule.points}` : rule.points}
                  </TD>
                  <TD className="text-right">
                    <button
                      type="button"
                      className="mr-2 text-xs text-accent-600 hover:underline"
                      onClick={() => openEdit(rule)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-crm-muted hover:text-red-600"
                      onClick={() => removeRule(rule.id)}
                      aria-label="Delete rule"
                    >
                      <Trash2 size={14} />
                    </button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      <section className="crm-card space-y-3 p-4">
        <h2 className="text-sm font-semibold text-crm-text">Preview on a lead</h2>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Lead ID (from URL)"
            value={previewLeadId}
            onChange={(e) => setPreviewLeadId(e.target.value)}
            className="max-w-md"
          />
          <Button type="button" variant="secondary" onClick={() => void runPreview()}>
            Preview score
          </Button>
        </div>
        {previewResult ? (
          <div className="rounded-lg bg-crm-panel p-3 text-sm">
            <p className="font-semibold text-crm-text">Score: {previewResult.score}/100</p>
            <ul className="mt-2 space-y-1 text-crm-muted">
              <li>Fit: +{previewResult.breakdown.fitPoints}</li>
              <li>Engagement: +{previewResult.breakdown.engagementPoints}</li>
              <li>Rules: {previewResult.breakdown.rulePoints >= 0 ? "+" : ""}
                {previewResult.breakdown.rulePoints}
              </li>
              {previewResult.breakdown.matchedRules.length > 0 ? (
                <li className="pt-1">
                  Matched:{" "}
                  {previewResult.breakdown.matchedRules
                    .map((m) => `${m.label} (${m.points > 0 ? "+" : ""}${m.points})`)
                    .join(", ")}
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit scoring rule" : "Add scoring rule"}
      >
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="text-crm-muted">Label (optional)</span>
            <Input
              className="mt-1"
              value={draft.label ?? ""}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="e.g. Referral bonus"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-crm-muted">Field</span>
              <Select
                className="mt-1 w-full"
                value={draft.field}
                onChange={(e) => {
                  const field = e.target.value;
                  const nextOps = operatorsForField(field);
                  setDraft({
                    ...draft,
                    field,
                    operator: nextOps[0] as LeadScoringOperator,
                  });
                }}
              >
                {LEAD_SCORING_FIELD_DEFS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block text-sm">
              <span className="text-crm-muted">Operator</span>
              <Select
                className="mt-1 w-full"
                value={draft.operator}
                onChange={(e) =>
                  setDraft({ ...draft, operator: e.target.value as LeadScoringOperator })
                }
              >
                {ops.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          {needsValue ? (
            <label className="block text-sm">
              <span className="text-crm-muted">Value (comma-separated for &quot;in&quot;)</span>
              <Input
                className="mt-1"
                value={
                  Array.isArray(draft.value)
                    ? draft.value.join(", ")
                    : String(draft.value ?? "")
                }
                onChange={(e) => setDraft({ ...draft, value: e.target.value })}
              />
            </label>
          ) : null}
          <label className="block text-sm">
            <span className="text-crm-muted">Points (−100 to +100)</span>
            <Input
              type="number"
              min={-100}
              max={100}
              className="mt-1"
              value={draft.points}
              onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            />
            Rule enabled
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={commitRule} disabled={saving}>
              {editing ? "Save" : "Add rule"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="How Lead Scoring Works"
      >
        <div className="space-y-3 text-sm text-crm-muted">
          <p>
            Lead score is calculated on a 0-100 scale to help teams prioritize which leads to follow first.
          </p>
          <p>
            Formula used:
            <span className="ml-1 font-medium text-crm-text">
              clamp(fit + engagement + rule points, 0-100)
            </span>
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium text-crm-text">Fit:</span> profile quality (email, phone, company, industry, etc.).
            </li>
            <li>
              <span className="font-medium text-crm-text">Engagement:</span> activities, calls, notes, recent touch, pipeline stage.
            </li>
            <li>
              <span className="font-medium text-crm-text">Rules:</span> your custom conditions can add or subtract points.
            </li>
          </ul>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium text-crm-text">Enable scoring:</span> turns scoring on/off for your workspace.
            </li>
            <li>
              <span className="font-medium text-crm-text">Auto-recalculate on changes:</span> score updates when lead/activity data changes.
            </li>
            <li>
              <span className="font-medium text-crm-text">Allow manual score override:</span> users can type score manually in lead form.
            </li>
          </ul>
          <div className="rounded-lg bg-crm-panel p-3">
            <p className="font-medium text-crm-text">Where rules work (Field behavior)</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <span className="font-medium text-crm-text">source / stage / status / industry / country:</span> exact match, contains, or list-based matching.
              </li>
              <li>
                <span className="font-medium text-crm-text">email / phone / company / website:</span> use empty/not-empty or text conditions.
              </li>
              <li>
                <span className="font-medium text-crm-text">isStarred / isDisengaged:</span> use true/false operators for boost or penalty.
              </li>
              <li>
                <span className="font-medium text-crm-text">Points:</span> positive adds score, negative reduces score.
              </li>
            </ul>
            <p className="mt-2 text-xs">
              Example: if source = referral and points = +20, then every referral lead gets +20.
              If isDisengaged = true and points = -25, disengaged leads lose 25 points.
            </p>
          </div>
          <div className="rounded-lg bg-crm-panel p-3">
            <p className="font-medium text-crm-text">Operator meaning (simple)</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><span className="font-medium text-crm-text">equals:</span> exact same value match.</li>
              <li><span className="font-medium text-crm-text">contains:</span> text includes the value (partial match).</li>
              <li><span className="font-medium text-crm-text">in:</span> value is present in a list (comma-separated).</li>
              <li><span className="font-medium text-crm-text">is_empty / is_not_empty:</span> check whether a field is blank or filled.</li>
              <li><span className="font-medium text-crm-text">is_true / is_false:</span> for boolean fields like starred/disengaged.</li>
            </ul>
          </div>
          <div className="rounded-lg bg-crm-panel p-3">
            <p className="font-medium text-crm-text">How to use Add Rule</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Click <span className="font-medium text-crm-text">Add rule</span>.</li>
              <li>Select <span className="font-medium text-crm-text">Field</span> (example: source).</li>
              <li>Select <span className="font-medium text-crm-text">Operator</span> (equals / contains / in / true / false).</li>
              <li>Enter <span className="font-medium text-crm-text">Value</span> when required.</li>
              <li>Set <span className="font-medium text-crm-text">Points</span> (example +20 or -15).</li>
              <li>Keep rule enabled and save. Use preview to verify output before rollout.</li>
            </ol>
            <p className="mt-2 text-xs">
              Best practice: start with 3-5 important rules only, then run preview on real leads and
              adjust points gradually.
            </p>
          </div>
          <div className="rounded-lg bg-crm-panel p-3">
            <p className="font-medium text-crm-text">How final score updates in daily work</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Lead create/update par score recalculate hota hai.</li>
              <li>Activity/call/note log hone par engagement part refresh hota hai.</li>
              <li>Stage/status/source change hone par matching rules dobara evaluate hoti hain.</li>
              <li>Final score hamesha 0 se 100 ke beech clamp kiya jata hai.</li>
            </ul>
          </div>
          <p>
            Tip: use <span className="font-medium text-crm-text">Preview on a lead</span> to validate how a rule set behaves before rollout.
          </p>
        </div>
      </Modal>
    </div>
  );
}
