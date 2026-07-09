"use client";

import {
  BarChart3,
  Hash,
  Percent,
  Target,
  Tag,
  Calculator,
  CaseSensitive,
  type LucideIcon,
} from "lucide-react";
import { IdeaValueCell } from "./idea-value-cell";
import { K, type FieldDef, type IdeaRow } from "./ideas-types";

export interface Column {
  key: string;
  label: string;
  field?: FieldDef; // undefined for the built-in "summary" column
}

/** Header icon per column, matching the JPD field-type glyphs. */
function columnIcon(col: Column): LucideIcon {
  if (col.key === "summary") return CaseSensitive;
  switch (col.key) {
    case K.theme: return Tag;
    case K.impact:
    case K.effort: return BarChart3;
    case K.reach: return Hash;
    case K.confidence: return Percent;
    case K.roadmap: return Target;
    case K.score: return Calculator;
    default: return Hash;
  }
}

/**
 * The "All ideas" spreadsheet grid: one row per idea, one column per field.
 * Summary is frozen-left and clickable (opens the detail panel); every other
 * column renders read-only via IdeaValueCell. Inline editing arrives in a
 * follow-up — this pass matches the read layout of the JPD table.
 */
export function IdeasTable({
  columns,
  ideas,
  onOpen,
}: {
  columns: Column[];
  ideas: IdeaRow[];
  onOpen: (idea: IdeaRow) => void;
}) {
  return (
    <div className="overflow-x-auto border-t border-gray-200">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="w-9 px-3 py-2">
              <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600" aria-label="Select all" />
            </th>
            {columns.map((col) => {
              const Icon = columnIcon(col);
              return (
                <th
                  key={col.key}
                  className={`px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap ${
                    col.key === "summary" ? "min-w-[240px]" : "min-w-[120px]"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-gray-400" />
                    {col.label}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ideas.map((idea) => (
            <tr key={idea.id} className="border-b border-gray-100 hover:bg-blue-50/40">
              <td className="px-3 py-2 align-middle">
                <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600" aria-label={`Select ${idea.title}`} />
              </td>
              {columns.map((col) => {
                if (col.key === "summary") {
                  return (
                    <td key={col.key} className="px-3 py-2 align-middle">
                      <button
                        type="button"
                        onClick={() => onOpen(idea)}
                        className="text-left font-medium text-gray-900 hover:text-blue-700 hover:underline"
                      >
                        {idea.title}
                      </button>
                    </td>
                  );
                }
                return (
                  <td key={col.key} className="px-3 py-2 align-middle">
                    {col.field ? <IdeaValueCell field={col.field} value={idea.values[col.field.id] ?? null} /> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
