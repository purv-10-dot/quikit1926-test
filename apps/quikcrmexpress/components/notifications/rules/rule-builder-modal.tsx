"use client";

import { useEffect, useState } from "react";
import { X, Zap, HelpCircle } from "lucide-react";
import type {
  NotificationRule,
  EntityType,
  ConditionType,
  RecipientType,
} from "@/lib/notifications/rules/types";
import {
  ENTITY_FIELDS,
  ENTITY_RECIPIENT_LABELS,
  CONDITION_LABELS,
  FIELD_CONDITIONS,
  VALUE_CONDITIONS,
  TEMPLATE_VARS,
} from "@/lib/notifications/rules/types";

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  description: string;
  entityType: EntityType;
  conditionType: ConditionType;
  fieldName: string;
  conditionValue: string;
  notifyInApp: boolean;
  notifyEmail: boolean;
  recipientType: RecipientType;
  recipientValue: string;
  messageTemplate: string;
  isActive: boolean;
}

const DEFAULT_FORM: FormState = {
  name: "",
  description: "",
  entityType: "lead",
  conditionType: "field_equals",
  fieldName: "stage",
  conditionValue: "",
  notifyInApp: true,
  notifyEmail: false,
  recipientType: "owner",
  recipientValue: "",
  messageTemplate: "Lead {{lead.name}} triggered a rule.",
  isActive: true,
};

function ruleToForm(rule: NotificationRule): FormState {
  return {
    name: rule.name,
    description: rule.description ?? "",
    entityType: rule.entityType,
    conditionType: rule.conditionType,
    fieldName: rule.fieldName ?? "",
    conditionValue: rule.conditionValue ?? "",
    notifyInApp: rule.notifyInApp,
    notifyEmail: rule.notifyEmail,
    recipientType: rule.recipientType,
    recipientValue: rule.recipientValue ?? "",
    messageTemplate: rule.messageTemplate,
    isActive: rule.isActive,
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  editingRule: NotificationRule | null;
  onClose: () => void;
  onSave: (form: FormState) => Promise<void>;
  isSaving: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RuleBuilderModal({ editingRule, onClose, onSave, isSaving }: Props) {
  const [form, setForm] = useState<FormState>(
    editingRule ? ruleToForm(editingRule) : DEFAULT_FORM,
  );
  const [error, setError] = useState<string | null>(null);
  const [showVarHint, setShowVarHint] = useState(false);

  // Reset when the editing target changes.
  useEffect(() => {
    setForm(editingRule ? ruleToForm(editingRule) : DEFAULT_FORM);
    setError(null);
  }, [editingRule]);

  // Close on Escape.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const needsField = FIELD_CONDITIONS.includes(form.conditionType);
  const needsValue = VALUE_CONDITIONS.includes(form.conditionType);
  const needsRecipientValue =
    form.recipientType === "specific_user" || form.recipientType === "specific_role";

  const handleSubmit = async () => {
    setError(null);
    if (!form.name.trim()) { setError("Rule name is required."); return; }
    if (!form.messageTemplate.trim()) { setError("Message template is required."); return; }
    if (needsField && !form.fieldName) { setError("Please select a field."); return; }
    if (needsValue && !form.conditionValue.trim()) { setError("Condition value is required."); return; }
    if (needsRecipientValue && !form.recipientValue.trim()) {
      setError(
        form.recipientType === "specific_user"
          ? "Please enter a User ID."
          : "Please enter a role name.",
      );
      return;
    }
    await onSave(form);
  };

  const inputCls =
    "w-full rounded-lg border border-crm-border bg-white px-3 py-2 text-sm text-crm-text outline-none transition focus-visible:ring-2 focus-visible:ring-crm-blue-glow";

  const sectionLabel = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-label={editingRule ? "Edit rule" : "Create rule"}
        className={[
          "fixed inset-x-4 top-[5vh] z-50 mx-auto max-w-2xl overflow-hidden",
          "rounded-2xl border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)]",
          "flex flex-col max-h-[90vh]",
          "animate-in fade-in-0 zoom-in-95 duration-150",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
              <Zap size={15} className="text-blue-600" strokeWidth={2.5} />
            </div>
            <h2 className="text-sm font-semibold text-slate-900">
              {editingRule ? "Edit Rule" : "Create Notification Rule"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5">

          {/* ── Rule Info ── */}
          <div className="space-y-3">
            <p className={sectionLabel}>Rule Details</p>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Rule Name <span className="text-red-500">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Notify when lead reaches Qualified"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Description
              </label>
              <input
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Optional internal note about this rule"
                className={inputCls}
              />
            </div>
          </div>

          {/* ── WHEN ── */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-500">
              When
            </p>

            {/* Entity */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Entity</label>
              <select
                value={form.entityType}
                onChange={(e) => {
                  const et = e.target.value as EntityType;
                  set("entityType", et);
                  // Reset field to first available field for the new entity.
                  set("fieldName", ENTITY_FIELDS[et][0]?.value ?? "");
                }}
                className={inputCls}
              >
                {(["lead", "task", "opportunity", "quote", "contact"] as EntityType[]).map((e) => (
                  <option key={e} value={e}>
                    {e.charAt(0).toUpperCase() + e.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Condition type */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Condition</label>
              <select
                value={form.conditionType}
                onChange={(e) => set("conditionType", e.target.value as ConditionType)}
                className={inputCls}
              >
                {(Object.entries(CONDITION_LABELS) as [ConditionType, string][]).map(
                  ([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ),
                )}
              </select>
            </div>

            {/* Field name (shown for field_* conditions) */}
            {needsField && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Field</label>
                <select
                  value={form.fieldName}
                  onChange={(e) => set("fieldName", e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Select field —</option>
                  {ENTITY_FIELDS[form.entityType].map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Condition value (shown for equals / contains / gt / lt) */}
            {needsValue && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Value</label>
                <input
                  value={form.conditionValue}
                  onChange={(e) => set("conditionValue", e.target.value)}
                  placeholder="e.g. Qualified"
                  className={inputCls}
                />
              </div>
            )}

            {/* Preview of the full condition */}
            <div className="rounded-lg border border-blue-100 bg-white px-3 py-2">
              <p className="text-[11px] text-slate-400">
                <span className="font-semibold text-slate-600">Preview: </span>
                {buildConditionPreview(form)}
              </p>
            </div>
          </div>

          {/* ── THEN ── */}
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-4">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">
              Then
            </p>

            {/* Channels */}
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">Send via</p>
              <div className="flex flex-wrap gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.notifyInApp}
                    onChange={(e) => set("notifyInApp", e.target.checked)}
                    className="h-4 w-4 rounded border-crm-border accent-crm-blue"
                  />
                  In-App Notification
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.notifyEmail}
                    onChange={(e) => set("notifyEmail", e.target.checked)}
                    className="h-4 w-4 rounded border-crm-border accent-crm-blue"
                  />
                  Email
                </label>
              </div>
            </div>

            {/* Recipients — labels change per entity type */}
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">Notify</p>
              <select
                value={form.recipientType}
                onChange={(e) => {
                  set("recipientType", e.target.value as RecipientType);
                  set("recipientValue", "");
                }}
                className={inputCls}
              >
                {(Object.entries(ENTITY_RECIPIENT_LABELS[form.entityType]) as [RecipientType, string][]).map(
                  ([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ),
                )}
              </select>
            </div>

            {/* Recipient value */}
            {needsRecipientValue && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  {form.recipientType === "specific_user" ? "User ID" : "Role Name"}
                </label>
                <input
                  value={form.recipientValue}
                  onChange={(e) => set("recipientValue", e.target.value)}
                  placeholder={
                    form.recipientType === "specific_user"
                      ? "e.g. clxxxxxxxxxxxxxxx"
                      : "e.g. SalesManager"
                  }
                  className={inputCls}
                />
              </div>
            )}
          </div>

          {/* ── Message Template ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className={sectionLabel}>Message Template</p>
              <button
                type="button"
                onClick={() => setShowVarHint((s) => !s)}
                className="flex items-center gap-1 text-[11px] text-crm-muted hover:text-crm-text"
              >
                <HelpCircle size={11} />
                Variables
              </button>
            </div>

            {showVarHint && (
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="mb-1.5 text-[11px] font-semibold text-slate-500">
                  Available variables for {form.entityType}:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_VARS[form.entityType].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => set("messageTemplate", form.messageTemplate + v)}
                      className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-600 shadow-sm hover:bg-blue-50 hover:text-blue-700"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <textarea
              value={form.messageTemplate}
              onChange={(e) => set("messageTemplate", e.target.value)}
              rows={3}
              placeholder="e.g. Lead {{lead.name}} moved to {{lead.stage}} by {{actor.name}}"
              className={`${inputCls} resize-none font-mono text-xs`}
            />
            <p className="text-[11px] text-slate-400">
              Use <code className="rounded bg-slate-100 px-1">{"{{variable}}"}</code> placeholders.
              Click Variables above to insert.
            </p>
          </div>

          {/* ── Active toggle ── */}
          <label className="flex cursor-pointer items-center gap-3">
            <div
              onClick={() => set("isActive", !form.isActive)}
              className={[
                "relative h-5 w-9 rounded-full transition-colors",
                form.isActive ? "bg-crm-blue" : "bg-slate-200",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                  form.isActive ? "translate-x-4" : "translate-x-0.5",
                ].join(" ")}
              />
            </div>
            <span className="text-sm text-slate-700">
              {form.isActive ? "Rule is active" : "Rule is inactive"}
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-100 px-5 py-4">
          {error && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-crm-border px-4 py-2 text-sm font-medium text-crm-text transition hover:bg-crm-panel"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving}
              className="flex items-center gap-2 rounded-lg bg-crm-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-crm-blue-dark disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving…
                </>
              ) : editingRule ? (
                "Save Changes"
              ) : (
                "Create Rule"
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Condition preview builder ────────────────────────────────────────────────

interface PreviewForm {
  entityType: EntityType;
  conditionType: ConditionType;
  fieldName: string;
  conditionValue: string;
}

function buildConditionPreview(f: PreviewForm): string {
  const entity = f.entityType.charAt(0).toUpperCase() + f.entityType.slice(1);
  switch (f.conditionType) {
    case "entity_created":   return `${entity} is created`;
    case "entity_updated":   return `${entity} is updated`;
    case "entity_deleted":   return `${entity} is deleted`;
    case "field_changed":    return `${entity} › ${f.fieldName || "?"} changes`;
    case "field_equals":     return `${entity} › ${f.fieldName || "?"} = "${f.conditionValue}"`;
    case "field_not_equals": return `${entity} › ${f.fieldName || "?"} ≠ "${f.conditionValue}"`;
    case "field_contains":   return `${entity} › ${f.fieldName || "?"} contains "${f.conditionValue}"`;
    case "field_greater_than": return `${entity} › ${f.fieldName || "?"} > ${f.conditionValue}`;
    case "field_less_than":  return `${entity} › ${f.fieldName || "?"} < ${f.conditionValue}`;
    default:                 return `${entity} …`;
  }
}
