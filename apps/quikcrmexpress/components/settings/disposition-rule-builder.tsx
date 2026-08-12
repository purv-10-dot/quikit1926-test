"use client";

/**
 * FR-RE Slice 1 (b) — admin rule-builder for the call-disposition form.
 *
 * Minimal spine: on the SAME draft version, define a rule = matchType all + one
 * field-condition (subject = a custom dropdown field, operator, value from its
 * options) + one set_stage action (target status from the configured list).
 * Calls POST /versions/[v]/rules, /rules/[id]/conditions, /rules/[id]/actions.
 * Status picker reuses the canonical source GET /api/forms/disposition-statuses
 * (Stage 1; no stage -> all configured statuses). All on @/components/ui/.
 */
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface FieldOption {
  valueKey: string;
  label: string;
}
interface BuilderField {
  fieldKey: string;
  label: string;
  fieldType: string;
  isProtected: boolean;
  options: FieldOption[];
}
interface RuleCondition {
  id: string;
  subjectKind: string;
  subjectFieldKey: string | null;
  operator: string;
  valueKeys: string[] | null;
}
interface RuleAction {
  id: string;
  actionType: string;
  targetFieldKey: string | null;
  targetTabId: string | null;
  setStatusId: string | null;
}
interface RuleRow {
  id: string;
  name: string;
  matchType: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

const OPERATORS = [
  { value: "is", label: "is" },
  { value: "is_not", label: "is not" },
  { value: "is_any_of", label: "is any of" },
  { value: "is_none_of", label: "is none of" },
] as const;

/** Operators whose value input is a multi-select (a value SET). Mirrors the
 *  persistence layer's MULTI_VALUE_OPS; the engine already evaluates the set. */
const MULTI_VALUE_OPS = ["is_any_of", "is_none_of"];

async function apiGet<T>(url: string, key: string = "data"): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json[key] as T;
}
async function apiMutate<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

interface BuilderTab {
  id: string;
  name: string;
  visibility: string;
}

export function DispositionRuleBuilder({
  versionId,
  fields,
  tabs,
}: {
  versionId: string;
  fields: BuilderField[];
  tabs: BuilderTab[];
}) {
  const toast = useToast();
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  // Contact-Stage targets for the set_stage action (pipeline stages). Distinct
  // from `statuses`, which feeds the WHEN Status condition value picker.
  const [stages, setStages] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // condition-subject candidates: the custom dropdown fields (their options
  // populate the value picker). Protected/lead-state subjects are Slice 2.
  const subjectFields = fields.filter((f) => f.fieldType === "dropdown" && !f.isProtected);

  // add-rule form state. `subject` is "status" (the lead Status/disposition —
  // CrmExpress's trigger lives here) or "field:<fieldKey>" for a custom dropdown.
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("status");
  const [operator, setOperator] = useState<string>("is");
  const [valueKey, setValueKey] = useState(""); // single-value ops (is / is not)
  const [valueKeys, setValueKeys] = useState<string[]>([]); // multi-value ops (is any of / none of)
  // action: set_stage (-> status) or show_tab (-> a rule-driven tab)
  const [actionType, setActionType] = useState<"set_stage" | "show_tab">("set_stage");
  const [statusName, setStatusName] = useState("");
  const [targetTabId, setTargetTabId] = useState("");
  // Edit mode (2-B): when set, saveRule PATCHes the existing rule's condition +
  // action instead of POSTing a new rule. Null => create mode.
  const [editing, setEditing] = useState<{ ruleId: string; conditionId: string; actionId: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [ruleList, statusList, stageList] = await Promise.all([
        apiGet<RuleRow[]>(`/api/forms/versions/${versionId}/rules`),
        // Canonical disposition-status source (Stage 1): no stage -> all configured.
        apiGet<string[]>("/api/forms/disposition-statuses"),
        // Contact-Stage targets for set_stage — the configured pipeline stages.
        apiGet<{ stages: string[] }>("/api/leads/stages").then((d) => d.stages),
      ]);
      setRules(ruleList);
      setStatuses(statusList);
      setStages(stageList);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load rules");
    }
  }, [versionId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function openAdd() {
    setEditing(null);
    setName("");
    setSubject("status"); // default to the Status/disposition trigger (CrmExpress's model)
    setOperator("is");
    setValueKey("");
    setValueKeys([]);
    setActionType("set_stage");
    setStatusName("");
    setTargetTabId("");
    setOpen(true);
  }

  /** Re-open a saved rule into the form, pre-populating BOTH the condition (subject
   *  + operator + value/valueKeys — the FULL set for a multi-select) and the action
   *  (set_stage target / show_tab tab). Edit covers the first condition + action. */
  function openEdit(r: RuleRow) {
    const c = r.conditions[0];
    const a = r.actions[0];
    if (!c || !a) {
      toast.error("This rule is missing a condition or action and can't be edited here.");
      return;
    }
    setEditing({ ruleId: r.id, conditionId: c.id, actionId: a.id });
    setName(r.name);
    setSubject(c.subjectKind === "status" ? "status" : `field:${c.subjectFieldKey ?? ""}`);
    setOperator(c.operator);
    const multi = MULTI_VALUE_OPS.includes(c.operator);
    setValueKeys(multi ? c.valueKeys ?? [] : []); // restore the FULL set
    setValueKey(multi ? "" : c.valueKeys?.[0] ?? "");
    if (a.actionType === "show_tab") {
      setActionType("show_tab");
      setTargetTabId(a.targetTabId ?? "");
      setStatusName("");
    } else {
      setActionType("set_stage");
      setStatusName(a.setStatusId ?? "");
      setTargetTabId("");
    }
    setOpen(true);
  }

  // Resolve the condition subject -> kind + (field) + the value options to pick.
  const isMultiOp = MULTI_VALUE_OPS.includes(operator);
  const isStatusSubject = subject === "status";
  const condFieldKey = isStatusSubject ? null : subject.replace(/^field:/, "");
  const condField = subjectFields.find((f) => f.fieldKey === condFieldKey);
  const valueOptions = isStatusSubject
    ? statuses.map((s) => ({ valueKey: s, label: s }))
    : condField?.options ?? [];

  async function saveRule() {
    if (!name.trim()) return toast.error("Rule name is required.");
    if (!isStatusSubject && !condFieldKey) return toast.error("Pick a subject for the condition.");
    if (isMultiOp) {
      if (valueKeys.length === 0) return toast.error("Pick at least one value for the condition.");
    } else if (!valueKey) {
      return toast.error("Pick a value for the condition.");
    }
    if (actionType === "set_stage" && !statusName) return toast.error("Pick a target Contact Stage.");
    if (actionType === "show_tab" && !targetTabId) return toast.error("Pick a tab to show.");
    setSaving(true);
    // Shared payloads for both create and edit.
    const conditionBody = {
      subjectKind: isStatusSubject ? "status" : "field",
      subjectFieldKey: isStatusSubject ? null : condFieldKey,
      operator,
      valueKeys: isMultiOp ? valueKeys : [valueKey],
    };
    const actionBody =
      actionType === "set_stage"
        ? { actionType: "set_stage", targetKind: "stage", setStatusId: statusName, targetTabId: null }
        : { actionType: "show_tab", targetKind: "tab", targetTabId, setStatusId: null };
    try {
      if (editing) {
        // 2-B edit: PATCH the existing rule's name, condition, and action.
        await apiMutate("PATCH", `/api/forms/rules/${editing.ruleId}`, { name: name.trim() });
        await apiMutate("PATCH", `/api/forms/conditions/${editing.conditionId}`, conditionBody);
        await apiMutate("PATCH", `/api/forms/actions/${editing.actionId}`, actionBody);
        toast.success("Rule updated");
      } else {
        const rule = await apiMutate<{ id: string }>("POST", `/api/forms/versions/${versionId}/rules`, {
          name: name.trim(),
          matchType: "all",
          sortOrder: rules.length,
        });
        await apiMutate("POST", `/api/forms/rules/${rule.id}/conditions`, { ...conditionBody, sortOrder: 0 });
        await apiMutate("POST", `/api/forms/rules/${rule.id}/actions`, { ...actionBody, sortOrder: 0 });
        toast.success("Rule added");
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(r: RuleRow) {
    if (!window.confirm(`Delete rule "${r.name}"? This removes its condition and action.`)) return;
    try {
      // DELETE /api/forms/rules/[id] cascades conditions + actions (draft-guarded
      // server-side; the builder only renders for a draft, so this is the backstop).
      await apiMutate("DELETE", `/api/forms/rules/${r.id}`);
      await load();
      toast.success("Rule deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function summarize(r: RuleRow): string {
    const c = r.conditions[0];
    if (!c) return "no conditions";
    const field = c.subjectKind === "field" ? fields.find((f) => f.fieldKey === c.subjectFieldKey) : undefined;
    const subjectLabel =
      c.subjectKind === "status" ? "Status" : field?.label ?? c.subjectFieldKey ?? c.subjectKind;
    const valLabels = (c.valueKeys ?? [])
      .map((vk) => field?.options.find((o) => o.valueKey === vk)?.label ?? vk)
      .join(", ");
    // replaceAll so "is_any_of" -> "is any of" (not "is any_of").
    return `When ${subjectLabel} ${c.operator.replaceAll("_", " ")} ${valLabels}`;
  }

  return (
    <div className="crm-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-crm-border px-4 py-3">
        <span className="font-medium text-crm-text">Rules</span>
        <Button variant="secondary" onClick={openAdd}>
          <Plus className="mr-1 h-4 w-4" /> Add rule
        </Button>
      </div>

      <ul className="divide-y divide-crm-border">
        {rules.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-crm-muted">No rules yet.</li>
        ) : (
          rules.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <span className="text-sm font-medium text-crm-text">{r.name}</span>
                <span className="ml-2 text-xs text-crm-muted">{summarize(r)}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={`Edit rule ${r.name}`}
                  className="rounded p-1 text-crm-muted hover:bg-crm-panel hover:text-crm-text"
                  onClick={() => openEdit(r)}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete rule ${r.name}`}
                  className="rounded p-1 text-crm-muted hover:bg-crm-panel hover:text-red-600"
                  onClick={() => void deleteRule(r)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))
        )}
      </ul>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit rule" : "New rule"} width="max-w-lg">
        <div className="space-y-4">
          <FieldLabel label="Rule name *">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Invoice → Working" />
          </FieldLabel>

          <div className="rounded-lg border border-crm-border p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-crm-muted">When (all)</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setValueKey("");
                }}
              >
                <option value="status">Status</option>
                {subjectFields.map((f) => (
                  <option key={f.fieldKey} value={`field:${f.fieldKey}`}>
                    {f.label}
                  </option>
                ))}
              </Select>
              <Select
                value={operator}
                onChange={(e) => {
                  // Switching between single- and multi-value clears the stale
                  // value so we never persist a mismatched arity.
                  setOperator(e.target.value);
                  setValueKey("");
                  setValueKeys([]);
                }}
              >
                {OPERATORS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              {isMultiOp ? (
                <div className="max-h-40 overflow-y-auto rounded-md border border-crm-border p-2">
                  {valueOptions.length === 0 ? (
                    <p className="px-1 py-1 text-xs text-crm-muted">No values available.</p>
                  ) : (
                    valueOptions.map((o) => (
                      <label key={o.valueKey} className="flex items-center gap-2 px-1 py-1 text-sm text-crm-text">
                        <input
                          type="checkbox"
                          checked={valueKeys.includes(o.valueKey)}
                          onChange={(e) =>
                            setValueKeys((prev) =>
                              e.target.checked
                                ? [...prev, o.valueKey]
                                : prev.filter((v) => v !== o.valueKey),
                            )
                          }
                        />
                        {o.label}
                      </label>
                    ))
                  )}
                </div>
              ) : (
                <Select value={valueKey} onChange={(e) => setValueKey(e.target.value)}>
                  <option value="">Select value…</option>
                  {valueOptions.map((o) => (
                    <option key={o.valueKey} value={o.valueKey}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-crm-border p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-crm-muted">Then</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select value={actionType} onChange={(e) => setActionType(e.target.value as "set_stage" | "show_tab")}>
                <option value="set_stage">Set Contact Stage to…</option>
                <option value="show_tab">Show tab…</option>
              </Select>
              {actionType === "set_stage" ? (
                <Select value={statusName} onChange={(e) => setStatusName(e.target.value)}>
                  <option value="">Select stage…</option>
                  {stages.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              ) : (
                <Select value={targetTabId} onChange={(e) => setTargetTabId(e.target.value)}>
                  <option value="">Select tab…</option>
                  {tabs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.visibility === "rule_driven" ? " (rule-driven)" : ""}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={saveRule} disabled={saving}>
            {saving ? "Saving…" : "Add rule"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-crm-text">{label}</span>
      {children}
    </label>
  );
}
