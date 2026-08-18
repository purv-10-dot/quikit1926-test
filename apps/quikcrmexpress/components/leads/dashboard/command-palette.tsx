"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Modal } from "@/components/ui/modal";
import { commandGroupLabel as leadCommandGroupLabel } from "@/lib/leads/build-lead-command-actions";
import { accountCommandGroupLabel } from "@/lib/accounts/build-account-command-actions";
import { contactCommandGroupLabel } from "@/lib/contacts/build-contact-command-actions";
import {
  reportCommandGroupLabel,
  type ReportCommandGroupId,
} from "@/lib/reports/build-reports-command-actions";

export interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  group?: string;
  /** Extra terms for search (e.g. "convert" finds "Convert lead"). */
  keywords?: string[];
  run: () => void;
}

export function matchesQuery(action: CommandAction, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if (action.label.toLowerCase().includes(needle)) return true;
  return (action.keywords ?? []).some((k) => k.toLowerCase().includes(needle));
}

/** Clamp keyboard selection when the filtered list length changes. */
export function clampCommandIndex(current: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(current, length - 1));
}

export function stepCommandIndex(
  current: number,
  direction: "up" | "down",
  length: number,
): number {
  if (length <= 0) return 0;
  if (direction === "down") return Math.min(current + 1, length - 1);
  return Math.max(current - 1, 0);
}

const GROUP_ORDER = [
  "navigation",
  "reports",
  "filters",
  "export",
  "communication",
  "lead",
  "account",
  "contact",
  "ai",
  "workspace",
] as const;

function labelForCommandGroup(group: string): string {
  if (
    group === "navigation" ||
    group === "reports" ||
    group === "filters" ||
    group === "export"
  ) {
    return reportCommandGroupLabel(group as ReportCommandGroupId);
  }
  if (group === "account") return accountCommandGroupLabel("account");
  if (group === "contact") return contactCommandGroupLabel("contact");
  if (group === "communication" || group === "lead" || group === "ai" || group === "workspace") {
    return leadCommandGroupLabel(group);
  }
  return group;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Shown in the modal header when `title` is omitted. */
  leadName?: string;
  /** Full modal title; overrides `Command · {leadName}`. */
  title?: string;
  actions: CommandAction[];
}

export function LeadCommandPalette({ open, onClose, leadName, title, actions }: Props) {
  const modalTitle = title ?? (leadName ? `Command · ${leadName}` : "Command");
  const [q, setQ] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) {
      setQ("");
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(
    () => actions.filter((a) => matchesQuery(a, q)),
    [actions, q],
  );

  const flatItems = useMemo(() => {
    if (q.trim()) {
      return filtered.map((action) => ({ type: "action" as const, action }));
    }
    const out: Array<
      | { type: "header"; group: string }
      | { type: "action"; action: CommandAction }
    > = [];
    const used = new Set<string>();
    for (const group of GROUP_ORDER) {
      const inGroup = filtered.filter((a) => a.group === group);
      if (inGroup.length === 0) continue;
      used.add(group);
      out.push({ type: "header", group });
      for (const action of inGroup) out.push({ type: "action", action });
    }
    const ungrouped = filtered.filter((a) => !a.group);
    for (const action of ungrouped) out.push({ type: "action", action });
    return out;
  }, [filtered, q]);

  const selectableActions = useMemo(
    () => flatItems.filter((i) => i.type === "action").map((i) => i.action),
    [flatItems],
  );

  useEffect(() => {
    setSelectedIndex((i) => clampCommandIndex(i, selectableActions.length));
  }, [selectableActions]);

  useEffect(() => {
    if (!open || selectableActions.length === 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-cmd-index="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, selectableActions.length, open]);

  function handleListKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (selectableActions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => stepCommandIndex(i, "down", selectableActions.length));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => stepCommandIndex(i, "up", selectableActions.length));
        break;
      case "Enter":
        if (e.nativeEvent.isComposing) return;
        e.preventDefault();
        selectableActions[clampCommandIndex(selectedIndex, selectableActions.length)]?.run();
        break;
      default:
        break;
    }
  }

  let actionIndex = -1;

  return (
    <Modal open={open} onClose={onClose} title={modalTitle}>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={handleListKeyDown}
        placeholder="Search actions…"
        className="mb-3 w-full rounded-lg border border-crm-border px-3 py-2 text-sm"
        autoFocus
        role="combobox"
        aria-expanded={open}
        aria-controls="lead-command-listbox"
        aria-activedescendant={
          selectableActions.length > 0
            ? `lead-command-option-${selectedIndex}`
            : undefined
        }
        autoComplete="off"
      />
      <ul
        id="lead-command-listbox"
        ref={listRef}
        role="listbox"
        className="max-h-80 overflow-y-auto"
      >
        {selectableActions.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-crm-muted" role="presentation">
            No actions match &ldquo;{q}&rdquo;
          </li>
        ) : (
          flatItems.map((item) => {
            if (item.type === "header") {
              return (
                <li
                  key={`hdr-${item.group}`}
                  role="presentation"
                  className="sticky top-0 z-10 bg-white/95 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-crm-muted backdrop-blur dark:bg-slate-900/95"
                >
                  {labelForCommandGroup(item.group)}
                </li>
              );
            }
            actionIndex += 1;
            const index = actionIndex;
            const selected = index === selectedIndex;
            const a = item.action;
            return (
              <li key={a.id} role="presentation">
                <button
                  id={`lead-command-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-cmd-index={index}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={a.run}
                  className={
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm " +
                    (selected
                      ? "bg-accent-50 text-crm-text ring-1 ring-accent-200"
                      : "text-crm-text hover:bg-crm-panel")
                  }
                >
                  <span className="font-medium">{a.label}</span>
                  {a.hint ? <span className="text-xs text-crm-muted">{a.hint}</span> : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
      <p className="mt-3 text-xs text-crm-muted">
        ↑↓ navigate · Enter run · Esc close · Ctrl+K toggle
      </p>
    </Modal>
  );
}

export { useCommandPaletteShortcut } from "@/components/leads/dashboard/command-palette-shortcut";
