"use client";

import type { FreeBusyInterval, PublicUser } from "@/lib/shared";
import { Avatar } from "@/components/ui";

// Visible scheduling window (local hours). Busy blocks + the proposed slot are
// positioned as a percentage across this band.
export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 19;
const WINDOW_MIN = (DAY_END_HOUR - DAY_START_HOUR) * 60;

/** Local minutes-from-midnight of an ISO instant (times stored UTC, shown local). */
export function localMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** Clamp [startMin,endMin] into the window and return {left%,width%} or null. */
export function bandStyle(
  startMin: number,
  endMin: number,
): { left: number; width: number } | null {
  const winStart = DAY_START_HOUR * 60;
  const lo = Math.max(startMin, winStart);
  const hi = Math.min(endMin, DAY_END_HOUR * 60);
  if (hi <= lo) return null;
  return {
    left: ((lo - winStart) / WINDOW_MIN) * 100,
    width: ((hi - lo) / WINDOW_MIN) * 100,
  };
}

export interface FreeBusyGridProps {
  attendees: PublicUser[];
  /** userId → busy intervals (UTC ISO). */
  busy: Record<string, FreeBusyInterval[]>;
  /** userIds the active provider can't see (S15b) — rendered as a hatched band. */
  unknown?: string[];
  /** Proposed slot in local minutes-from-midnight (for the highlight band). */
  selStartMin: number;
  selEndMin: number;
  loading?: boolean;
}

/**
 * Free/busy grid (S15a, +unknown S15b). One row per attendee over a fixed
 * working-hours window; busy blocks are shaded and the proposed meeting slot is
 * overlaid so the user can see conflicts and pick an open time. Attendees the
 * active provider can't see show a hatched "availability unknown" lane (never
 * shown as free). Read-only display (v1 decision).
 */
export function FreeBusyGrid({
  attendees,
  busy,
  unknown,
  selStartMin,
  selEndMin,
  loading,
}: FreeBusyGridProps) {
  const hours: number[] = [];
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) hours.push(h);
  const sel = bandStyle(selStartMin, selEndMin);
  const unknownSet = new Set(unknown ?? []);
  const anyUnknown = unknownSet.size > 0;

  return (
    <div className="qc-fbgrid" data-testid="freebusy-grid" aria-busy={loading || undefined}>
      <div className="qc-fbgrid__axis" aria-hidden>
        <span className="qc-fbgrid__axis-label" />
        <div className="qc-fbgrid__ticks">
          {hours.map((h) => (
            <span key={h} className="qc-fbgrid__tick">
              {h}
            </span>
          ))}
        </div>
      </div>
      <div className="qc-fbgrid__rows">
        {attendees.map((a) => {
          const isUnknown = unknownSet.has(a.id);
          const blocks = busy[a.id] ?? [];
          return (
            <div key={a.id} className="qc-fbgrid__row" data-testid={`fb-row-${a.id}`}>
              <span className="qc-fbgrid__who" title={a.displayName}>
                <Avatar name={a.displayName} id={a.id} avatarUrl={a.avatarUrl} size={20} />
                <span className="qc-truncate">{a.displayName}</span>
              </span>
              <div className="qc-fbgrid__lane" data-unknown={isUnknown || undefined}>
                {sel ? (
                  <span
                    className="qc-fbgrid__sel"
                    style={{ left: `${sel.left}%`, width: `${sel.width}%` }}
                    aria-hidden
                  />
                ) : null}
                {isUnknown ? (
                  <span
                    className="qc-fbgrid__unknown"
                    data-testid={`fb-unknown-${a.id}`}
                    title="Availability unknown"
                  />
                ) : (
                  blocks.map((b, i) => {
                    const band = bandStyle(localMinutes(b.start), localMinutes(b.end));
                    if (!band) return null;
                    return (
                      <span
                        key={i}
                        className="qc-fbgrid__busy"
                        style={{ left: `${band.left}%`, width: `${band.width}%` }}
                        data-testid={`fb-busy-${a.id}`}
                        title="Busy"
                      />
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
      {anyUnknown ? (
        <div className="qc-fbgrid__legend" data-testid="fb-legend">
          <span className="qc-fbgrid__legend-swatch qc-fbgrid__unknown" aria-hidden />
          Availability unknown — not connected / not visible to the calendar
        </div>
      ) : null}
    </div>
  );
}
