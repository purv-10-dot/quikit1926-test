"use client";

import { Info, Trash2 } from "lucide-react";
import { PanelSection } from "./panel-section";
import { RuleList } from "./rule-form";
import type { EditorRule, EditorTransition, StatusMeta } from "../editor-types";

/**
 * Right-hand Transition editor (matches Jira's "Transition" panel):
 *  - Name (editable), Path (source → target),
 *  - Rules: Restrict (conditions) / Request input (inert) / Validate (validators)
 *    / Perform actions (post-functions),
 *  - Triggers (inert), Properties (inert), EVENT (inert), Delete.
 *
 * Restrict/Validate/Perform are wired to the real rule engine; the inert
 * sections are shown to match the UI and marked "coming soon".
 */
export function TransitionPanel({
  transition,
  statusMeta,
  resolutions,
  onRename,
  onAddRule,
  onRemoveRule,
  onDelete,
}: {
  transition: EditorTransition;
  statusMeta: Map<string, StatusMeta>;
  resolutions: { id: string; name: string }[];
  onRename: (name: string) => void;
  onAddRule: (rule: EditorRule) => void;
  onRemoveRule: (index: number) => void;
  onDelete: () => void;
}) {
  const byKind = (kind: EditorRule["kind"]) =>
    transition.rules
      .map((rule, index) => ({ rule, index }))
      .filter((r) => r.rule.kind === kind);

  const conditions = byKind("CONDITION");
  const validators = byKind("VALIDATOR");
  const postFns = byKind("POSTFUNCTION");

  const targetName = statusMeta.get(transition.toStatusId)?.name ?? transition.toStatusId;
  const pathFrom =
    transition.type === "GLOBAL"
      ? "Any status"
      : transition.type === "INITIAL"
        ? "Create"
        : transition.fromStatusIds
            .map((id) => statusMeta.get(id)?.name ?? id)
            .join(", ") || "—";

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-white">
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
            disabled={transition.type === "INITIAL"}
            className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-gray-700">Path</div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">{pathFrom}</span>
            <span className="text-gray-400">→</span>
            <span className="rounded bg-accent-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent-700">
              {targetName}
            </span>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium text-gray-700">Rules</div>
          <div className="space-y-2">
            <PanelSection
              title="Restrict transition"
              subtitle="Hide this transition when these aren't met"
              count={conditions.length}
            >
              <RuleList
                kind="CONDITION"
                rules={conditions}
                resolutions={resolutions}
                onAdd={onAddRule}
                onRemove={onRemoveRule}
              />
            </PanelSection>

            <PanelSection
              title="Request input"
              subtitle="Request input from the user"
              badge="soon"
              disabled
            />

            <PanelSection
              title="Validate details"
              subtitle="Validate details before moving the issue"
              count={validators.length}
            >
              <RuleList
                kind="VALIDATOR"
                rules={validators}
                resolutions={resolutions}
                onAdd={onAddRule}
                onRemove={onRemoveRule}
              />
            </PanelSection>

            <PanelSection
              title="Perform actions"
              subtitle={`Perform actions and move issue to "${targetName}"`}
              count={postFns.length}
            >
              <RuleList
                kind="POSTFUNCTION"
                rules={postFns}
                resolutions={resolutions}
                onAdd={onAddRule}
                onRemove={onRemoveRule}
              />
            </PanelSection>
          </div>
        </div>

        <PanelSection title="Triggers" subtitle="Trigger this transition from dev tools" badge="soon" disabled />
        <PanelSection title="Properties" badge="soon" disabled />

        <div>
          <div className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-700">
            EVENT <Info className="h-3 w-3 text-gray-400" />
          </div>
          <select
            disabled
            className="w-full rounded border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-500"
            title="Events are not wired yet"
          >
            <option>Generic Event</option>
          </select>
          <p className="mt-1 text-[11px] text-gray-400">Events aren&apos;t wired to notifications yet.</p>
        </div>
      </div>

      {transition.type !== "INITIAL" && (
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
