"use client";

import { Users } from "lucide-react";
import {
  HABIT_DEFINITIONS,
  type CampaignAggregate,
  type HabitAggregate,
  type SubItemAggregate,
} from "@/lib/schemas/habitSchema";

interface Props {
  aggregate: CampaignAggregate;
  campaignLabel: string;
}

/**
 * Rockefeller Habits Checklist — the dense board-room table view.
 * Layout: # · HABIT · COUNT · %.
 *
 *  - Habit rows are bold and show the parent's avg-count + avg-%
 *  - Sub-item rows (a, b, c, d) are indented and show their own count + %
 *  - The % cell has a colour-graded background that scales with the score:
 *    deep green at the top, fading through lime and amber down to red.
 *
 * The colour ramp uses solid Tailwind classes (no inline styles) so the
 * locked-table palette rules from CLAUDE.md still apply — semantic, not theme.
 */
export function ChecklistTable({ aggregate, campaignLabel }: Props) {
  const hasData = aggregate.respondentCount > 0;

  return (
    <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 sm:px-5 py-3.5 flex-shrink-0 bg-gradient-to-r from-white via-white to-amber-50/30">
        <div className="min-w-0 flex items-center gap-3 sm:gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-900 tracking-tight">
              Rockefeller Habits Checklist
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Aggregate of {aggregate.respondentCount}{" "}
              {aggregate.respondentCount === 1 ? "submitted response" : "submitted responses"} ·{" "}
              {campaignLabel}
            </p>
          </div>
          {hasData && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 border border-gray-200 text-[11px] font-medium text-gray-600 whitespace-nowrap">
              <Users className="h-3 w-3" />
              <span className="tabular-nums">{aggregate.respondentCount}</span>
              {aggregate.respondentCount === 1 ? " participant" : " participants"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5 pl-3 pr-1 py-1 rounded-lg bg-amber-50/80 border border-amber-100 flex-shrink-0">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-900/70 text-right leading-tight max-w-[70px]">
            No. of
            <br />
            Participants
          </span>
          <span className="text-2xl font-bold tabular-nums text-gray-900 px-1">
            {aggregate.respondentCount}
          </span>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-gray-50 text-[10px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="text-left px-3 py-2 w-10">#</th>
              <th className="text-left px-3 py-2">Habits</th>
              <th className="text-center px-3 py-2 w-20">Count</th>
              <th className="text-center px-3 py-2 w-20">%</th>
            </tr>
          </thead>
          <tbody>
            {aggregate.perHabit.map((h, idx) => (
              <HabitRows key={h.key} habit={h} idx={idx + 1} hasData={hasData} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HabitRows({
  habit,
  idx,
  hasData,
}: {
  habit: HabitAggregate;
  idx: number;
  hasData: boolean;
}) {
  return (
    <>
      <tr className="border-t border-gray-200 bg-gray-50/40">
        <td className="px-3 py-2.5 text-center text-xs font-bold tabular-nums text-gray-700">
          {idx}
        </td>
        <td className="px-3 py-2.5 text-[13px] font-semibold text-gray-900">
          {HABIT_DEFINITIONS[habit.key].label}.
        </td>
        <td className="px-3 py-2.5 text-center text-xs font-bold tabular-nums text-gray-700">
          {hasData ? habit.avgYes : "—"}
        </td>
        <PctCell pct={hasData ? habit.pct : null} bold />
      </tr>
      {habit.subItems.map((s) => (
        <SubRow key={s.index} sub={s} idx={idx} hasData={hasData} />
      ))}
    </>
  );
}

function SubRow({
  sub,
  idx,
  hasData,
}: {
  sub: SubItemAggregate;
  idx: number;
  hasData: boolean;
}) {
  const letter = ["a", "b", "c", "d"][sub.index] ?? "?";
  return (
    <tr className="border-t border-gray-100 hover:bg-blue-50/30 transition-colors">
      <td className="px-3 py-2 text-center text-[11px] italic text-gray-400">{letter}</td>
      <td className="px-3 py-2 text-[12.5px] text-gray-700 leading-snug">{sub.label}.</td>
      <td className="px-3 py-2 text-center text-xs font-semibold tabular-nums text-gray-700">
        {hasData ? sub.yes : "—"}
      </td>
      <PctCell pct={hasData ? sub.pct : null} bold={false} title={`Habit ${idx} · ${letter}`} />
    </tr>
  );
}

function PctCell({
  pct,
  bold,
  title,
}: {
  pct: number | null;
  bold: boolean;
  title?: string;
}) {
  if (pct === null) {
    return (
      <td className="px-3 py-2 text-center text-xs font-semibold text-gray-400 tabular-nums">
        —
      </td>
    );
  }
  const display = Math.round(pct * 100);
  const tone = pctTone(pct);
  return (
    <td
      className={`px-3 py-2 text-center text-xs tabular-nums ${tone.bg} ${tone.text} ${bold ? "font-bold" : "font-semibold"}`}
      title={title}
    >
      {display}%
    </td>
  );
}

/**
 * Colour ramp for the % cells. Matches the green-fading-to-amber-to-red look
 * of the reference: dark green at ≥85%, mid greens 70–84%, lime 60–69%,
 * amber 50–59%, red <50%. Six steps so the gradient reads smoothly across
 * the whole table without harsh jumps between adjacent rows.
 */
function pctTone(pct: number): { bg: string; text: string } {
  const v = pct * 100;
  if (v >= 85) return { bg: "bg-green-300/80", text: "text-green-900" };
  if (v >= 75) return { bg: "bg-green-200",    text: "text-green-800" };
  if (v >= 65) return { bg: "bg-green-100",    text: "text-green-800" };
  if (v >= 55) return { bg: "bg-lime-100",     text: "text-lime-800"  };
  if (v >= 45) return { bg: "bg-amber-100",    text: "text-amber-800" };
  return { bg: "bg-red-100", text: "text-red-700" };
}
