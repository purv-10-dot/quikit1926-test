"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Plus, ChevronDown, ChevronRight, Zap, X, MoreHorizontal, GitBranch } from "lucide-react";
import type { EditorDraft, EditorRule, EditorTransition, StatusMeta } from "../editor-types";
import { metaFor, type BucketId } from "./rule-catalog";
import { ruleSummary } from "./rule-summary";
import { triggerLabel } from "@/lib/services/workflow/triggers";

function pillClass(category?: string): string {
  if (category === "IN_PROGRESS") return "bg-blue-100 text-blue-800";
  if (category === "DONE") return "bg-green-100 text-green-800";
  return "bg-gray-100 text-gray-700";
}
function Pill({ name, category }: { name: string; category?: string }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${pillClass(category)}`}>
      {name}
    </span>
  );
}
function useClickOutside(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);
  return ref;
}

/**
 * Right-hand Transition editor (Jira "Transition" panel):
 *  - Name (editable),
 *  - Path: From-statuses (chip multiselect) → To status (pill dropdown), editable,
 *  - Rules grouped into buckets (Restrict transition / Request input / Validate
 *    details / Perform actions), each a card with a + to add and per-rule cards
 *    that open the Edit Rule modal. Restrict transition has a MUST BE ALL/ANY
 *    condition-group control.
 */
export function TransitionPanel({
  transition,
  draft,
  statusMeta,
  onRename,
  onUpdatePath,
  onOpenAddRule,
  onOpenTriggers,
  onEditRule,
  onRemoveRule,
  onSetConditionsMode,
  conditionsMode,
  onDelete,
}: {
  transition: EditorTransition;
  draft: EditorDraft;
  statusMeta: Map<string, StatusMeta>;
  onRename: (name: string) => void;
  onUpdatePath: (patch: { fromStatusIds?: string[]; toStatusId?: string }) => void;
  onOpenAddRule: (bucket: BucketId) => void;
  onOpenTriggers: () => void;
  onEditRule: (index: number) => void;
  onRemoveRule: (index: number) => void;
  /** ALL = each condition its own group (AND); ANY = all in one group (OR). */
  onSetConditionsMode: (mode: "ALL" | "ANY") => void;
  conditionsMode: "ALL" | "ANY";
  onDelete: () => void;
}) {
  const nodes = draft.statuses;
  const nameOf = (id: string) => statusMeta.get(id)?.name ?? id;
  const catOf = (id: string) => statusMeta.get(id)?.category;
  const isInitial = transition.type === "INITIAL";
  const isGlobal = transition.type === "GLOBAL";

  // Group by UI bucket (a rule's bucket = its catalog `bucket`, else its kind).
  // This routes show_screen (a POSTFUNCTION) into the Request-input bucket.
  const bucketOf = (rule: EditorRule): BucketId => (metaFor(rule.type)?.bucket ?? rule.kind) as BucketId;
  const inBucket = (bucket: BucketId) =>
    transition.rules.map((rule, index) => ({ rule, index })).filter((r) => bucketOf(r.rule) === bucket);
  const conditions = inBucket("CONDITION");
  const requestInput = inBucket("REQUEST_INPUT");
  const validators = inBucket("VALIDATOR");
  const postFns = inBucket("POSTFUNCTION");

  const targetName = nameOf(transition.toStatusId);

  return (
    <aside className="flex min-h-0 w-[360px] shrink-0 flex-col self-stretch overflow-y-auto border-l border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-base font-semibold text-gray-900">Transition</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Transitions connect statuses as actions that move work through your flow.
        </p>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Name</label>
          <input
            value={transition.name}
            onChange={(e) => onRename(e.target.value)}
            disabled={isInitial}
            className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>

        {/* Path — editable From (chips) → To (pill dropdown). */}
        <div>
          <div className="mb-1 text-xs font-medium text-gray-700">Path</div>
          <label className="mb-1 block text-[11px] text-gray-500">From statuses</label>
          {isInitial || isGlobal ? (
            <div className="rounded border border-gray-200 bg-gray-50 px-2.5 py-2 text-sm text-gray-500">
              {isInitial ? "Create" : "Any status"}
            </div>
          ) : (
            <FromPicker
              nodes={nodes}
              value={transition.fromStatusIds}
              nameOf={nameOf}
              catOf={catOf}
              onChange={(fromStatusIds) => onUpdatePath({ fromStatusIds })}
            />
          )}
          <label className="mb-1 mt-2 block text-[11px] text-gray-500">To status</label>
          <ToPicker
            nodes={nodes}
            value={transition.toStatusId}
            nameOf={nameOf}
            catOf={catOf}
            onChange={(toStatusId) => onUpdatePath({ toStatusId })}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700">Rules</span>
          </div>
          <div className="space-y-3">
            {/* The Create (INITIAL) transition can't be restricted or gated for
                user input — everyone creates work items — so Jira offers only
                Validate details and Perform actions on it. */}
            {!isInitial && (
              <RuleBucket
                title="Restrict transition"
                subtitle="Hide this transition when these aren't met"
                count={conditions.length}
                onAdd={() => onOpenAddRule("CONDITION")}
                groupControl={
                  conditions.length > 0 ? (
                    <ConditionModeSelect mode={conditionsMode} onChange={onSetConditionsMode} />
                  ) : null
                }
              >
                {conditions.map(({ rule, index }) => (
                  <RuleCard key={index} rule={rule} onEdit={() => onEditRule(index)} onRemove={() => onRemoveRule(index)} />
                ))}
              </RuleBucket>
            )}

            {!isInitial && (
              <RuleBucket
                title="Request input"
                subtitle="Request input from the user"
                count={requestInput.length}
                onAdd={() => onOpenAddRule("REQUEST_INPUT")}
                addLabel="Add request input rule"
              >
                {requestInput.map(({ rule, index }) => (
                  <RuleCard key={index} rule={rule} onEdit={() => onEditRule(index)} onRemove={() => onRemoveRule(index)} />
                ))}
              </RuleBucket>
            )}

            <RuleBucket
              title="Validate details"
              subtitle="Validate details before moving the issue"
              count={validators.length}
              onAdd={() => onOpenAddRule("VALIDATOR")}
              addLabel="Add validate details rule"
            >
              {validators.map(({ rule, index }) => (
                <RuleCard key={index} rule={rule} onEdit={() => onEditRule(index)} onRemove={() => onRemoveRule(index)} />
              ))}
            </RuleBucket>

            <RuleBucket
              title="Perform actions"
              subtitle={`Perform actions and move issue to "${targetName}"`}
              count={postFns.length}
              onAdd={() => onOpenAddRule("POSTFUNCTION")}
              addLabel="Add perform actions rule"
            >
              {postFns.map(({ rule, index }) => (
                <RuleCard key={index} rule={rule} onEdit={() => onEditRule(index)} onRemove={() => onRemoveRule(index)} />
              ))}
            </RuleBucket>
          </div>
        </div>

        {/* The Create transition fires once, on issue creation — it has no
            GitHub dev triggers. Jira shows a read-only EVENT (Issue Created)
            instead of the Triggers control there. */}
        {isInitial ? (
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-gray-800">Event</span>
            </div>
            <div className="mt-2 flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-2.5 py-2 text-sm text-gray-600">
              <Zap className="h-3.5 w-3.5 text-gray-400" fill="currentColor" /> Issue Created
            </div>
          </div>
        ) : (
          /* Triggers — GitHub dev events that auto-fire this transition. */
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-gray-800">Triggers</span>
                {transition.triggers.length > 0 && (
                  <span className="rounded bg-blue-50 px-1.5 text-[11px] font-medium text-blue-700">{transition.triggers.length}</span>
                )}
              </div>
              <button type="button" onClick={onOpenTriggers} className="text-gray-400 hover:text-gray-700" aria-label="Add triggers">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {transition.triggers.length > 0 && (
              <div className="mt-2 space-y-1">
                {transition.triggers.map((event) => (
                  <div key={event} className="flex items-center gap-2 rounded border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700">
                    <GitBranch className="h-3.5 w-3.5 text-gray-400" />
                    {triggerLabel(event)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {!isInitial && (
        <div className="mt-auto border-t border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      )}
    </aside>
  );
}

/** MUST BE ALL / ANY selector for the Restrict-transition conditions. */
function ConditionModeSelect({ mode, onChange }: { mode: "ALL" | "ANY"; onChange: (m: "ALL" | "ANY") => void }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded border border-accent-300 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-700"
      >
        {mode === "ALL" ? "Must be all" : "Can be any"} <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
          <button type="button" onClick={() => { onChange("ALL"); setOpen(false); }} className="block w-full px-3 py-1.5 text-left hover:bg-gray-50">
            Must be <span className="font-semibold">all</span> of the following
          </button>
          <button type="button" onClick={() => { onChange("ANY"); setOpen(false); }} className="block w-full px-3 py-1.5 text-left hover:bg-gray-50">
            Can be <span className="font-semibold">any</span> of the following
          </button>
        </div>
      )}
    </div>
  );
}

function RuleBucket({
  title,
  subtitle,
  count,
  onAdd,
  addLabel,
  groupControl,
  children,
}: {
  title: string;
  subtitle: string;
  count: number;
  onAdd: () => void;
  addLabel?: string;
  groupControl?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="rounded-md border border-gray-200">
      <div className="flex items-start gap-1.5 px-3 py-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-0.5 text-gray-500 hover:text-gray-700">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-gray-800">{title}</span>
            {count > 0 && <span className="rounded bg-blue-50 px-1.5 text-[11px] font-medium text-blue-700">{count}</span>}
          </div>
          <p className="text-[11px] text-gray-500">{subtitle}</p>
        </div>
        <button type="button" onClick={onAdd} className="text-gray-400 hover:text-gray-700" aria-label={`Add ${title}`}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          {groupControl}
          {children}
          {!hasChildren && addLabel && (
            <button
              type="button"
              onClick={onAdd}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {addLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RuleCard({ rule, onEdit, onRemove }: { rule: EditorRule; onEdit: () => void; onRemove: () => void }) {
  const meta = metaFor(rule.type);
  const summary = ruleSummary(rule);
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useClickOutside(menuOpen, () => setMenuOpen(false));
  return (
    <div className="rounded-md border border-gray-200 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-gray-100 text-gray-500">
          <Zap className="h-3 w-3" fill="currentColor" />
        </span>
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-gray-800 hover:underline">
          {meta?.label ?? rule.type}
        </button>
        <div className="relative" ref={ref}>
          <button type="button" onClick={() => setMenuOpen((v) => !v)} className="text-gray-400 hover:text-gray-700">
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-28 rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
              <button type="button" onClick={() => { setMenuOpen(false); onEdit(); }} className="block w-full px-3 py-1.5 text-left hover:bg-gray-50">Edit</button>
              <button type="button" onClick={() => { setMenuOpen(false); onRemove(); }} className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-red-600 hover:bg-red-50">
                <X className="h-3 w-3" /> Remove
              </button>
            </div>
          )}
        </div>
      </div>
      {(summary || meta) && <p className="mt-1 pl-7 text-[11px] text-gray-500">{summary || meta?.description}</p>}
    </div>
  );
}

/** From-statuses chip multiselect (project nodes in this workflow). */
function FromPicker({
  nodes,
  value,
  nameOf,
  catOf,
  onChange,
}: {
  nodes: EditorDraft["statuses"];
  value: string[];
  nameOf: (id: string) => string;
  catOf: (id: string) => string | undefined;
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[36px] w-full items-center gap-1 rounded border border-gray-300 px-2 py-1.5 text-left"
      >
        <span className="flex flex-1 flex-wrap gap-1">
          {value.length === 0 ? (
            <span className="text-sm text-gray-400">Select statuses</span>
          ) : (
            value.map((id) => (
              <span key={id} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${pillClass(catOf(id))}`}>
                {nameOf(id)}
                <X className="h-3 w-3 cursor-pointer opacity-60 hover:opacity-100" onClick={(e) => { e.stopPropagation(); toggle(id); }} />
              </span>
            ))
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {nodes.map((s) => (
            <label key={s.statusId} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
              <input type="checkbox" checked={value.includes(s.statusId)} onChange={() => toggle(s.statusId)} />
              <Pill name={nameOf(s.statusId)} category={catOf(s.statusId)} />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** To-status single-select pill dropdown. */
function ToPicker({
  nodes,
  value,
  nameOf,
  catOf,
  onChange,
}: {
  nodes: EditorDraft["statuses"];
  value: string;
  nameOf: (id: string) => string;
  catOf: (id: string) => string | undefined;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[36px] w-full items-center rounded border border-gray-300 px-2 py-1.5 text-left"
      >
        {value ? <Pill name={nameOf(value)} category={catOf(value)} /> : <span className="text-sm text-gray-400">Select a status</span>}
        <ChevronDown className="ml-auto h-4 w-4 text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {nodes.map((s) => (
            <button
              key={s.statusId}
              type="button"
              onClick={() => { onChange(s.statusId); setOpen(false); }}
              className={`flex w-full items-center px-3 py-1.5 text-left hover:bg-gray-50 ${s.statusId === value ? "bg-blue-50/60" : ""}`}
            >
              <Pill name={nameOf(s.statusId)} category={catOf(s.statusId)} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
