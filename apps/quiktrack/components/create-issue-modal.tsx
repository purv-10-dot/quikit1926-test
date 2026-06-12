"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  X,
  Minus,
  Maximize2,
  MoreHorizontal,
  CheckSquare,
  Zap,
  Bug,
  BookOpen,
  ChevronDown,
  Calendar as CalendarIcon,
  AlertCircle,
  ChevronsUp,
  ChevronUp,
  ChevronsDown,
  ChevronDown as ChevronDownArrow,
  Equal,
  Check,
} from "lucide-react";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { uploadProjectImage } from "@/lib/upload-image";
import { BoardFilterSelect } from "@/app/(dashboard)/spaces/[id]/board/_components/board-filter-select";
import { SpaceIcon } from "@/components/space-icon";
import { useApiData } from "@/lib/hooks/useApiData";
import { CustomFieldsSection, defaultValuesFor } from "@/components/custom-fields/custom-fields-section";
import { validateFieldValue } from "@/lib/validation/customField";
import type { CustomFieldDTO } from "@/lib/services/customFields";
import type { FieldValue } from "@/lib/customFields/registry";

const NO_FIELDS: CustomFieldDTO[] = [];

type IssueType = "TASK" | "BUG" | "STORY" | "EPIC";
type Priority = "HIGHEST" | "HIGH" | "MEDIUM" | "LOW" | "LOWEST";

interface EpicOption {
  id: string;
  key: string;
  title: string;
}

const PRIORITY_META: Record<
  Priority,
  { label: string; color: string; Icon: React.ElementType }
> = {
  HIGHEST: { label: "Highest", color: "text-red-600", Icon: ChevronsUp },
  HIGH: { label: "High", color: "text-red-500", Icon: ChevronUp },
  MEDIUM: { label: "Medium", color: "text-amber-500", Icon: Equal },
  LOW: { label: "Low", color: "text-blue-500", Icon: ChevronDownArrow },
  LOWEST: { label: "Lowest", color: "text-blue-400", Icon: ChevronsDown },
};

interface Project {
  id: string;
  name: string;
  projectKey: string;
  icon?: string | null;
  color?: string | null;
}

interface Status {
  id: string;
  name: string;
  category: "TODO" | "IN_PROGRESS" | "DONE" | "BACKLOG";
}

interface Member {
  userId: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

interface Sprint {
  id: string;
  name: string;
  status: string;
}

const TYPE_META: Record<IssueType, { Icon: React.ElementType; label: string; color: string }> = {
  TASK: { Icon: CheckSquare, label: "Task", color: "text-blue-500" },
  BUG: { Icon: Bug, label: "Bug", color: "text-red-500" },
  STORY: { Icon: BookOpen, label: "Story", color: "text-green-600" },
  EPIC: { Icon: Zap, label: "Epic", color: "text-purple-500" },
};

function memberLabel(m: Member): string {
  const u = m.user;
  if (!u) return "Unknown";
  const fn = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return fn || u.email;
}

export function CreateIssueModal({
  open,
  onClose,
  initialProjectId,
}: {
  open: boolean;
  onClose: () => void;
  initialProjectId?: string;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? null;
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);

  const [type, setType] = useState<IssueType>("TASK");
  const [statusId, setStatusId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [epicId, setEpicId] = useState<string>("");
  const [epics, setEpics] = useState<EpicOption[]>([]);
  const [dueDate, setDueDate] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [sprintId, setSprintId] = useState<string>("");
  const [storyPoints, setStoryPoints] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState(false);
  const [createAnother, setCreateAnother] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [showCfErrors, setShowCfErrors] = useState(false);

  // Active custom fields (global + space) for the chosen project, with the
  // values the user enters. Seeded from each field's default when they load.
  const { data: cfData } = useApiData<CustomFieldDTO[]>(
    ["quiktrack", "issue-fields", projectId],
    projectId ? `/api/projects/${projectId}/issue-fields` : null,
  );
  const customFields = cfData ?? NO_FIELDS;
  const [customValues, setCustomValues] = useState<Record<string, FieldValue>>({});
  useEffect(() => {
    if (cfData) setCustomValues(defaultValuesFor(cfData));
  }, [cfData]);
  const memberOptions = useMemo(
    () => members.map((m) => ({ id: m.userId, label: memberLabel(m) })),
    [members],
  );

  // Fetch projects when modal opens.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch(`/api/projects?pageSize=100&sort=name&order=asc`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const data: Project[] = j?.data ?? [];
        setProjects(data);
        if (!projectId) {
          setProjectId(initialProjectId ?? data[0]?.id ?? "");
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, initialProjectId, projectId]);

  // Reset form whenever modal opens fresh.
  useEffect(() => {
    if (!open) {
      setError(null);
      return;
    }
    setTitle("");
    setDescription("");
    setStoryPoints("");
    setSprintId("");
    setAssigneeId("");
    setEpicId("");
    setPriority("MEDIUM");
    setDueDate("");
    setStartDate("");
    setError(null);
    setShowCfErrors(false);
  }, [open]);

  // Fetch project-scoped data when project changes.
  useEffect(() => {
    if (!open || !projectId) return;
    let alive = true;
    Promise.all([
      fetch(`/api/projects/${projectId}/statuses`).then((r) => r.json()),
      fetch(`/api/projects/${projectId}/members`).then((r) => r.json()),
      fetch(`/api/sprints?projectId=${projectId}&limit=50`).then((r) => r.json()),
      fetch(`/api/issues?projectId=${projectId}&type=EPIC&limit=100`).then((r) => r.json()),
    ]).then(([s, m, sp, ep]) => {
      if (!alive) return;
      const sList: Status[] = s?.success ? s.data : [];
      setStatuses(sList);
      setStatusId((cur) => cur || sList.find((x) => x.category === "TODO")?.id || sList[0]?.id || "");
      const mData = m?.success ? m.data?.members ?? m.data : [];
      setMembers(Array.isArray(mData) ? mData : []);
      setSprints(sp?.success ? sp.data ?? [] : []);
      const epicData = ep?.success ? ep.data ?? [] : [];
      setEpics(epicData.map((e: { id: string; key: string; title: string }) => ({
        id: e.id, key: e.key, title: e.title,
      })));
    });
    return () => {
      alive = false;
    };
  }, [open, projectId]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  );

  async function submit() {
    setError(null);
    setTitleError(false);
    if (!projectId) return setError("Choose a space");
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    // Over-limit summary is blocked here; the live message under the Summary
    // field (not the bottom error box, which is off-screen) tells the user why.
    if (title.trim().length > 255) return;
    // Validate custom fields up front so invalid values surface as the inline
    // per-field messages — not the aggregated server error in the bottom box.
    if (cfData && customFields.some((f) => !validateFieldValue(f, customValues[f.id] ?? null).ok)) {
      setShowCfErrors(true);
      return;
    }
    setShowCfErrors(false);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        projectId,
        title: title.trim(),
        type,
      };
      if (type !== "EPIC") body.priority = priority;
      if (description.trim()) body.description = description.trim();
      if (statusId) body.statusId = statusId;
      if (assigneeId) body.assigneeId = assigneeId;
      if (sprintId) body.sprintId = sprintId;
      if (epicId && type !== "EPIC") body.epicId = epicId;
      if (dueDate) body.dueDate = new Date(dueDate).toISOString();
      if (startDate) body.startDate = new Date(startDate).toISOString();
      if (storyPoints) {
        const n = parseInt(storyPoints, 10);
        if (!Number.isNaN(n)) body.storyPoints = n;
      }
      // Send custom field values once the field set has loaded — this enables
      // server-side required-field enforcement for the full create form.
      if (cfData) body.customFields = customValues;
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());
      if (!res.success) {
        setError(res.error || "Failed to create issue");
        return;
      }
      // Notify any open views (Backlog / Board / etc.) so they can refresh
      // without a full page reload.
      window.dispatchEvent(
        new CustomEvent("quiktrack:issue-created", {
          detail: {
            projectId,
            sprintId: sprintId || null,
            issue: res.data,
            // Mirror id/key at the top of detail so generic listeners (the
            // success toast, link-after-create flows) don't have to know the
            // legacy nested shape.
            id: res.data?.id,
            key: res.data?.key,
          },
        }),
      );
      router.refresh();
      if (createAnother) {
        setTitle("");
        setDescription("");
      } else {
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;
  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-[60] inline-flex items-center gap-2 h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded shadow-lg"
      >
        Create {TYPE_META[type].label} (minimized)
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 overflow-y-auto py-10">
      <div className="w-[680px] max-w-[95vw] bg-white rounded-md shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            Create {TYPE_META[type].label}
          </h2>
          <div className="flex items-center gap-1 text-gray-500">
            {/* <button onClick={() => setMinimized(true)} className="p-1.5 hover:bg-gray-100 rounded" aria-label="Minimize">
              <Minus className="h-4 w-4" />
            </button>
            <button className="p-1.5 hover:bg-gray-100 rounded" aria-label="Maximize">
              <Maximize2 className="h-4 w-4" />
            </button>
            <button className="p-1.5 hover:bg-gray-100 rounded" aria-label="More">
              <MoreHorizontal className="h-4 w-4" />
            </button> */}
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <p className="text-xs text-gray-600">
            Required fields are marked with an asterisk <span className="text-red-500">*</span>
          </p>

          {/* Space */}
          <Field label="Space" required>
            <SpacePicker
              projects={projects}
              value={projectId}
              onChange={(id) => {
                setProjectId(id);
                setStatusId("");
                setSprintId("");
                setAssigneeId("");
              }}
            />
          </Field>

          {/* Work type */}
          <Field label="Work type" required>
            <WorkTypePicker
              value={type}
              onChange={(t) => {
                setType(t);
                if (t === "EPIC") {
                  setSprintId("");
                  setStoryPoints("");
                  setPriority("MEDIUM");
                  setEpicId("");
                }
              }}
            />
          </Field>

          <hr className="border-gray-200" />

          {/* Status */}
          <Field label="Status" hint="This is the initial status upon creation">
            <StatusPicker statuses={statuses} value={statusId} onChange={setStatusId} />
          </Field>

          {/* Summary */}
          <Field label="Summary" required>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError && e.target.value.trim()) setTitleError(false);
                if (error) setError(null);
              }}
              autoFocus
              className={`w-full h-9 px-3 text-sm border rounded focus:outline-none focus:ring-2 ${
                titleError || title.trim().length > 255
                  ? "border-red-500 ring-1 ring-red-500 focus:ring-red-500"
                  : "border-blue-500 focus:ring-blue-500"
              }`}
            />
            {titleError && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-3.5 w-3.5" />
                Summary is required
              </p>
            )}
            {title.trim().length > 255 && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Summary must be 255 characters or less (currently {title.trim().length}).
              </p>
            )}
          </Field>

          {/* Description */}
          <Field label="Description">
            <RichTextEditor
              value={description}
              onChange={setDescription}
              uploadImage={(file) => uploadProjectImage(projectId, file)}
            />
          </Field>

          {/* Assignee */}
          <Field
            label="Assignee"
            rightLabel={
              <button
                type="button"
                className="text-xs text-blue-600 hover:underline"
                onClick={() => {
                  if (currentUserId && members.some((m) => m.userId === currentUserId)) {
                    setAssigneeId(currentUserId);
                  }
                }}
              >
                Assign to me
              </button>
            }
          >
            <BoardFilterSelect
              value={assigneeId}
              onChange={setAssigneeId}
              placeholder="Automatic"
              searchable
              options={[
                { value: "", label: "Automatic" },
                ...members.map((m) => ({ value: m.userId, label: memberLabel(m) })),
              ]}
            />
          </Field>

          {/* Priority — not applicable to Epics */}
          {type !== "EPIC" && (
            <Field label="Priority">
              <PriorityPicker value={priority} onChange={setPriority} />
            </Field>
          )}

          {/* Parent (epic) — only for non-Epic work types */}
          {type !== "EPIC" && (
            <Field
              label="Parent"
              hint="Your work type hierarchy determines the work items you can select here."
            >
              <ParentPicker epics={epics} value={epicId} onChange={setEpicId} />
            </Field>
          )}

          {/* Due date */}
          <Field label="Due date">
            <DateInput value={dueDate} onChange={setDueDate} />
          </Field>

          {/* Start date */}
          <Field label="Start date" hint="Allows the planned start date for a piece of work to be set.">
            <DateInput value={startDate} onChange={setStartDate} />
          </Field>

          {/* Sprint — Epics are not sprint-scoped, so hide for EPIC */}
          {type !== "EPIC" && (
            <Field label="Sprint" hint="QuikTrack sprint field">
              <BoardFilterSelect
                value={sprintId}
                onChange={setSprintId}
                placeholder="Select sprint"
                searchable
                options={[
                  { value: "", label: "Select sprint" },
                  // Completed sprints are closed — you can't plan new work into
                  // them (the backlog hides them too), so keep them out of the
                  // picker for a brand-new task.
                  ...sprints
                    .filter((s) => s.status !== "COMPLETED")
                    .map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            </Field>
          )}

          {/* Story point estimate — not meaningful at the Epic level */}
          {type !== "EPIC" && (
            <Field
              label="Story point estimate"
              hint="Measurement of complexity and/or size of a requirement."
            >
              <input
                type="number"
                min={0}
                max={1000}
                value={storyPoints}
                onChange={(e) => setStoryPoints(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </Field>
          )}

          {customFields.length > 0 && (
            <div className="pt-1 border-t border-gray-100">
              <CustomFieldsSection
                fields={customFields}
                values={customValues}
                onChange={(id, v) => setCustomValues((prev) => ({ ...prev, [id]: v }))}
                members={memberOptions}
                forceShowErrors={showCfErrors}
              />
            </div>
          )}

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}

          <p className="text-[11px] text-gray-500">
            Space:{" "}
            <span className="font-medium text-gray-700">
              {selectedProject ? `${selectedProject.name} (${selectedProject.projectKey})` : "—"}
            </span>
          </p>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-white">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={createAnother}
              onChange={(e) => setCreateAnother(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            Create another
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="h-9 px-5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:bg-gray-200 disabled:text-gray-500"
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  rightLabel,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  rightLabel?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {rightLabel}
      </div>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}

function SelectShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative border border-gray-300 rounded focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500">
      {children}
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
    </div>
  );
}

function SpacePicker({
  projects,
  value,
  onChange,
}: {
  projects: Project[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const selected = projects.find((p) => p.id === value) ?? null;
  const filtered = query
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.projectKey.toLowerCase().includes(query.toLowerCase()),
      )
    : projects;
  const recent = filtered.slice(0, 6);
  const all = filtered;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-between w-full h-9 px-3 text-sm border rounded bg-white ${
          open ? "border-blue-500 ring-2 ring-blue-500" : "border-gray-300"
        }`}
      >
        <span className="inline-flex items-center gap-2 truncate">
          {selected ? (
            <ProjectIcon p={selected} />
          ) : (
            <span className="h-5 w-5 rounded bg-gray-200" />
          )}
          <span className="truncate text-gray-800">
            {selected ? `${selected.name} (${selected.projectKey})` : "Choose a space"}
          </span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-500 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-80 overflow-y-auto">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search spaces"
              className="w-full h-8 px-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {recent.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-500 uppercase">
                Recent Spaces
              </div>
              {recent.map((p) => (
                <SpaceOption
                  key={`r-${p.id}`}
                  p={p}
                  active={p.id === value}
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                />
              ))}
            </>
          )}
          <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-500 uppercase">
            All Spaces
          </div>
          {all.map((p) => (
            <SpaceOption
              key={p.id}
              p={p}
              active={p.id === value}
              onClick={() => {
                onChange(p.id);
                setOpen(false);
              }}
            />
          ))}
          {all.length === 0 && (
            <div className="px-3 py-3 text-xs text-gray-500">No spaces found.</div>
          )}
        </div>
      )}
    </div>
  );
}

function SpaceOption({
  p,
  active,
  onClick,
}: {
  p: Project;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left ${
        active ? "bg-blue-50 text-blue-700" : "text-gray-800 hover:bg-gray-50"
      }`}
    >
      <ProjectIcon p={p} />
      <span className="truncate">
        {p.name} <span className="text-gray-500">({p.projectKey})</span>
      </span>
    </button>
  );
}

function ProjectIcon({ p }: { p: Project }) {
  return <SpaceIcon icon={p.icon} name={p.name} color={p.color} size={20} radius={6} />;
}

function WorkTypePicker({
  value,
  onChange,
}: {
  value: IssueType;
  onChange: (t: IssueType) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const Sel = TYPE_META[value];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-between w-full h-9 px-3 text-sm border rounded bg-white ${
          open ? "border-blue-500 ring-2 ring-blue-500" : "border-gray-300"
        }`}
      >
        <span className="inline-flex items-center gap-2">
          <Sel.Icon className={`h-4 w-4 ${Sel.color}`} />
          <span className="text-gray-800">{Sel.label}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1">
          {(Object.keys(TYPE_META) as IssueType[]).map((t) => {
            const M = TYPE_META[t];
            const active = t === value;
            return (
              <button
                key={t}
                type="button"
                onClick={() => {
                  onChange(t);
                  setOpen(false);
                }}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left ${
                  active ? "bg-blue-50 text-blue-700" : "text-gray-800 hover:bg-gray-50"
                }`}
              >
                <M.Icon className={`h-4 w-4 ${M.color}`} />
                {M.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PriorityPicker({
  value,
  onChange,
}: {
  value: Priority;
  onChange: (p: Priority) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const Sel = PRIORITY_META[value];
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-between w-full h-9 px-3 text-sm border rounded bg-white ${
          open ? "border-blue-500 ring-2 ring-blue-500" : "border-gray-300"
        }`}
      >
        <span className="inline-flex items-center gap-2">
          <Sel.Icon className={`h-4 w-4 ${Sel.color}`} />
          <span className="text-gray-800">{Sel.label}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1">
          {(Object.keys(PRIORITY_META) as Priority[]).map((p) => {
            const M = PRIORITY_META[p];
            const active = p === value;
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                }}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left ${
                  active ? "bg-blue-50 border-l-2 border-blue-600" : "hover:bg-gray-50"
                }`}
              >
                <M.Icon className={`h-4 w-4 ${M.color}`} />
                <span className="text-gray-800">{M.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ParentPicker({
  epics,
  value,
  onChange,
}: {
  epics: EpicOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Stable color tag per epic id (visual cue like Jira's coloured square).
  function tagColor(id: string) {
    const palette = ["#ef4444", "#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6"];
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }

  const selected = epics.find((e) => e.id === value) ?? null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-between w-full h-9 px-3 text-sm border rounded bg-white ${
          open ? "border-blue-500 ring-2 ring-blue-500" : "border-gray-300"
        }`}
      >
        <span className="inline-flex items-center gap-2 truncate">
          {selected ? (
            <>
              <span
                className="h-3 w-3 rounded-sm inline-block"
                style={{ background: tagColor(selected.id) }}
              />
              <Zap className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-gray-800 truncate">
                {selected.key} — {selected.title}
              </span>
            </>
          ) : (
            <span className="text-gray-400">Select parent</span>
          )}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-500 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-72 overflow-y-auto">
          <label className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            Show everything marked as done
          </label>
          {epics.length === 0 && (
            <div className="px-3 py-3 text-xs text-gray-500">
              No epics in this space yet.
            </div>
          )}
          {epics.map((e) => {
            const active = e.id === value;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  onChange(e.id);
                  setOpen(false);
                }}
                className={`flex items-start gap-2 w-full px-3 py-2 text-sm text-left ${
                  active ? "bg-blue-50 border-l-2 border-blue-600" : "hover:bg-gray-50"
                }`}
              >
                <span
                  className="h-3 w-3 mt-1 rounded-sm shrink-0"
                  style={{ background: tagColor(e.id) }}
                />
                <Zap className="h-3.5 w-3.5 mt-0.5 text-purple-500 shrink-0" />
                <span className="min-w-0">
                  <div className="text-[11px] text-gray-500">{e.key}</div>
                  <div className="text-gray-800 truncate">{e.title}</div>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusPicker({
  statuses,
  value,
  onChange,
}: {
  statuses: Status[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function pillCls(cat: Status["category"]) {
    if (cat === "DONE") return "qt-issue-status-pill qt-issue-status-pill--done bg-green-100 text-green-800";
    if (cat === "IN_PROGRESS") return "qt-issue-status-pill qt-issue-status-pill--progress bg-blue-100 text-blue-800";
    return "qt-issue-status-pill qt-issue-status-pill--todo bg-gray-200 text-gray-700"; // TODO + BACKLOG
  }

  const selected = statuses.find((s) => s.id === value) ?? null;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 h-7 px-2 text-xs font-semibold uppercase tracking-wide rounded ${
          selected ? pillCls(selected.category) : "qt-issue-status-pill qt-issue-status-pill--todo bg-gray-200 text-gray-700"
        }`}
      >
        <span>{selected?.name ?? "Status"}</span>
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 min-w-[200px] bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1">
          {statuses.map((s) => {
            const active = s.id === value;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onChange(s.id);
                  setOpen(false);
                }}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-left ${
                  active ? "bg-blue-50 border-l-2 border-blue-600" : "hover:bg-gray-50"
                }`}
              >
                <span
                  className={`inline-flex h-5 px-2 items-center text-[10px] font-semibold uppercase tracking-wide rounded ${pillCls(
                    s.category,
                  )}`}
                >
                  {s.name}
                </span>
                {active && <Check className="h-3.5 w-3.5 text-blue-600 ml-auto" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    />
  );
}
