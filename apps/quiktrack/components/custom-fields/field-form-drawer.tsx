"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  fieldConfig,
  generateFieldKey,
  type FieldType,
  type FieldValue,
} from "@/lib/customFields/registry";
import type { CustomFieldDTO } from "@/lib/services/customFields";
import { FieldControl } from "./field-control";
import { FieldTypePicker } from "./field-type-picker";
import { OptionsEditor, type OptionDraft } from "./options-editor";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Base API path: "/api/settings/custom-fields" or "/api/projects/{id}/custom-fields". */
  apiBase: string;
  queryKey: readonly unknown[];
  /** Provided when editing; omitted when creating. */
  field?: CustomFieldDTO | null;
}

interface FormState {
  name: string;
  type: FieldType;
  description: string;
  isRequired: boolean;
  placeholder: string;
  helpText: string;
  options: OptionDraft[];
  defaultValue: FieldValue;
}

function initialState(field?: CustomFieldDTO | null): FormState {
  return {
    name: field?.name ?? "",
    type: (field?.type as FieldType) ?? "SHORT_TEXT",
    description: field?.description ?? "",
    isRequired: field?.isRequired ?? false,
    placeholder: field?.placeholder ?? "",
    helpText: field?.helpText ?? "",
    options: field?.options.map((o) => ({ id: o.id, label: o.label, isActive: o.isActive })) ?? [],
    defaultValue: (field?.defaultValue as FieldValue) ?? null,
  };
}

export function FieldFormDrawer({ open, onClose, apiBase, queryKey, field }: Props) {
  const isEdit = Boolean(field);
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialState(field));
  const [error, setError] = useState<string | null>(null);

  // The drawer stays mounted while closed (it just renders null), so its state
  // would otherwise persist between opens. Re-seed the form each time it opens
  // — blank for a create, the target field's values for an edit.
  useEffect(() => {
    if (open) {
      setForm(initialState(field));
      setError(null);
    }
  }, [open, field]);

  const cfg = fieldConfig(form.type);

  // A lightweight DTO so FieldControl can render the default-value editor from
  // the in-progress form (option values mirror the server's key generation).
  const previewField = useMemo<CustomFieldDTO>(
    () => ({
      id: field?.id ?? "preview",
      orgId: "",
      scope: field?.scope ?? "space",
      projectId: field?.projectId ?? null,
      name: form.name || "Field",
      key: field?.key ?? "",
      type: form.type,
      description: null,
      status: "active",
      isRequired: form.isRequired,
      defaultValue: null,
      placeholder: form.placeholder || null,
      helpText: null,
      position: 0,
      options: form.options
        .filter((o) => o.isActive && o.label.trim())
        .map((o, i) => ({ id: o.id ?? `p${i}`, label: o.label, value: generateFieldKey(o.label), position: i, isActive: true })),
      createdAt: "",
      updatedAt: "",
    }),
    [form, field],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      // The create schema accepts these optional text fields as string|undefined
      // (not null), so on create we OMIT blanks (undefined → dropped by
      // JSON.stringify). On edit the update schema is .nullable(), so we keep
      // sending null — that's how a user clears a previously-set value.
      const blankText = isEdit ? null : undefined;
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim() || blankText,
        isRequired: form.isRequired,
        placeholder: form.placeholder.trim() || blankText,
        helpText: form.helpText.trim() || blankText,
        defaultValue: form.defaultValue ?? null,
      };
      if (!isEdit) payload.type = form.type;
      if (cfg.hasOptions) {
        payload.options = form.options
          .filter((o) => o.label.trim() || o.id)
          .map((o) => ({ id: o.id, label: o.label.trim(), isActive: o.isActive }));
      }
      const url = isEdit ? `${apiBase}/${field!.id}` : apiBase;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());
      if (!res?.success) throw new Error(res?.error ?? "Failed to save field");
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
      // Also refresh the issue create/edit forms, which read the active field
      // set under a different key ("issue-fields"). Without this a newly created
      // or edited field only shows up after a manual page refresh. Global fields
      // affect every project, so invalidate the whole prefix.
      void qc.invalidateQueries({ queryKey: ["quiktrack", "issue-fields"] });
      onClose();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Failed to save field"),
  });

  if (!open) return null;

  const showDefault = !cfg.isMulti && form.type !== "USER_PICKER"; // keep default editor simple

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/40">
      <div className="h-full w-full max-w-md bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">{isEdit ? "Edit field" : "Create field"}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-500" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <Field label="Field type" required>
            <FieldTypePicker
              value={form.type}
              disabled={isEdit}
              onChange={(t) => setForm((f) => ({ ...f, type: t, options: [], defaultValue: null }))}
            />
            {isEdit && <p className="mt-1 text-[11px] text-gray-400">Type can&apos;t be changed after creation.</p>}
            {/* People pickers come in two flavours — single or multi-select. The
                multi variant is its own field type (USER_PICKER_MULTI); this
                toggle just switches between them. */}
            {(form.type === "USER_PICKER" || form.type === "USER_PICKER_MULTI") && (
              <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.type === "USER_PICKER_MULTI"}
                  disabled={isEdit}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      type: e.target.checked ? "USER_PICKER_MULTI" : "USER_PICKER",
                      defaultValue: null,
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                />
                Allow selecting multiple people
              </label>
            )}
          </Field>

          <Field label="Name" required>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              maxLength={100}
              placeholder="e.g. Customer Tier"
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              maxLength={300}
              rows={2}
              placeholder="Optional helper text shown next to the field"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </Field>

          {cfg.hasOptions && (
            <Field label="Options" required>
              <OptionsEditor options={form.options} onChange={(options) => setForm((f) => ({ ...f, options }))} />
            </Field>
          )}

          <Field label="Placeholder">
            <input
              value={form.placeholder}
              onChange={(e) => setForm((f) => ({ ...f, placeholder: e.target.value }))}
              maxLength={200}
              placeholder='e.g. "Enter contract value in USD"'
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>

          <Field label="Help text">
            <input
              value={form.helpText}
              onChange={(e) => setForm((f) => ({ ...f, helpText: e.target.value }))}
              maxLength={200}
              placeholder="Short hint shown below the field"
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>

          {showDefault && (
            <Field label="Default value">
              <FieldControl field={previewField} value={form.defaultValue} onChange={(v) => setForm((f) => ({ ...f, defaultValue: v }))} />
            </Field>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isRequired}
              onChange={(e) => setForm((f) => ({ ...f, isRequired: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Required — issues can&apos;t be saved without a value
          </label>

          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 text-sm text-gray-700 rounded hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              if (!form.name.trim()) return setError("Name is required.");
              if (cfg.hasOptions && !form.options.some((o) => o.isActive && o.label.trim()))
                return setError("Add at least one option.");
              mutation.mutate();
            }}
            disabled={mutation.isPending}
            className="h-9 px-4 text-sm font-semibold text-white bg-blue-700 rounded hover:bg-blue-800 disabled:bg-gray-300"
          >
            {mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Create field"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
