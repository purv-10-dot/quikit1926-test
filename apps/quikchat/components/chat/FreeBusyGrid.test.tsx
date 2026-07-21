import type { PublicUser } from "@/lib/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { bandStyle, FreeBusyGrid, localMinutes } from "./FreeBusyGrid";

const u1: PublicUser = { id: "u1", displayName: "Ann", avatarUrl: null };
const u2: PublicUser = { id: "u2", displayName: "Bo", avatarUrl: null };

// A local 10:00–11:00 busy block (tz-independent: built from local components).
function localBlock(h: number, mins = 60) {
  const start = new Date(2026, 5, 20, h, 0, 0);
  const end = new Date(start.getTime() + mins * 60_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

describe("FreeBusyGrid helpers", () => {
  it("localMinutes reads minutes-from-midnight in local tz", () => {
    expect(localMinutes(new Date(2026, 5, 20, 9, 30).toISOString())).toBe(9 * 60 + 30);
  });
  it("bandStyle clamps out-of-window and positions in-window", () => {
    expect(bandStyle(0, 60)).toBeNull();
    const b = bandStyle(8 * 60, 9 * 60);
    expect(b).not.toBeNull();
    expect(b!.left).toBe(0);
    expect(b!.width).toBeGreaterThan(0);
  });
});

describe("FreeBusyGrid", () => {
  it("renders a row per attendee with busy blocks and the proposed slot", () => {
    render(
      <FreeBusyGrid
        attendees={[u1, u2]}
        busy={{ u1: [localBlock(10)], u2: [] }}
        selStartMin={10 * 60}
        selEndMin={10 * 60 + 30}
      />,
    );
    expect(screen.getByTestId("fb-row-u1")).toBeInTheDocument();
    expect(screen.getByTestId("fb-row-u2")).toBeInTheDocument();
    // u1 has one busy segment, u2 none.
    expect(screen.getAllByTestId("fb-busy-u1")).toHaveLength(1);
    expect(screen.queryByTestId("fb-busy-u2")).toBeNull();
    // The proposed-slot highlight band is present (one per row).
    expect(document.querySelectorAll(".qc-fbgrid__sel").length).toBe(2);
  });

  it("renders a hatched 'unknown' lane + legend for unseen attendees (S15b)", () => {
    render(
      <FreeBusyGrid
        attendees={[u1, u2]}
        busy={{ u1: [localBlock(10)] }}
        unknown={["u2"]}
        selStartMin={10 * 60}
        selEndMin={10 * 60 + 30}
      />,
    );
    // u2 is unknown → hatched band, no busy segments.
    expect(screen.getByTestId("fb-unknown-u2")).toBeInTheDocument();
    expect(screen.queryByTestId("fb-busy-u2")).toBeNull();
    // u1 is known → busy segment, no unknown band.
    expect(screen.getByTestId("fb-busy-u1")).toBeInTheDocument();
    expect(screen.queryByTestId("fb-unknown-u1")).toBeNull();
    // Legend appears only when something is unknown.
    expect(screen.getByTestId("fb-legend")).toBeInTheDocument();
  });
});
