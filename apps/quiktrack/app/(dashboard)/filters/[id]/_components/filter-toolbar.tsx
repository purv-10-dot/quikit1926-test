"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import {
  PillDropdown,
  ActiveChip,
  SingleSelect,
  MultiSelect,
} from "./filter-toolbar-parts";
import { AssigneeMenu } from "./filter-assignee-menu";

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
}

interface FilterToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  onClear: () => void;
  state: ToolbarState;
  onChange: (next: ToolbarState) => void;
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

interface ProjectLite {
  id: string;
  name: string;
  projectKey?: string;
}

export function FilterToolbar({ search, onSearchChange, onClear, state, onChange }: FilterToolbarProps) {
  const [projects, setProjects] = useState<ProjectLite[]>([]);

  useEffect(() => {
    fetch("/api/projects?pageSize=50")
      .then((r) => r.json())
      .then((j) => j?.success && setProjects(j.data ?? []))
      .catch(() => undefined);
  }, []);

  // Active chips persist their own label on pick, so this fallback is only
  // hit for the "me"/"unassigned" pseudo-values.
  const userLabel = (id: string) => {
    if (id === "me") return "Current User";
    if (id === "unassigned") return "Unassigned";
    return id;
  };

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
            <SingleSelect
              searchable
              searchPlaceholder="Search projects…"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
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
            <SingleSelect
              searchable
              searchPlaceholder="Search projects…"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
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

      <PillDropdown label="More filters">
        {(close) => (
          <div className="py-1">
            <button
              type="button"
              disabled={!!state.reporter && state.reporter !== "any"}
              onClick={() => {
                onChange({ ...state, reporter: "me", reporterLabel: "Current User" });
                close();
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              + Reporter
            </button>
            <button
              type="button"
              disabled={!!state.resolution && state.resolution !== "any"}
              onClick={() => {
                onChange({ ...state, resolution: "unresolved" });
                close();
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              + Resolution
            </button>
          </div>
        )}
      </PillDropdown>

      <button type="button" onClick={onClear} className="text-sm text-blue-600 hover:underline px-1">
        Clear filters
      </button>
      <button type="button" className="text-sm text-blue-600 hover:underline px-1">
        Copy filter
      </button>
    </div>
  );
}

