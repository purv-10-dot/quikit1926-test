"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, Lock, ListChecks, ArrowRight, Zap, FolderInput, ChevronDown } from "lucide-react";
import type { EditorRule, RuleKind } from "../editor-types";
import {
  RULE_BUCKETS,
  RULE_TYPE_META,
  metaFor,
  type RuleTypeMeta,
  type BucketId,
} from "./rule-catalog";
import {
  RestrictWhoMovesForm,
  SubtaskStatusForm,
  RestrictFromAllForm,
  RestrictFieldValueForm,
  BeenThroughStatusForm,
  PreviousUpdaterForm,
  ValidateFieldForm,
  ValidateBeenThroughForm,
  ValidateParentStatusForm,
  ValidatePermissionForm,
  ShowScreenForm,
  AssignForm,
  CopyFieldForm,
  UpdateFieldForm,
  isRestrictWhoMovesValid,
  isRestrictFromAllValid,
  isRestrictFieldValueValid,
  isBeenThroughStatusValid,
  isPreviousUpdaterValid,
  isValidateFieldValid,
  isValidateBeenThroughValid,
  isValidateParentValid,
  isValidatePermissionValid,
  isShowScreenValid,
  isAssignValid,
  isCopyFieldValid,
  isUpdateFieldValid,
} from "./rule-forms";

function BucketIcon({ kind }: { kind: BucketId }) {
  if (kind === "CONDITION") return <Lock className="h-4 w-4" />;
  if (kind === "REQUEST_INPUT") return <FolderInput className="h-4 w-4" />;
  if (kind === "VALIDATOR") return <ListChecks className="h-4 w-4" />;
  return <Zap className="h-4 w-4" />;
}

function ModalShell({
  title,
  onClose,
  wide,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`flex max-h-[85vh] w-full ${wide ? "max-w-3xl" : "max-w-2xl"} flex-col rounded-lg bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-3">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * "Add rule" — Jira catalog modal. Left rail of buckets (Restrict transition /
 * Validate details / Perform actions), a searchable list of rule types on the
 * right; Select opens the Edit-rule config for the chosen type.
 */
export function AddRuleDialog({
  onPick,
  onClose,
  initialBucket = "CONDITION",
}: {
  onPick: (meta: RuleTypeMeta) => void;
  onClose: () => void;
  /** Rail bucket to open on (the + button's bucket). Defaults to Restrict. */
  initialBucket?: BucketId;
}) {
  const [bucket, setBucket] = useState<BucketId>(initialBucket);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const list = useMemo(
    () =>
      RULE_TYPE_META.filter((m) => (m.bucket ?? m.kind) === bucket).filter(
        (m) => !q || m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q),
      ),
    [bucket, q],
  );
  const activeBucket = RULE_BUCKETS.find((b) => b.id === bucket);

  return (
    <ModalShell
      title="Add rule"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="text-sm font-medium text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => {
              const m = selected ? metaFor(selected) : undefined;
              if (m) onPick(m);
            }}
            className="rounded bg-accent-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            Select
          </button>
        </>
      }
    >
      <div className="flex min-h-[24rem]">
        {/* Rule-type rail */}
        <div className="w-56 shrink-0 border-r border-gray-200 px-3 py-4">
          <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Rule types</div>
          {RULE_BUCKETS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => { setBucket(b.id); setSelected(null); }}
              className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm ${
                b.id === bucket ? "border-l-2 border-accent-500 bg-accent-50 font-medium text-accent-800" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <BucketIcon kind={b.id} /> {b.label}
            </button>
          ))}
        </div>

        {/* Search + list */}
        <div className="flex min-w-0 flex-1 flex-col px-6 py-4">
          <div className="mb-2 flex items-center gap-2 rounded border border-gray-300 px-2.5 py-2 focus-within:border-accent-500">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rules"
              className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
            />
          </div>
          {activeBucket && <p className="mb-3 text-xs text-gray-500">{activeBucket.blurb}</p>}
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {list.map((m) => (
              <button
                key={m.type}
                type="button"
                onClick={() => setSelected(m.type)}
                className={`flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left ${
                  m.type === selected ? "bg-accent-50 ring-1 ring-accent-300" : "hover:bg-gray-50"
                }`}
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-gray-100 text-gray-500">
                  <BucketIcon kind={m.bucket ?? m.kind} />
                </span>
                <span>
                  <span className="block text-sm font-medium text-gray-900">{m.label}</span>
                  <span className="block text-xs text-gray-500">{m.description}</span>
                </span>
              </button>
            ))}
            {list.length === 0 && <p className="px-3 py-4 text-sm text-gray-400">No matching rules.</p>}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

/**
 * "Edit Rule" — configure a rule's fields (used for both add-after-Select and
 * editing an existing rule). Header shows the rule + the transition path.
 */
export interface RuleTransitionOption {
  id: string;
  name: string;
  fromNames: string[];
  toName: string;
}

export function EditRuleDialog({
  meta,
  initialConfig,
  transitions,
  initialTransitionId,
  resolutions,
  statuses,
  members,
  screens,
  onSubmit,
  onDelete,
  onClose,
}: {
  meta: RuleTypeMeta;
  initialConfig?: Record<string, unknown>;
  /** All transitions in the workflow — the Transition field is a dropdown. */
  transitions: RuleTransitionOption[];
  /** The transition the rule was opened from (preselected). */
  initialTransitionId: string;
  resolutions: { id: string; name: string }[];
  /** Project statuses (for status-based rule config, e.g. subtask status). */
  statuses: { id: string; name: string; category: string }[];
  /** Project members (for the field-value rule's Assignee/Reporter dropdowns). */
  members: { userId: string; name: string }[];
  /** Org screens (for the "Show a screen" request-input rule). */
  screens: { id: string; name: string }[];
  /** Submit the rule onto the chosen target transition. */
  onSubmit: (rule: EditorRule, targetTransitionId: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [targetTransitionId, setTargetTransitionId] = useState(initialTransitionId);
  const [config, setConfig] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of meta.fields) {
      const v = initialConfig?.[f.key];
      init[f.key] = v == null ? "" : String(v);
    }
    return init;
  });
  // Custom-form rules carry a structured config object (arrays/objects), not the
  // flat string map above.
  const [structured, setStructured] = useState<Record<string, unknown>>(() => ({ ...(initialConfig ?? {}) }));

  // Each custom form validates its own structured config; generic (fields-based)
  // rules fall back to the required-field check.
  const CUSTOM_VALID: Record<string, (c: Record<string, unknown>) => boolean> = {
    restrict_who_moves: isRestrictWhoMovesValid,
    restrict_from_all: isRestrictFromAllValid,
    restrict_field_value: isRestrictFieldValueValid,
    restrict_been_through_status: isBeenThroughStatusValid,
    restrict_previous_updater: isPreviousUpdaterValid,
    restrict_subtask_status: (c) => Array.isArray(c.statusIds) && (c.statusIds as unknown[]).length > 0,
    validate_field: isValidateFieldValid,
    validate_been_through: isValidateBeenThroughValid,
    validate_parent_status: isValidateParentValid,
    validate_permission: isValidatePermissionValid,
    show_screen: isShowScreenValid,
    assign: isAssignValid,
    copy_field: isCopyFieldValid,
    update_field: isUpdateFieldValid,
  };
  const valid = meta.customForm
    ? (CUSTOM_VALID[meta.customForm]?.(structured) ?? true)
    : meta.fields.every((f) => !f.required || (config[f.key] ?? "").trim().length > 0);

  const submit = () => {
    if (meta.customForm) {
      onSubmit({ kind: meta.kind, type: meta.type, config: structured }, targetTransitionId);
      onClose();
      return;
    }
    const cleaned: Record<string, unknown> = {};
    for (const f of meta.fields) cleaned[f.key] = (config[f.key] ?? "").trim();
    onSubmit({ kind: meta.kind, type: meta.type, config: cleaned }, targetTransitionId);
    onClose();
  };

  return (
    <ModalShell
      title="Edit Rule"
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button
              type="button"
              onClick={() => { onDelete(); onClose(); }}
              className="mr-auto text-sm font-medium text-red-600 hover:text-red-700"
            >
              Delete
            </button>
          )}
          <button type="button" onClick={onClose} className="text-sm font-medium text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid}
            className="rounded bg-accent-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            Update
          </button>
        </>
      }
    >
      <div className="space-y-4 px-6 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="mb-1 text-xs font-medium text-gray-700">Rule</div>
            <div className="flex items-center gap-2 rounded border border-gray-200 px-3 py-2 text-sm text-gray-800">
              <Zap className="h-3.5 w-3.5 text-gray-500" fill="currentColor" /> {meta.label}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-gray-700">Transition</div>
            <TransitionPicker
              transitions={transitions}
              value={targetTransitionId}
              onChange={setTargetTransitionId}
            />
          </div>
        </div>

        {meta.customForm === "restrict_who_moves" ? (
          <RestrictWhoMovesForm value={structured} onChange={setStructured} />
        ) : meta.customForm === "restrict_from_all" ? (
          <RestrictFromAllForm value={structured} onChange={setStructured} />
        ) : meta.customForm === "restrict_field_value" ? (
          <RestrictFieldValueForm
            value={structured}
            onChange={setStructured}
            options={{ members, statuses: statuses.map((s) => ({ id: s.id, name: s.name })), resolutions }}
          />
        ) : meta.customForm === "restrict_been_through_status" ? (
          <BeenThroughStatusForm value={structured} onChange={setStructured} statuses={statuses} />
        ) : meta.customForm === "restrict_previous_updater" ? (
          <PreviousUpdaterForm value={structured} onChange={setStructured} statuses={statuses} />
        ) : meta.customForm === "restrict_subtask_status" ? (
          <SubtaskStatusForm value={structured} onChange={setStructured} statuses={statuses} />
        ) : meta.customForm === "validate_field" ? (
          <ValidateFieldForm value={structured} onChange={setStructured} />
        ) : meta.customForm === "validate_been_through" ? (
          <ValidateBeenThroughForm value={structured} onChange={setStructured} statuses={statuses} />
        ) : meta.customForm === "validate_parent_status" ? (
          <ValidateParentStatusForm value={structured} onChange={setStructured} statuses={statuses} />
        ) : meta.customForm === "validate_permission" ? (
          <ValidatePermissionForm value={structured} onChange={setStructured} />
        ) : meta.customForm === "show_screen" ? (
          <ShowScreenForm value={structured} onChange={setStructured} screens={screens} />
        ) : meta.customForm === "assign" ? (
          <AssignForm value={structured} onChange={setStructured} members={members} />
        ) : meta.customForm === "copy_field" ? (
          <CopyFieldForm value={structured} onChange={setStructured} />
        ) : meta.customForm === "update_field" ? (
          <UpdateFieldForm value={structured} onChange={setStructured} />
        ) : meta.fields.length === 0 ? (
          <p className="text-sm text-gray-500">{meta.description}</p>
        ) : (
          <div className="space-y-3">
            {meta.fields.map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  {f.label}{f.required && <span className="text-red-500"> *</span>}
                </label>
                {f.type === "resolution" ? (
                  <select
                    value={config[f.key] ?? ""}
                    onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
                  >
                    <option value="">Select…</option>
                    {resolutions.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                ) : f.type === "assignee" ? (
                  <select
                    value={config[f.key] ?? ""}
                    onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
                  >
                    <option value="">Select…</option>
                    <option value="actor">The user making the move</option>
                  </select>
                ) : (
                  <input
                    value={config[f.key] ?? ""}
                    onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

/**
 * Transition field for the Edit-rule modal — a dropdown of ALL workflow
 * transitions (each shown as name + from→to pills), preselected to the one the
 * rule was opened from. Choosing a different one moves the rule there on submit.
 */
function TransitionPicker({
  transitions,
  value,
  onChange,
}: {
  transitions: RuleTransitionOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const measure = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom + 4, width: r.width });
  };

  useEffect(() => {
    if (!open) return;
    measure();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const reposition = () => measure();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  const current = transitions.find((t) => t.id === value);
  const Row = ({ t }: { t: RuleTransitionOption }) => (
    <span className="flex flex-wrap items-center gap-1 text-xs text-gray-700">
      <span className="font-medium">{t.name}</span>
      {t.fromNames.map((n) => (
        <span key={n} className="rounded bg-gray-100 px-1.5 py-0.5">{n}</span>
      ))}
      <ArrowRight className="h-3 w-3 text-gray-400" />
      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-800">{t.toName}</span>
    </span>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[38px] w-full items-center gap-2 rounded border border-gray-300 px-3 py-2 text-left focus:border-accent-500 focus:outline-none"
      >
        <span className="min-w-0 flex-1">
          {current ? <Row t={current} /> : <span className="text-sm text-gray-400">Select a transition</span>}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>
      {open && rect &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", left: rect.left, top: rect.top, width: rect.width, zIndex: 60 }}
            className="max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          >
            {transitions.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { onChange(t.id); setOpen(false); }}
                className={`block w-full px-3 py-1.5 text-left hover:bg-gray-50 ${t.id === value ? "bg-blue-50/60" : ""}`}
              >
                <Row t={t} />
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
