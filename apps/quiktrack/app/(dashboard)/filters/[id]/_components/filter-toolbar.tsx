"use client";

import { useEffect, useRef, useState } from "react";
import { Search, ChevronDown, X, Check } from "lucide-react";

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

interface UserLite {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}
interface ProjectLite {
  id: string;
  name: string;
  projectKey?: string;
}

export function FilterToolbar({ search, onSearchChange, onClear, state, onChange }: FilterToolbarProps) {
  const [users, setUsers] = useState<UserLite[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);

  useEffect(() => {
    fetch("/api/users/search?limit=20")
      .then((r) => r.json())
      .then((j) => j?.success && setUsers(j.data ?? []))
      .catch(() => undefined);
    fetch("/api/projects?pageSize=50")
      .then((r) => r.json())
      .then((j) => j?.success && setProjects(j.data ?? []))
      .catch(() => undefined);
  }, []);

  const userLabel = (id: string) => {
    if (id === "me") return "Current User";
    if (id === "unassigned") return "Unassigned";
    const u = users.find((x) => x.id === id);
    return u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email : id;
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
          label="Space"
          op="="
          value={state.projectLabel ?? "—"}
          onClear={() => onChange({ ...state, projectId: undefined, projectLabel: undefined })}
          renderValueMenu={(close) => (
            <SingleSelect
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
        <PillDropdown label="Space">
          {(close) => (
            <SingleSelect
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
              users={users}
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
              users={users}
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
              users={users}
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

interface PillDropdownProps {
  label: string;
  badge?: number;
  children: (close: () => void) => React.ReactNode;
}

function PillDropdown({ label, badge, children }: PillDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClose(ref, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 h-8 px-2.5 text-sm border rounded ${
          open || badge
            ? "border-blue-300 text-blue-700 bg-blue-50"
            : "border-gray-200 text-gray-700 hover:bg-gray-50"
        }`}
      >
        <span>{label}</span>
        {badge ? <span className="text-blue-600 font-medium">({badge})</span> : null}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 min-w-[200px] bg-white border border-gray-200 rounded shadow-lg py-1">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

interface ActiveChipProps {
  label: string;
  op: string;
  value: string;
  onClear: () => void;
  renderValueMenu: (close: () => void) => React.ReactNode;
}

function ActiveChip({ label, op, value, onClear, renderValueMenu }: ActiveChipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClose(ref, () => setOpen(false));

  return (
    <div ref={ref} className="relative inline-flex items-center h-8 border border-blue-300 rounded bg-white text-sm overflow-hidden">
      <span className="inline-flex items-center gap-1 px-2.5 h-full text-blue-700 font-medium">
        {label}
        <span className="text-blue-500 font-normal">{op}</span>
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-2.5 h-full text-blue-700 font-medium border-l border-blue-100 hover:bg-blue-50"
      >
        {value}
        <ChevronDown className="h-3.5 w-3.5 text-blue-500" />
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${label} filter`}
        className="h-full px-1.5 text-blue-500 hover:bg-blue-50 border-l border-blue-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 min-w-[200px] bg-white border border-gray-200 rounded shadow-lg py-1">
          {renderValueMenu(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

interface Option { value: string; label: string }

function SingleSelect({
  options,
  selected,
  onPick,
}: {
  options: Option[];
  selected?: string;
  onPick: (value: string, label: string) => void;
}) {
  if (options.length === 0) {
    return <div className="px-3 py-2 text-xs text-gray-400">No options</div>;
  }
  return (
    <div className="max-h-64 overflow-y-auto">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onPick(o.value, o.label)}
          className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${
            o.value === selected ? "text-blue-700 font-medium" : "text-gray-700"
          }`}
        >
          {o.value === selected ? (
            <Check className="h-3.5 w-3.5 text-blue-600" />
          ) : (
            <span className="h-3.5 w-3.5" />
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MultiSelect({
  options,
  selected,
  onChange,
}: {
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
  };
  return (
    <div className="max-h-64 overflow-y-auto">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${
              on ? "text-blue-700 font-medium" : "text-gray-700"
            }`}
          >
            <span
              className={`h-3.5 w-3.5 inline-flex items-center justify-center border rounded ${
                on ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300"
              }`}
            >
              {on && <Check className="h-3 w-3" />}
            </span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function AssigneeMenu({
  users,
  onPick,
}: {
  users: UserLite[];
  onPick: (value: string, label: string) => void;
}) {
  return (
    <SingleSelect
      options={[
        { value: "me", label: "Current User" },
        { value: "unassigned", label: "Unassigned" },
        ...users.map((u) => ({
          value: u.id,
          label: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
        })),
      ]}
      onPick={onPick}
    />
  );
}

function useOutsideClose(ref: React.RefObject<HTMLElement>, onClose: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onClose]);
}
