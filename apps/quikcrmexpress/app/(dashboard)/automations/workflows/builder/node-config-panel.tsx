"use client";

import { useEffect, useState } from "react";
import { ConditionBuilder } from "./condition-builder";
import type { IfElseConfig } from "@/types/workflow";

/**
 * [P3.A4] Right-side slide-in panel that edits the SELECTED node's real config
 * (SPEC §9). Config writes back into the node's `graphNodes` JSON and persists
 * through the A2 save path. Field/value routing for update_lead_field (stage →
 * transition-service, status/other → PATCH) is invisible to the author — the
 * engine decides per Constraint 1.3.
 *
 * UX (2026-08-06): update_lead_field's Field is now a DROPDOWN and its Value is
 * a real picker (fed by /api/leads/field-values) for enumerable fields like
 * stage/status/substatus/source — so authors don't hand-type values that
 * contain spaces/parens (e.g. "Not Connected(New Lead)"). Free-text only for
 * non-enumerable fields.
 *
 * send_email / distribute_lead (assign) config is authored here, but the engine
 * behaviour behind them is Track B's (B1–B3); per the §7 integration order those
 * two node kinds are only surfaced in the builder registry (A3) after Track B
 * lands. The panel bodies exist so config round-trips once they are surfaced.
 */

export interface PanelUser {
  id: string;
  name: string;
  email: string;
}

export interface SelectedNode {
  id: string;
  kind: string;
  config: Record<string, unknown>;
}

/** Selectable lead fields for update_lead_field (label shown, key stored). */
const UPDATE_FIELD_OPTIONS: { key: string; label: string }[] = [
  { key: "stage", label: "Stage" },
  { key: "status", label: "Status" },
  { key: "substatus", label: "Sub Status" },
  { key: "source", label: "Source" },
  { key: "leadQuality", label: "Lead Quality" },
  { key: "ownerId", label: "Owner" },
];

const MERGE_FIELDS = ["name", "email", "company", "phone", "source"];

const KIND_TITLE: Record<string, string> = {
  trigger_lead_created: "Trigger — Lead Created",
  trigger_lead_updated: "Trigger — Lead Updated",
  create_task: "Create Task",
  wait: "Wait",
  if_else: "If / Else",
  update_lead_field: "Update Lead Field",
  distribute_lead: "Assign Lead",
  notify_user: "Notify User",
  send_email: "Send Email",
};

type FieldValuesResult =
  | { source: "pipeline" | "options" | "distinct"; values: { value: string; label: string }[] }
  | { source: "none"; values: null; reason?: string };

const valueCache = new Map<string, { value: string; label: string }[]>();

/** Fetch pickable values for a field from the shared field-values endpoint. */
function useFieldValues(field: string): { options: { value: string; label: string }[]; loading: boolean } {
  const [options, setOptions] = useState<{ value: string; label: string }[]>(() => valueCache.get(field) ?? []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!field) {
      setOptions([]);
      return;
    }
    const cached = valueCache.get(field);
    if (cached) {
      setOptions(cached);
      return;
    }
    setLoading(true);
    setOptions([]);
    fetch(`/api/leads/field-values?field=${encodeURIComponent(field)}`, { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<FieldValuesResult>) : null))
      .then((json) => {
        if (cancelled) return;
        const list = json && json.source !== "none" && Array.isArray(json.values) ? json.values : [];
        valueCache.set(field, list);
        setOptions(list);
      })
      .catch(() => {
        if (!cancelled) {
          valueCache.set(field, []);
          setOptions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [field]);

  return { options, loading };
}

export function NodeConfigPanel({
  node,
  users,
  onChangeConfig,
  onClose,
}: {
  node: SelectedNode | null;
  users: PanelUser[];
  onChangeConfig: (config: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  if (!node) return null;
  const cfg = node.config ?? {};
  const set = (key: string, value: unknown) => onChangeConfig({ ...cfg, [key]: value });
  const str = (key: string) => (cfg[key] == null ? "" : String(cfg[key]));

  return (
    <aside className="fixed right-0 top-0 z-40 flex h-full w-96 max-w-[90vw] flex-col border-l border-crm-border bg-white shadow-xl">
      <header className="flex items-center justify-between border-b border-crm-border px-4 py-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-crm-muted">Configure node</div>
          <div className="text-sm font-medium text-crm-text">{KIND_TITLE[node.kind] ?? node.kind}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md px-2 py-1 text-crm-muted hover:bg-crm-panel"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        {(node.kind === "trigger_lead_created" || node.kind === "trigger_lead_updated") && (
          <p className="text-crm-muted">
            This trigger starts the automation when a lead is{" "}
            {node.kind === "trigger_lead_created" ? "created" : "updated"}. No configuration needed.
          </p>
        )}

        {node.kind === "update_lead_field" && (
          <UpdateLeadFieldConfig
            field={str("field")}
            value={str("value")}
            onFieldChange={(field) => onChangeConfig({ ...cfg, field, value: "" })}
            onValueChange={(value) => set("value", value)}
          />
        )}

        {node.kind === "wait" && (
          <Field label="Duration (minutes)">
            <input
              type="number"
              min={1}
              value={cfg.durationMinutes == null ? "" : Number(cfg.durationMinutes)}
              onChange={(e) => set("durationMinutes", e.target.value === "" ? undefined : Number(e.target.value))}
              className="crm-input"
            />
          </Field>
        )}

        {node.kind === "if_else" && (
          <ConditionBuilder value={cfg as IfElseConfig} onChange={(next) => onChangeConfig({ ...next })} />
        )}

        {node.kind === "send_email" && (
          <>
            <Field label="To (optional — defaults to the lead's email)">
              <input value={str("to")} onChange={(e) => set("to", e.target.value)} placeholder="lead email" className="crm-input" />
            </Field>
            <Field label="Subject">
              <input value={str("subject")} onChange={(e) => set("subject", e.target.value)} className="crm-input" />
            </Field>
            <Field label="Body">
              <textarea
                value={str("body")}
                onChange={(e) => set("body", e.target.value)}
                rows={6}
                className="crm-input resize-y"
              />
            </Field>
            <div>
              <div className="mb-1 text-xs text-crm-muted">Insert merge field into body</div>
              <div className="flex flex-wrap gap-1">
                {MERGE_FIELDS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => set("body", `${str("body")}{${f}}`)}
                    className="rounded-md border border-crm-border px-2 py-0.5 text-xs hover:bg-crm-panel"
                  >
                    {`{${f}}`}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-crm-muted">Delivery and merge substitution are handled by the engine.</p>
            </div>
          </>
        )}

        {node.kind === "distribute_lead" && (
          <>
            <Field label="Candidate assignees (round-robin)">
              <div className="space-y-1">
                {users.length === 0 && <p className="text-xs text-crm-muted">No assignable users found.</p>}
                {users.map((u) => {
                  const ids = Array.isArray(cfg.candidateUserIds) ? (cfg.candidateUserIds as string[]) : [];
                  const checked = ids.includes(u.id);
                  return (
                    <label key={u.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          set(
                            "candidateUserIds",
                            e.target.checked ? [...ids, u.id] : ids.filter((x) => x !== u.id),
                          )
                        }
                      />
                      <span>{userLabel(u)}</span>
                    </label>
                  );
                })}
              </div>
            </Field>
            <Field label="Default assignee (required — used when no rule matches)">
              <select value={str("defaultUserId")} onChange={(e) => set("defaultUserId", e.target.value || undefined)} className="crm-input">
                <option value="">— select —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {userLabel(u)}
                  </option>
                ))}
              </select>
            </Field>
            {!str("defaultUserId") && (
              <p className="text-xs text-amber-600">A default assignee is required before publishing.</p>
            )}
            <p className="text-xs text-crm-muted">Assignment semantics are finalized by the engine.</p>
          </>
        )}

        {node.kind === "create_task" && (
          <>
            <Field label="Subject">
              <input value={str("subject")} onChange={(e) => set("subject", e.target.value)} className="crm-input" />
            </Field>
            <Field label="Assign to">
              <select value={str("assignTo")} onChange={(e) => set("assignTo", e.target.value)} className="crm-input">
                <option value="ownerId">Lead owner</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {userLabel(u)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select value={str("priority") || "Medium"} onChange={(e) => set("priority", e.target.value)} className="crm-input">
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </Field>
          </>
        )}

        {node.kind === "notify_user" && (
          <>
            <Field label="Notify user">
              <select value={str("userId")} onChange={(e) => set("userId", e.target.value || undefined)} className="crm-input">
                <option value="">— select —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {userLabel(u)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <input value={str("title")} onChange={(e) => set("title", e.target.value)} className="crm-input" />
            </Field>
            <Field label="Body">
              <textarea value={str("body")} onChange={(e) => set("body", e.target.value)} rows={3} className="crm-input resize-y" />
            </Field>
          </>
        )}
      </div>
    </aside>
  );
}

/** "Name <email>" so authors can disambiguate users (matches adv-filter people fields). */
function userLabel(u: PanelUser): string {
  return u.email ? `${u.name} <${u.email}>` : u.name;
}

/** update_lead_field: Field dropdown + value picker fed by /api/leads/field-values. */
function UpdateLeadFieldConfig({
  field,
  value,
  onFieldChange,
  onValueChange,
}: {
  field: string;
  value: string;
  onFieldChange: (field: string) => void;
  onValueChange: (value: string) => void;
}) {
  const { options, loading } = useFieldValues(field);
  const hasPicker = options.length > 0;

  return (
    <>
      <Field label="Field">
        <select value={field} onChange={(e) => onFieldChange(e.target.value)} className="crm-input">
          <option value="">— select field —</option>
          {UPDATE_FIELD_OPTIONS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
          {field && !UPDATE_FIELD_OPTIONS.some((f) => f.key === field) && <option value={field}>{field}</option>}
        </select>
      </Field>

      <Field label="Value">
        {loading && <p className="text-xs text-crm-muted">Loading values…</p>}
        {!loading && hasPicker && (
          <select value={value} onChange={(e) => onValueChange(e.target.value)} className="crm-input">
            <option value="">— select value —</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        {!loading && !hasPicker && (
          <input value={value} onChange={(e) => onValueChange(e.target.value)} className="crm-input" placeholder="value" />
        )}
      </Field>

      <p className="text-xs text-crm-muted">
        Stage changes route through the pipeline; status and other fields through the save path — handled
        automatically.
      </p>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-crm-muted">{label}</span>
      {children}
    </label>
  );
}
