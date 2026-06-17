// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DeltaPill } from "@/components/dashboard/delta-pill";

afterEach(() => {
  cleanup();
});

describe("DeltaPill — Bug 6 rendering", () => {
  it("kind=pct renders signed percentage with the range label", () => {
    render(
      <DeltaPill
        delta={{ kind: "pct", value: 50 }}
        rangeLabel="prior 7d"
      />,
    );
    expect(screen.getByText(/\+50% vs prior 7d/i)).toBeInTheDocument();
  });

  it("kind=pct negative renders the minus sign without a leading +", () => {
    render(
      <DeltaPill
        delta={{ kind: "pct", value: -50 }}
        rangeLabel="prior month"
      />,
    );
    expect(screen.getByText(/-50% vs prior month/i)).toBeInTheDocument();
  });

  it("kind=new renders 'new' instead of a fake +100%", () => {
    render(
      <DeltaPill delta={{ kind: "new" }} rangeLabel="prior 7d" />,
    );
    expect(screen.getByText(/new vs prior 7d/i)).toBeInTheDocument();
    // Pin: must not contain a percentage character — that was the Bug 6 bug.
    expect(screen.queryByText(/100%/)).toBeNull();
  });

  it("kind=none renders an em-dash with the range label", () => {
    render(
      <DeltaPill delta={{ kind: "none" }} rangeLabel="prior 30d" />,
    );
    expect(screen.getByText(/— vs prior 30d/i)).toBeInTheDocument();
  });
});
