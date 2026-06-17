"use client";

import { useEffect, useRef, useState } from "react";
import {
  Columns,
  EyeOff,
  MoreVertical,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const FALLBACK_STAGES = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Closed"];

export interface LeadsToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  stage: string;
  onStageChange: (v: string) => void;
  /** Stage options from workspace config; falls back to defaults if not loaded yet. */
  stageOptions?: string[];
  ownerId: string;
  ownerOptions: { value: string; label: string }[];
  onOwnerChange: (v: string) => void;
  mineOnly: boolean;
  onMineOnlyChange: (v: boolean) => void;
  onOpenAdvanced: () => void;
  onOpenColumnPicker?: () => void;
  onOpenHiddenColumns?: () => void;
  hiddenCount?: number;
  /** Right-aligned primary action — renders an "+ Add lead" button when provided. */
  onAddLead?: () => void;
  /** Secondary action right of the filters — renders a "Trash" button. */
  onOpenTrash?: () => void;
  /** Compact mode (e.g., trash view) — hides everything except the search box. */
  compact?: boolean;
}

export function LeadsToolbar({
  search,
  onSearchChange,
  stage,
  onStageChange,
  stageOptions,
  ownerId,
  ownerOptions,
  onOwnerChange,
  mineOnly,
  onMineOnlyChange,
  onOpenAdvanced,
  onOpenColumnPicker,
  onOpenHiddenColumns,
  hiddenCount = 0,
  onAddLead,
  onOpenTrash,
  compact = false,
}: LeadsToolbarProps) {
  // h-9 keeps every toolbar control aligned with the inputs/selects (which
  // also resolve to 36px). Otherwise wrap rows look ragged at the bottom edge.
  const btnBase =
    "inline-flex h-9 items-center gap-1.5 rounded-lg border border-crm-border bg-white px-2.5 text-sm text-crm-text shadow-sm transition hover:bg-crm-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow lg:px-3";

  // Overflow menu — collects Hidden / Columns / Trash so the toolbar fits on
  // a single line. Kebab button sits next to the owner select.
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!overflowOpen) return;
    const onClick = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && setOverflowOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [overflowOpen]);

  const overflowItemClass =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-crm-text hover:bg-crm-panel disabled:cursor-not-allowed disabled:opacity-50";
  const hasOverflow =
    !!onOpenColumnPicker ||
    (!!onOpenHiddenColumns && hiddenCount > 0) ||
    !!onOpenTrash;

  if (compact) {
    return (
      <div className="mb-2 flex flex-wrap items-center gap-2 lg:mb-3">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-crm-muted"
          />
          <Input
            placeholder="Search trashed leads…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-72 pl-8"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 lg:mb-3 lg:flex-nowrap">
      {/* Search — flexes to fill the leftover row width so all controls fit
       * on a single line at lg+. Min/max widths keep it readable. */}
      <div className="relative min-w-[160px] flex-1 lg:max-w-[260px]">
        <Search
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-crm-muted"
        />
        <Input
          placeholder="Search name, email, company…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-8"
        />
      </div>

      <button onClick={onOpenAdvanced} className={btnBase}>
        <SlidersHorizontal size={14} />
        <span className="hidden xl:inline">Advanced</span>
        <span className="xl:hidden">Adv</span>
      </button>

      <Select
        value={stage}
        onChange={(e) => onStageChange(e.target.value)}
        className="w-28"
      >
        <option value="">Any stage</option>
        {(stageOptions && stageOptions.length > 0 ? stageOptions : FALLBACK_STAGES).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>

      <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-crm-border bg-white px-2.5 text-sm text-crm-text shadow-sm transition hover:bg-crm-panel">
        <input
          type="checkbox"
          checked={mineOnly}
          onChange={(e) => onMineOnlyChange(e.target.checked)}
          className="h-3.5 w-3.5 accent-crm-blue"
        />
        <span className="hidden xl:inline">Mine only</span>
        <span className="xl:hidden">Mine</span>
      </label>

      <Select
        value={ownerId}
        onChange={(e) => onOwnerChange(e.target.value)}
        className="w-32"
      >
        <option value="">Any owner</option>
        {ownerOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>

      {/* Kebab — collects the secondary actions (Hidden, Columns, Trash) so
       * the row stays on one line. Sits immediately after the owner select. */}
      {hasOverflow && (
        <div className="relative" ref={overflowRef}>
          <button
            type="button"
            onClick={() => setOverflowOpen((o) => !o)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-crm-border bg-white text-crm-muted shadow-sm transition hover:bg-crm-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow"
            title="More actions"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={overflowOpen}
          >
            <MoreVertical size={16} />
          </button>
          {overflowOpen && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-lg border border-crm-border bg-white py-1 shadow-crm-dropdown"
            >
              {onOpenHiddenColumns && hiddenCount > 0 && (
                <button
                  type="button"
                  role="menuitem"
                  className={overflowItemClass}
                  onClick={() => {
                    setOverflowOpen(false);
                    onOpenHiddenColumns();
                  }}
                >
                  <EyeOff size={16} className="text-crm-muted" />
                  Hidden ({hiddenCount})
                </button>
              )}
              {onOpenColumnPicker && (
                <button
                  type="button"
                  role="menuitem"
                  className={overflowItemClass}
                  onClick={() => {
                    setOverflowOpen(false);
                    onOpenColumnPicker();
                  }}
                >
                  <Columns size={16} className="text-crm-muted" />
                  Column picker
                </button>
              )}
              {onOpenTrash && (
                <button
                  type="button"
                  role="menuitem"
                  className={overflowItemClass}
                  onClick={() => {
                    setOverflowOpen(false);
                    onOpenTrash();
                  }}
                >
                  <Trash2 size={16} className="text-crm-muted" />
                  Trash
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Primary action sits at the right edge */}
      {onAddLead && (
        <Button size="sm" className="ml-auto" onClick={onAddLead}>
          <Plus size={14} /> Add lead
        </Button>
      )}
    </div>
  );
}
