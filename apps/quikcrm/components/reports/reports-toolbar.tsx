"use client";

/**
 * Top-of-page toolbar for /reports — date-range chips + agent dropdown.
 *
 * Owns the URL state (`?from=&to=&ownerId=`) so refreshes preserve the
 * user's filter. The chip presets translate into ISO from/to instants.
 * "Custom" reveals two date-input fields.
 *
 * The active chip highlight is derived from the URL `from`/`to` instead
 * of local state, so that direct deep-links and browser-back keep the
 * UI in sync with what's actually applied.
 */
import { useEffect, useMemo, useState } from "react";
import { Calendar, User as UserIcon } from "lucide-react";

type Preset = "today" | "7d" | "30d" | "thisMonth" | "thisQuarter" | "custom";

interface ReportsToolbarProps {
  from: string;
  to: string;
  ownerId: string;
  ownerOptions: { value: string; label: string }[];
  onChange: (next: { from: string; to: string; ownerId: string }) => void;
}

const CHIPS: { key: Preset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "thisMonth", label: "This month" },
  { key: "thisQuarter", label: "This quarter" },
  { key: "custom", label: "Custom" },
];

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function presetRange(p: Preset): { from: Date; to: Date } {
  const now = new Date();
  const today = startOfTodayUtc();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfQuarter = new Date(
    today.getFullYear(),
    Math.floor(today.getMonth() / 3) * 3,
    1,
  );
  switch (p) {
    case "today":
      return { from: today, to: now };
    case "7d":
      return { from: new Date(today.getTime() - 6 * 86400000), to: now };
    case "30d":
      return { from: new Date(today.getTime() - 29 * 86400000), to: now };
    case "thisMonth":
      return { from: startOfMonth, to: now };
    case "thisQuarter":
      return { from: startOfQuarter, to: now };
    case "custom":
      return { from: today, to: now };
  }
}

/** Match the URL's from/to back to the closest preset for chip highlight. */
function presetFromUrl(fromIso: string, toIso: string): Preset {
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return "custom";
  const dayMs = 86_400_000;
  for (const p of ["today", "7d", "30d", "thisMonth", "thisQuarter"] as Preset[]) {
    const r = presetRange(p);
    // Allow same-day fuzziness (toolbar's Date.now() jiggles between renders).
    const fromDelta = Math.abs(fromMs - r.from.getTime());
    const toDelta = Math.abs(toMs - r.to.getTime());
    if (fromDelta < dayMs && toDelta < dayMs) return p;
  }
  return "custom";
}

export function ReportsToolbar({
  from,
  to,
  ownerId,
  ownerOptions,
  onChange,
}: ReportsToolbarProps) {
  /** What the URL says we're showing — informs preset chip highlight. */
  const urlPreset = useMemo(() => presetFromUrl(from, to), [from, to]);
  /**
   * The user explicitly clicked Custom, so keep the inputs visible even
   * before they apply a custom range. Auto-cleared when they pick a
   * non-custom chip.
   */
  const [customMode, setCustomMode] = useState<boolean>(urlPreset === "custom");
  const showCustom = customMode || urlPreset === "custom";
  const activeChip: Preset = showCustom ? "custom" : urlPreset;

  const [customFrom, setCustomFrom] = useState(from.slice(0, 10));
  const [customTo, setCustomTo] = useState(to.slice(0, 10));

  useEffect(() => {
    setCustomFrom(from.slice(0, 10));
    setCustomTo(to.slice(0, 10));
  }, [from, to]);

  // If URL switches to a recognised preset (e.g. user picks 7d after Custom),
  // hide the custom panel.
  useEffect(() => {
    if (urlPreset !== "custom") setCustomMode(false);
  }, [urlPreset]);

  function applyPreset(p: Preset) {
    if (p === "custom") {
      // Reveal the custom inputs without changing URL yet — user types
      // the dates and hits Apply to commit.
      setCustomMode(true);
      return;
    }
    setCustomMode(false);
    const { from: f, to: t } = presetRange(p);
    onChange({ from: f.toISOString(), to: t.toISOString(), ownerId });
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    const f = new Date(`${customFrom}T00:00:00`);
    const t = new Date(`${customTo}T23:59:59`);
    if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime()) || f > t) return;
    onChange({ from: f.toISOString(), to: t.toISOString(), ownerId });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-crm-border bg-white p-2 shadow-sm">
      <div className="flex items-center gap-1.5 pl-1">
        <Calendar size={14} className="text-crm-muted" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-crm-muted">
          Range
        </span>
      </div>
      <div className="inline-flex flex-wrap rounded-lg bg-crm-panel p-0.5">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => applyPreset(c.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeChip === c.key
                ? "bg-white text-accent-700 shadow-sm"
                : "text-crm-fg hover:text-accent-700"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {showCustom && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="h-8 rounded-md border border-crm-border bg-white px-2 text-xs"
          />
          <span className="text-xs text-crm-muted">→</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="h-8 rounded-md border border-crm-border bg-white px-2 text-xs"
          />
          <button
            type="button"
            onClick={applyCustom}
            className="h-8 rounded-md bg-accent-600 px-2.5 text-xs font-medium text-white hover:bg-accent-700"
          >
            Apply
          </button>
        </div>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <UserIcon size={14} className="text-crm-muted" />
        <select
          value={ownerId}
          onChange={(e) => onChange({ from, to, ownerId: e.target.value })}
          className="h-8 rounded-md border border-crm-border bg-white px-2 pr-7 text-xs font-medium hover:border-accent-400 focus:border-accent-500 focus:outline-none"
        >
          <option value="">All agents</option>
          {ownerOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
