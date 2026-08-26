// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PeriodPicker from "@/components/ui/PeriodPicker";
import type { PeriodSpec } from "@/lib/period/types";

const base: PeriodSpec = { preset: 30, compare: "none" };

// Testing Library's automatic cleanup only registers when vitest runs with
// `globals: true`, which this project does not. Without it, renders stack up and
// every query finds duplicates.
afterEach(cleanup);

describe("PeriodPicker", () => {
  it("emits the chosen preset", () => {
    const onChange = vi.fn();
    render(<PeriodPicker value={base} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Date range"), { target: { value: "7" } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ preset: 7 }));
  });

  it("keeps the comparison mode when the range changes", () => {
    const onChange = vi.fn();
    render(<PeriodPicker value={{ preset: 30, compare: "wow" }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Date range"), { target: { value: "90" } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ preset: 90, compare: "wow" }));
  });

  it("emits the chosen comparison mode", () => {
    const onChange = vi.fn();
    render(<PeriodPicker value={base} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Comparison"), { target: { value: "mom" } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ compare: "mom" }));
  });

  it("hides the comparison control when comparison is not allowed", () => {
    render(<PeriodPicker value={base} onChange={vi.fn()} allowCompare={false} />);
    expect(screen.queryByLabelText("Comparison")).toBeNull();
  });

  it("does not fire while a custom range is half-entered", () => {
    // A partial range must not trigger a fetch for a nonsense window.
    const onChange = vi.fn();
    render(<PeriodPicker value={{ preset: "custom", compare: "none" }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Range start"), { target: { value: "2026-08-01" } });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Pick both dates")).toBeTruthy();
  });

  it("fires once both custom dates are present and ordered", () => {
    const onChange = vi.fn();
    render(
      <PeriodPicker
        value={{ preset: "custom", customStart: "2026-08-01", compare: "none" }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Range end"), { target: { value: "2026-08-10" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ customStart: "2026-08-01", customEnd: "2026-08-10" }),
    );
  });

  it("refuses a reversed custom range", () => {
    const onChange = vi.fn();
    render(
      <PeriodPicker
        value={{ preset: "custom", customStart: "2026-08-10", compare: "none" }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Range end"), { target: { value: "2026-08-01" } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows both literal windows so a length mismatch is visible", () => {
    render(
      <PeriodPicker
        value={{ preset: "custom", customStart: "2026-03-01", customEnd: "2026-03-31", compare: "mom" }}
        onChange={vi.fn()}
      />,
    );

    // 31-day March compared against 28-day February — the user must be able to see that.
    expect(screen.getByText(/1 – 31 Mar 2026 vs 1 – 28 Feb 2026/)).toBeTruthy();
  });
});
