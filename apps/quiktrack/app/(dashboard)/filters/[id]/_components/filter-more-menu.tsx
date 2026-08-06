"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Type as TypeIcon,
  AlignLeft,
  Hash,
  Calendar,
  ChevronDownSquare,
  ListChecks,
  CheckSquare,
  Link as LinkIcon,
  User,
  Users,
  Tag,
  UserCircle,
  CircleDot,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CustomFieldDTO } from "@/lib/services/customFields";
import type { FieldType } from "@/lib/customFields/registry";
import { isSavedFilterField } from "./filter-custom-field-chip";

/** Icon + human label per custom-field type (mirrors the Jira field picker). */
const TYPE_META: Record<FieldType, { icon: LucideIcon; label: string }> = {
  SHORT_TEXT: { icon: TypeIcon, label: "Short text" },
  LONG_TEXT: { icon: AlignLeft, label: "Paragraph" },
  NUMBER: { icon: Hash, label: "Number" },
  DATE: { icon: Calendar, label: "Date" },
  DROPDOWN_SINGLE: { icon: ChevronDownSquare, label: "Dropdown" },
  DROPDOWN_MULTI: { icon: ListChecks, label: "Dropdown (multi)" },
  CHECKBOX: { icon: CheckSquare, label: "Checkbox" },
  URL: { icon: LinkIcon, label: "URL" },
  USER_PICKER: { icon: User, label: "User picker" },
  USER_PICKER_MULTI: { icon: Users, label: "User picker (multi)" },
  LABELS: { icon: Tag, label: "Labels" },
};

/** Built-in (non-custom-field) filters offered alongside custom fields. */
export type BuiltinKey = "reporter" | "resolution";
const BUILTINS: { key: BuiltinKey; name: string; icon: LucideIcon; typeLabel: string }[] = [
  { key: "reporter", name: "Reporter", icon: UserCircle, typeLabel: "People" },
  { key: "resolution", name: "Resolution", icon: CircleDot, typeLabel: "Status" },
];

interface FieldsResponse {
  success: boolean;
  data?: CustomFieldDTO[];
}

interface Row {
  id: string; // custom: composite field id; builtin: `builtin:<key>`
  name: string;
  icon: LucideIcon;
  typeLabel: string;
  kind: "custom" | "builtin";
  field?: CustomFieldDTO;
  builtin?: BuiltinKey;
}

/**
 * Jira-style "More filters" picker: a searchable, scrollable checkbox list of
 * every filterable field (built-ins + all custom fields, cross-project by
 * default). Checking a row turns that filter ON (adds an empty custom-field
 * filter or toggles the built-in); the value is chosen from the resulting
 * active chip in the toolbar.
 */
export function MoreFiltersMenu({
  projectId,
  enabledFieldIds,
  onToggleField,
  reporterOn,
  resolutionOn,
  onToggleBuiltin,
}: {
  projectId?: string;
  enabledFieldIds: string[];
  onToggleField: (fieldId: string, on: boolean) => void;
  reporterOn: boolean;
  resolutionOn: boolean;
  onToggleBuiltin: (key: BuiltinKey, on: boolean) => void;
}) {
  const [fields, setFields] = useState<CustomFieldDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const url = projectId
      ? `/api/projects/${projectId}/issue-fields`
      : `/api/custom-fields/filterable`;
    fetch(url)
      .then((r) => r.json())
      .then((j: FieldsResponse) => {
        if (alive) setFields(j?.success ? j.data ?? [] : []);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [projectId]);

  const rows: Row[] = useMemo(() => {
    const builtinRows: Row[] = BUILTINS.map((b) => ({
      id: `builtin:${b.key}`,
      name: b.name,
      icon: b.icon,
      typeLabel: b.typeLabel,
      kind: "builtin",
      builtin: b.key,
    }));
    const customRows: Row[] = fields
      .filter(isSavedFilterField)
      .map((f) => {
        const meta = TYPE_META[f.type];
        return {
          id: f.id,
          name: f.name,
          icon: meta?.icon ?? CircleDot,
          typeLabel: meta?.label ?? "Field",
          kind: "custom" as const,
          field: f,
        };
      });
    return [...builtinRows, ...customRows].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [fields]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(query));
  }, [rows, q]);

  const enabledSet = useMemo(() => new Set(enabledFieldIds), [enabledFieldIds]);

  const isChecked = (r: Row): boolean => {
    if (r.kind === "builtin") {
      return r.builtin === "reporter" ? reporterOn : resolutionOn;
    }
    return enabledSet.has(r.id);
  };

  const selectedCount =
    enabledFieldIds.length + (reporterOn ? 1 : 0) + (resolutionOn ? 1 : 0);

  const toggle = (r: Row, next: boolean) => {
    if (r.kind === "builtin" && r.builtin) {
      onToggleBuiltin(r.builtin, next);
      return;
    }
    onToggleField(r.id, next);
  };

  const clearAll = () => {
    for (const id of enabledFieldIds) onToggleField(id, false);
    if (reporterOn) onToggleBuiltin("reporter", false);
    if (resolutionOn) onToggleBuiltin("resolution", false);
  };

  return (
    <div className="w-72">
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            autoFocus
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search more filters"
            className="w-full pl-8 pr-2 h-8 text-sm border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto py-1">
        {loading ? (
          <div className="px-3 py-3 text-xs text-gray-400">Loading fields…</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-3 text-xs text-gray-400">No fields found</div>
        ) : (
          filtered.map((r) => {
            const Icon = r.icon;
            const checked = isChecked(r);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggle(r, !checked)}
                className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 pointer-events-none"
                />
                <Icon className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-gray-800 truncate">{r.name}</span>
                  <span className="block text-[11px] text-gray-400 truncate">{r.typeLabel}</span>
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100">
        <button
          type="button"
          onClick={clearAll}
          disabled={selectedCount === 0}
          className="text-xs text-blue-600 hover:underline disabled:text-gray-300 disabled:no-underline"
        >
          Clear selection
        </button>
        <span className="text-[11px] text-gray-400">
          {selectedCount} of {rows.length}
        </span>
      </div>
    </div>
  );
}
