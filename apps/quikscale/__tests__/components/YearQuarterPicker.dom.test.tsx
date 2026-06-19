// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { YearQuarterPicker } from "@/app/(dashboard)/opsp/components/YearQuarterPicker";

const noop = () => {};

const defaultProps = {
  year: 2025,
  setYear: noop,
  quarter: "Q2",
  setQuarter: noop,
  years: [2024, 2025, 2026],
  open: false,
  onToggle: noop,
  isYearDisabled: () => false,
  isQuarterDisabled: () => false,
};

describe("YearQuarterPicker", () => {
  it("renders the currently-selected year and quarter on the trigger", () => {
    render(<YearQuarterPicker {...defaultProps} />);
    // fiscalYearLabel(2025) is typically "2025" or "FY25"; either way the year
    // digits and the quarter string both appear on the trigger button.
    const trigger = screen.getAllByRole("button")[0];
    expect(trigger.textContent).toMatch(/2025/);
    expect(trigger.textContent).toMatch(/Q2/);
  });

  it("does NOT render the dropdown when open=false", () => {
    render(<YearQuarterPicker {...defaultProps} open={false} />);
    // When closed, we expect exactly one button (the trigger), not the year grid.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText(/Fiscal Year/i)).not.toBeInTheDocument();
  });

  it("renders all years from the `years` prop when open", () => {
    render(<YearQuarterPicker {...defaultProps} open={true} years={[2023, 2024, 2025, 2026, 2027]} />);
    const buttons = screen.getAllByRole("button");
    // 1 trigger + 5 year buttons + 4 quarter buttons = 10
    expect(buttons).toHaveLength(1 + 5 + 4);
    expect(screen.getByText(/Fiscal Year/i)).toBeInTheDocument();
    expect(screen.getByText(/Quarter/i)).toBeInTheDocument();
  });

  it("calls onToggle when the trigger button is clicked", () => {
    const onToggle = vi.fn();
    render(<YearQuarterPicker {...defaultProps} onToggle={onToggle} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("calls setYear when an enabled year option is clicked", () => {
    const setYear = vi.fn();
    render(
      <YearQuarterPicker
        {...defaultProps}
        open={true}
        years={[2025, 2026]}
        setYear={setYear}
      />,
    );
    // fiscalYearLabel(y) === `${y}–${y+1}`. Find the button whose text
    // starts with "2026" (so "2026–2027", not "2025–2026").
    const yearButton = screen
      .getAllByRole("button")
      .find((b) => (b.textContent || "").trim().startsWith("2026"));
    expect(yearButton).toBeDefined();
    fireEvent.click(yearButton!);
    expect(setYear).toHaveBeenCalledWith(2026);
  });

  it("calls setQuarter when an enabled quarter option is clicked", () => {
    const setQuarter = vi.fn();
    render(
      <YearQuarterPicker
        {...defaultProps}
        open={true}
        setQuarter={setQuarter}
      />,
    );
    // Q3 should be present and enabled.
    const q3Button = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.trim() === "Q3");
    expect(q3Button).toBeDefined();
    fireEvent.click(q3Button!);
    expect(setQuarter).toHaveBeenCalledWith("Q3");
  });

  it("does NOT call setYear when the clicked year is disabled", () => {
    const setYear = vi.fn();
    render(
      <YearQuarterPicker
        {...defaultProps}
        open={true}
        years={[2025, 2026]}
        setYear={setYear}
        isYearDisabled={(y) => y === 2026}
      />,
    );
    const disabledButton = screen
      .getAllByRole("button")
      .find((b) => (b.textContent || "").trim().startsWith("2026"));
    expect(disabledButton).toBeDefined();
    expect((disabledButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(disabledButton!);
    expect(setYear).not.toHaveBeenCalled();
  });

  it("does NOT call setQuarter when the clicked quarter is disabled", () => {
    const setQuarter = vi.fn();
    render(
      <YearQuarterPicker
        {...defaultProps}
        open={true}
        setQuarter={setQuarter}
        isQuarterDisabled={(q) => q === "Q1"}
      />,
    );
    const q1Button = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.trim() === "Q1");
    expect(q1Button).toBeDefined();
    expect((q1Button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(q1Button!);
    expect(setQuarter).not.toHaveBeenCalled();
  });
});
