"use client";

import { Search } from "lucide-react";
import {
  PillDropdown,
  ActiveChip,
  SingleSelect,
  MultiSelect,
} from "./filter-toolbar-parts";
import { useEffect, useMemo, useState } from "react";
import { AssigneeMenu } from "./filter-assignee-menu";
import { ProjectSelectMenu } from "./filter-project-menu";
import { MoreFiltersMenu, type BuiltinKey } from "./filter-more-menu";
import { CustomFieldChip } from "./filter-custom-field-chip";
import type { CustomFilter } from "@/lib/customFields/filterQuery";
import type { CustomFieldDTO } from "@/lib/services/customFields";

export interface ToolbarState {
  projectId?: string;
  projectLabel?: string;
  assignee?: string; // "me" | "unassigned" | userId
  assigneeLabel?: string;
  reporter?: string;
  reporterLabel?: string;
  type: string[];
  statusCategory: string[];
  resolution?: "unresolved" | "done" | "any";
  // Custom-field value filters that carry an actual value — serialized to the
  // `customFilters` query param by filter-view.tsx and sent to the backend.
  customFilters?: CustomFilter[];
  // Field ids checked in the "More filters" picker (JPD/discovery + others).
  // A field can be enabled (chip visible) before a value is picked, so this is
  // tracked separately from `customFilters` (which only holds valued filters).
  // Each id is the composite (comma-joined) id from the filterable catalog.
  enabledFieldIds?: string[];
}

interface FilterToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  onClear: () => void;
  state: ToolbarState;
  onChange: (next: ToolbarState) => void;
  /** Opens the Save-filter modal (replaces the old "Copy filter" link). */
  onSaveFilter: () => void;
}

const TYPE_OPTIONS = [
  { value: "EPIC", label: "Epic" },
  { value: "STORY", label: "Story" },
  { value: "TASK", label: "Task" },
  { value: "BUG", label: "Bug" },
  { value: "SUBTASK", label: "Subtask" },
];

const STATUS_OPTIONS = [
  { value: "TO_DO", label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "DONE", label: "Done" },
];

const RESOLUTION_OPTIONS: { value: "unresolved" | "done" | "any"; label: string }[] = [
  { value: "unresolved", label: "Unresolved" },
  { value: "done", label: "Done" },
  { value: "any", label: "Any" },
];

export function defaultToolbarStateFor(filterId: string): ToolbarState {
  switch (filterId) {
    case "my-open":
      return {
        assignee: "me",
        assigneeLabel: "Current User",
        type: [],
        statusCategory: [],
        resolution: "unresolved",
      };
    case "reported-by-me":
      return {
        reporter: "me",
        reporterLabel: "Current User",
        type: [],
        statusCategory: [],
      };
    case "open":
      return { type: [], statusCategory: [], resolution: "unresolved" };
    case "done":
    case "resolved-recently":
      return { type: [], statusCategory: [], resolution: "done" };
    default:
      return { type: [], statusCategory: [] };
  }
}

export function FilterToolbar({ search, onSearchChange, onClear, state, onChange, onSaveFilter }: FilterToolbarProps) {
  // Active chips persist their own label on pick, so this fallback is only
  // hit for the "me"/"unassigned" pseudo-values.
  const userLabel = (id: string) => {
    if (id === "me") return "Current User";
    if (id === "unassigned") return "Unassigned";
    return id;
  };

  // Filterable-field catalog — cross-project by default (JPD/discovery fields
  // included), narrowed to one project's fields when a Project chip is set.
  // Lifted here so the "More filters" picker AND the active chips share it.
  const [catalog, setCatalog] = useState<CustomFieldDTO[]>([]);
  useEffect(() => {
    let alive = true;
    const url = state.projectId
      ? `/api/projects/${state.projectId}/issue-fields`
      : `/api/custom-fields/filterable`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => alive && j?.success && setCatalog(j.data ?? []))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [state.projectId]);

  const customFilters = state.customFilters ?? [];
  const enabledFieldIds = state.enabledFieldIds ?? [];
  const enabledFields = useMemo(
    () => enabledFieldIds.map((id) => catalog.find((f) => f.id === id)).filter((f): f is CustomFieldDTO => !!f),
    [enabledFieldIds, catalog],
  );

  const setCustomFilters = (next: CustomFilter[]) =>
    onChange({ ...state, customFilters: next });

  const toggleBuiltin = (key: BuiltinKey, on: boolean) => {
    if (key === "reporter") {
      onChange(
        on
          ? { ...state, reporter: "me", reporterLabel: "Current User" }
          : { ...state, reporter: undefined, reporterLabel: undefined },
      );
    } else {
      onChange({ ...state, resolution: on ? "unresolved" : "any" });
    }
  };

  const removeEnabledField = (id: string) =>
    onChange({
      ...state,
      enabledFieldIds: enabledFieldIds.filter((x) => x !== id),
      customFilters: customFilters.filter((f) => f.fieldId !== id),
    });

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <div className="relative w-56">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search work"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-8 pr-3 h-8 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {state.projectId ? (
        <ActiveChip
          label="Project"
          op="="
          value={state.projectLabel ?? "—"}
          onClear={() => onChange({ ...state, projectId: undefined, projectLabel: undefined })}
          renderValueMenu={(close) => (
            <ProjectSelectMenu
              selected={state.projectId}
              onPick={(value, label) => {
                onChange({ ...state, projectId: value, projectLabel: label });
                close();
              }}
            />
          )}
        />
      ) : (
        <PillDropdown label="Project">
          {(close) => (
            <ProjectSelectMenu
              onPick={(value, label) => {
                onChange({ ...state, projectId: value, projectLabel: label });
                close();
              }}
            />
          )}
        </PillDropdown>
      )}

      {state.assignee && state.assignee !== "any" ? (
        <ActiveChip
          label="Assignee"
          op="="
          value={state.assigneeLabel ?? userLabel(state.assignee)}
          onClear={() => onChange({ ...state, assignee: "any", assigneeLabel: undefined })}
          renderValueMenu={(close) => (
            <AssigneeMenu
              selected={state.assignee}
              onPick={(value, label) => {
                onChange({ ...state, assignee: value, assigneeLabel: label });
                close();
              }}
            />
          )}
        />
      ) : (
        <PillDropdown label="Assignee">
          {(close) => (
            <AssigneeMenu
              selected={state.assignee}
              onPick={(value, label) => {
                onChange({ ...state, assignee: value, assigneeLabel: label });
                close();
              }}
            />
          )}
        </PillDropdown>
      )}

      {state.reporter && state.reporter !== "any" && (
        <ActiveChip
          label="Reporter"
          op="="
          value={state.reporterLabel ?? userLabel(state.reporter)}
          onClear={() => onChange({ ...state, reporter: "any", reporterLabel: undefined })}
          renderValueMenu={(close) => (
            <AssigneeMenu
              selected={state.reporter}
              onPick={(value, label) => {
                onChange({ ...state, reporter: value, reporterLabel: label });
                close();
              }}
            />
          )}
        />
      )}

      <PillDropdown label="Type" badge={state.type.length || undefined}>
        {() => (
          <MultiSelect
            options={TYPE_OPTIONS}
            selected={state.type}
            onChange={(next) => onChange({ ...state, type: next })}
          />
        )}
      </PillDropdown>

      <PillDropdown label="Status" badge={state.statusCategory.length || undefined}>
        {() => (
          <MultiSelect
            options={STATUS_OPTIONS}
            selected={state.statusCategory}
            onChange={(next) => onChange({ ...state, statusCategory: next })}
          />
        )}
      </PillDropdown>

      {state.resolution && state.resolution !== "any" && (
        <ActiveChip
          label="Resolution"
          op="="
          value={state.resolution === "done" ? "Done" : "Unresolved"}
          onClear={() => onChange({ ...state, resolution: "any" })}
          renderValueMenu={(close) => (
            <SingleSelect
              options={RESOLUTION_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
              selected={state.resolution}
              onPick={(value) => {
                onChange({ ...state, resolution: value as ToolbarState["resolution"] });
                close();
              }}
            />
          )}
        />
      )}

      {/* Active chips for each enabled custom field — pick values here. */}
      {enabledFields.map((field) => (
        <CustomFieldChip
          key={field.id}
          field={field}
          projectId={state.projectId}
          filters={customFilters}
          onFiltersChange={setCustomFilters}
          onRemove={() => removeEnabledField(field.id)}
        />
      ))}

      <PillDropdown label="More filters">
        {() => (
          <MoreFiltersMenu
            projectId={state.projectId}
            enabledFieldIds={enabledFieldIds}
            onToggleField={(id, on) =>
              onChange({
                ...state,
                enabledFieldIds: on
                  ? [...enabledFieldIds, id]
                  : enabledFieldIds.filter((x) => x !== id),
                ...(on ? {} : { customFilters: customFilters.filter((f) => f.fieldId !== id) }),
              })
            }
            reporterOn={!!state.reporter && state.reporter !== "any"}
            resolutionOn={!!state.resolution && state.resolution === "unresolved"}
            onToggleBuiltin={toggleBuiltin}
          />
        )}
      </PillDropdown>

      <button type="button" onClick={onClear} className="text-sm text-blue-600 hover:underline px-1">
        Clear filters
      </button>
      <button type="button" onClick={onSaveFilter} className="text-sm text-blue-600 hover:underline px-1">
        Save filter
      </button>
    </div>
  );
}

