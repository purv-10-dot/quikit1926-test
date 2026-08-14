"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormActions } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import type { FieldType, LeadFieldDefinition } from "@/types/field-definition";

const TYPES: FieldType[] = ["Text", "TextArea", "Number", "Email", "Phone", "Date", "Boolean", "Select", "MultiSelect"];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 41);
}

export function FieldEditorModal({
  open,
  initial,
  onClose,
  onSaved,
  apiBase = "/api/settings/fields",
}: {
  open: boolean;
  initial?: LeadFieldDefinition;
  onClose: () => void;
  onSaved: () => void;
  /** API base path for product vs lead field settings. */
  apiBase?: string;
}) {
  const toast = useToast();
  const isEdit = !!initial;

  const [label, setLabel] = useState(initial?.label ?? "");
  const [key, setKey] = useState(initial?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(false);
  const [fieldType, setFieldType] = useState<FieldType>(initial?.fieldType ?? "Text");
  const [requirement, setRequirement] = useState(initial?.requirement ?? "Optional");
  const [visible, setVisible] = useState(initial?.visible ?? true);
  const [showInList, setShowInList] = useState(initial?.showInList ?? false);
  const [helpText, setHelpText] = useState(initial?.helpText ?? "");
  const [optionsText, setOptionsText] = useState((initial?.options ?? []).join("\n"));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(initial?.label ?? "");
    setKey(initial?.key ?? "");
    setKeyTouched(!!initial);
    setFieldType(initial?.fieldType ?? "Text");
    setRequirement(initial?.requirement ?? "Optional");
    setVisible(initial?.visible ?? true);
    setShowInList(initial?.showInList ?? false);
    setHelpText(initial?.helpText ?? "");
    setOptionsText((initial?.options ?? []).join("\n"));
  }, [open, initial]);

  // Auto-derive key from label when user hasn't manually typed one yet
  useEffect(() => {
    if (!isEdit && !keyTouched) setKey(slugify(label));
  }, [label, keyTouched, isEdit]);

  const needsOptions = fieldType === "Select" || fieldType === "MultiSelect";

  async function save() {
    if (!label.trim() || !key.trim()) {
      toast.error("Label and key are required");
      return;
    }
    const options = needsOptions
      ? optionsText
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    if (needsOptions && (!options || options.length === 0)) {
      toast.error("Add at least one option");
      return;
    }
    const payload = {
      key: key.trim(),
      label: label.trim(),
      fieldType,
      requirement,
      visible,
      showInList,
      helpText: helpText || null,
      options,
    };
    setSaving(true);
    try {
      const url = isEdit
        ? `${apiBase}/${encodeURIComponent(initial!.key)}`
        : apiBase;
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      toast.success(isEdit ? "Field updated" : "Field created");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit field: ${initial?.label}` : "New custom field"} width="max-w-xl">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        <Field label="Label *" full>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Budget, Last call, Region" />
        </Field>
        <Field label="Key *" full>
          <Input
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setKeyTouched(true);
            }}
            disabled={isEdit}
            placeholder="lowercase_with_underscores"
            className={isEdit ? "bg-crm-panel" : ""}
          />
          {!isEdit && (
            <p className="mt-1 text-[11px] text-crm-muted">
              Used as the JSON property name on each lead. Auto-generated from label; edit if you need custom.
            </p>
          )}
        </Field>
        <Field label="Type">
          <Select value={fieldType} onChange={(e) => setFieldType(e.target.value as FieldType)} disabled={isEdit}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          {isEdit && <p className="mt-1 text-[11px] text-crm-muted">Type cannot change after creation.</p>}
        </Field>
        <Field label="Requirement">
          <Select value={requirement} onChange={(e) => setRequirement(e.target.value as typeof requirement)}>
            <option value="Optional">Optional</option>
            <option value="Required">Required</option>
          </Select>
        </Field>
        {needsOptions && (
          <Field label="Options (one per line) *" full>
            <textarea
              className="crm-input min-h-[100px]"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder="Hot&#10;Warm&#10;Cold"
            />
          </Field>
        )}
        <Field label="Help text" full>
          <Input value={helpText} onChange={(e) => setHelpText(e.target.value)} placeholder="Shown beneath the input" />
        </Field>
        <Field label="">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
            Visible in forms / detail
          </label>
        </Field>
        <Field label="">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showInList} onChange={(e) => setShowInList(e.target.checked)} />
            Show as column in leads list
          </label>
        </Field>
      </div>

      <FormActions className="mt-5">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create field"}
        </Button>
      </FormActions>
    </Modal>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={"block text-sm " + (full ? "md:col-span-full" : "")}>
      {label && <span className="mb-1 block font-medium text-crm-text">{label}</span>}
      {children}
    </label>
  );
}
