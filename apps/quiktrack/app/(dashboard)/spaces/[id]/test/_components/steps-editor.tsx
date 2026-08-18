"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Textarea } from "@quikit/ui";

/**
 * Ordered action ↔ expected-result pairs — the substance of a test case.
 *
 * Order is positional in the array; `orderNo` is assigned server-side on save
 * (1..n), so nothing here needs to track index numbers. Reordering is explicit
 * up/down rather than drag-and-drop: steps are edited rarely and in small
 * numbers, and buttons stay keyboard-accessible for free.
 */

export interface StepDraft {
  action: string;
  expected: string;
}

interface StepsEditorProps {
  steps: StepDraft[];
  onChange: (steps: StepDraft[]) => void;
  disabled?: boolean;
}

export function StepsEditor({ steps, onChange, disabled }: StepsEditorProps) {
  const update = (index: number, patch: Partial<StepDraft>) => {
    onChange(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const add = () => onChange([...steps, { action: "", expected: "" }]);

  const remove = (index: number) => onChange(steps.filter((_, i) => i !== index));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const next = steps.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {steps.length === 0 && (
        <p className="rounded border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-gray-500">
          No steps yet. A case can be saved without steps — add them when the
          procedure is known.
        </p>
      )}

      {steps.map((step, index) => (
        <div
          key={index}
          className="rounded border border-gray-200 bg-white p-2.5"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">
              Step {index + 1}
            </span>
            {!disabled && (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label={`Move step ${index + 1} up`}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === steps.length - 1}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label={`Move step ${index + 1} down`}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Delete step ${index + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">
                Action
              </label>
              <Textarea
                rows={2}
                value={step.action}
                disabled={disabled}
                placeholder="Navigate to /login"
                onChange={(e) => update(index, { action: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">
                Expected result
              </label>
              <Textarea
                rows={2}
                value={step.expected}
                disabled={disabled}
                placeholder="Login form is displayed"
                onChange={(e) => update(index, { expected: e.target.value })}
              />
            </div>
          </div>
        </div>
      ))}

      {!disabled && (
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm text-accent-700 hover:bg-accent-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add step
        </button>
      )}
    </div>
  );
}
