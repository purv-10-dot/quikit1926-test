"use client";

/**
 * TemplateModal — shared modal for creating and editing meeting templates.
 *
 * Used for both "New Template" and "Edit Template" actions on the Templates
 * page. The parent page owns the mutation (create or update) and passes
 * `onSave`. This component only cares about form state.
 *
 * Sections are managed as an ordered string list with add / remove /
 * move-up / move-down controls. No drag-and-drop — keeps the dependency
 * surface small and the behavior predictable.
 */

import { useState, useEffect } from "react";
import { X, Plus, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { CADENCES, type Cadence } from "@/lib/schemas/meetingSchema";

export interface TemplateFormValues {
  name: string;
  cadence: Cadence;
  description: string;
  duration: number;
  sections: string[];
}

interface Props {
  open: boolean;
  mode: "create" | "edit";
  initial?: Partial<TemplateFormValues>;
  onClose: () => void;
  onSave: (values: TemplateFormValues) => Promise<void>;
  saving?: boolean;
}

const DEFAULT_VALUES: TemplateFormValues = {
  name: "",
  cadence: "weekly",
  description: "",
  duration: 60,
  sections: [""],
};

const CADENCE_LABELS: Record<Cadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

export function TemplateModal({
  open,
  mode,
  initial,
  onClose,
  onSave,
  saving = false,
}: Props) {
  const [values, setValues] = useState<TemplateFormValues>(DEFAULT_VALUES);
  const [error, setError] = useState<string | null>(null);

  // Hydrate whenever the modal opens with fresh initial values
  useEffect(() => {
    if (!open) return;
    setValues({
      name: initial?.name ?? "",
      cadence: (initial?.cadence ?? "weekly") as Cadence,
      description: initial?.description ?? "",
      duration: initial?.duration ?? 60,
      sections:
        initial?.sections && initial.sections.length > 0
          ? [...initial.sections]
          : [""],
    });
    setError(null);
  }, [open, initial]);

  if (!open) return null;

  function updateSection(index: number, text: string) {
    setValues((v) => {
      const next = [...v.sections];
      next[index] = text;
      return { ...v, sections: next };
    });
  }

  function addSection() {
    setValues((v) => ({ ...v, sections: [...v.sections, ""] }));
  }

  function removeSection(index: number) {
    setValues((v) => {
      if (v.sections.length === 1) return v; // always keep at least one
      const next = v.sections.filter((_, i) => i !== index);
      return { ...v, sections: next };
    });
  }

  function moveSection(index: number, direction: -1 | 1) {
    setValues((v) => {
      const next = [...v.sections];
      const target = index + direction;
      if (target < 0 || target >= next.length) return v;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...v, sections: next };
    });
  }

  async function handleSave() {
    const trimmedName = values.name.trim();
    const trimmedSections = values.sections.map((s) => s.trim()).filter(Boolean);

    if (!trimmedName) {
      setError("Template name is required");
      return;
    }
    if (trimmedSections.length === 0) {
      setError("Add at least one section");
      return;
    }
    if (values.duration <= 0) {
      setError("Duration must be positive");
      return;
    }

    setError(null);
    try {
      await onSave({
        ...values,
        name: trimmedName,
        description: values.description.trim(),
        sections: trimmedSections,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save template");
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">
            {mode === "create" ? "New Meeting Template" : "Edit Meeting Template"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-md p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={values.name}
                onChange={(e) => setValues({ ...values, name: e.target.value })}
                placeholder="e.g. Weekly Leadership Sync"
                className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Cadence *
              </label>
              <select
                value={values.cadence}
                onChange={(e) =>
                  setValues({ ...values, cadence: e.target.value as Cadence })
                }
                className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-accent-400"
              >
                {CADENCES.map((c) => (
                  <option key={c} value={c}>
                    {CADENCE_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Duration (minutes) *
              </label>
              <input
                type="number"
                min={1}
                value={values.duration}
                onChange={(e) =>
                  setValues({
                    ...values,
                    duration: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={values.description}
              onChange={(e) =>
                setValues({ ...values, description: e.target.value })
              }
              rows={2}
              placeholder="What is this meeting for?"
              className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-gray-700">
                Sections * <span className="text-gray-400 font-normal">({values.sections.length})</span>
              </label>
              <button
                type="button"
                onClick={addSection}
                className="flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700 font-medium"
              >
                <Plus className="h-3 w-3" />
                Add section
              </button>
            </div>
            <div className="space-y-2">
              {values.sections.map((section, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 font-mono w-4 text-right flex-shrink-0">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={section}
                    onChange={(e) => updateSection(idx, e.target.value)}
                    placeholder={`Section ${idx + 1}`}
                    className="flex-1 text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
                  />
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => moveSection(idx, -1)}
                      disabled={idx === 0}
                      className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500"
                      title="Move up"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(idx, 1)}
                      disabled={idx === values.sections.length - 1}
                      className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500"
                      title="Move down"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSection(idx)}
                      disabled={values.sections.length === 1}
                      className="p-1 rounded hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed text-red-500"
                      title="Remove"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-md disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : mode === "create"
                ? "Create template"
                : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
