// @vitest-environment jsdom
/**
 * EntityMultiSelect — the id-keyed picker the ICP form uses for products,
 * services, industries, verticals, technologies and example companies.
 *
 * Worth testing directly because it is the one genuinely new UI primitive in the
 * ICP module (the list/modal shells are copies of existing patterns), and because
 * it carries the id↔label indirection that a value-keyed select does not.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { EntityMultiSelect } from "@/components/icp/entity-multi-select";

/**
 * `__tests__/setup.ts` does `import "@testing-library/jest-dom/vitest"`, but with
 * this repo's Vitest 3 pin that side-effect import does NOT attach the matchers to
 * the `expect` handed to test files — every `toBeInTheDocument()` fails with
 * "Invalid Chai property". That breakage predates the ICP module and is the root
 * cause of the ~54 failing tests already on this branch (delta-pill, contact-form,
 * convert-lead-modal, …), reproducible with a two-line test that imports nothing
 * from the app.
 *
 * Registering explicitly here keeps this file green without touching the shared
 * harness. Once setup.ts is fixed centrally (swap the side-effect import for
 * `expect.extend(matchers)`), this block can be deleted.
 */
beforeAll(() => {
  expect.extend(jestDomMatchers as never);
});

afterEach(() => {
  cleanup();
});

const OPTS = [
  { id: "p1", label: "Widget A", hint: "SKU-1" },
  { id: "p2", label: "Widget B", hint: "SKU-2" },
  { id: "p3", label: "Gadget C", hint: null },
];

describe("EntityMultiSelect", () => {
  it("shows the placeholder when nothing is selected", () => {
    render(
      <EntityMultiSelect options={OPTS} value={[]} onChange={() => {}} placeholder="Select products" />,
    );
    expect(screen.getByText("Select products")).toBeInTheDocument();
  });

  it("renders LABELS for selected ids, not the raw cuids", () => {
    render(<EntityMultiSelect options={OPTS} value={["p1", "p2"]} onChange={() => {}} />);
    // The whole point of the id-keyed variant: ids never reach the user.
    expect(screen.getByText("Widget A, Widget B")).toBeInTheDocument();
    expect(screen.queryByText(/p1/)).not.toBeInTheDocument();
  });

  it("collapses to a count past two selections", () => {
    render(<EntityMultiSelect options={OPTS} value={["p1", "p2", "p3"]} onChange={() => {}} />);
    expect(screen.getByText("3 selected")).toBeInTheDocument();
  });

  it("opens on click and lists every option", () => {
    render(<EntityMultiSelect options={OPTS} value={[]} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("Widget A")).toBeInTheDocument();
    expect(screen.getByText("Gadget C")).toBeInTheDocument();
  });

  it("shows the hint (SKU/code) beside the label", () => {
    render(<EntityMultiSelect options={OPTS} value={[]} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("SKU-1")).toBeInTheDocument();
  });

  it("adds an id on check", () => {
    const onChange = vi.fn();
    render(<EntityMultiSelect options={OPTS} value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(onChange).toHaveBeenCalledWith(["p1"]);
  });

  it("removes an already-selected id on uncheck (toggle)", () => {
    const onChange = vi.fn();
    render(<EntityMultiSelect options={OPTS} value={["p1", "p2"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(onChange).toHaveBeenCalledWith(["p2"]);
  });

  it("reflects selection state in the checkboxes", () => {
    render(<EntityMultiSelect options={OPTS} value={["p2"]} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button"));
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes[0].checked).toBe(false);
    expect(boxes[1].checked).toBe(true);
  });

  it("renders the empty hint when there are no options at all", () => {
    render(
      <EntityMultiSelect
        options={[]}
        value={[]}
        onChange={() => {}}
        emptyHint="No industries yet — add them via Manage taxonomy."
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/No industries yet/)).toBeInTheDocument();
  });

  it("offers Clear all only when something is selected, and clears to []", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <EntityMultiSelect options={OPTS} value={[]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("Clear all")).not.toBeInTheDocument();

    rerender(<EntityMultiSelect options={OPTS} value={["p1"]} onChange={onChange} />);
    fireEvent.click(screen.getByText("Clear all"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("hides the filter box for a short list", () => {
    render(
      <EntityMultiSelect options={OPTS} value={[]} onChange={() => {}} searchThreshold={8} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByLabelText("Filter options")).not.toBeInTheDocument();
  });

  it("shows the filter box once the list passes the threshold", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, label: `Item ${i}` }));
    render(
      <EntityMultiSelect options={many} value={[]} onChange={() => {}} searchThreshold={8} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByLabelText("Filter options")).toBeInTheDocument();
  });

  it("filters by label and by hint", () => {
    const many = [...OPTS, ...Array.from({ length: 8 }, (_, i) => ({ id: `z${i}`, label: `Zed ${i}` }))];
    render(<EntityMultiSelect options={many} value={[]} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button"));

    const box = screen.getByLabelText("Filter options");
    fireEvent.change(box, { target: { value: "gadget" } });
    expect(screen.getByText("Gadget C")).toBeInTheDocument();
    expect(screen.queryByText("Widget A")).not.toBeInTheDocument();

    // Hints are searchable too — useful for SKU lookup.
    fireEvent.change(box, { target: { value: "SKU-2" } });
    expect(screen.getByText("Widget B")).toBeInTheDocument();
    expect(screen.queryByText("Gadget C")).not.toBeInTheDocument();
  });

  it("says 'No matches.' when the filter excludes everything", () => {
    const many = [...OPTS, ...Array.from({ length: 8 }, (_, i) => ({ id: `z${i}`, label: `Zed ${i}` }))];
    render(<EntityMultiSelect options={many} value={[]} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(screen.getByLabelText("Filter options"), {
      target: { value: "zzzzznope" },
    });
    expect(screen.getByText("No matches.")).toBeInTheDocument();
  });

  it("does not open when disabled", () => {
    render(<EntityMultiSelect options={OPTS} value={[]} onChange={() => {}} disabled />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(<EntityMultiSelect options={OPTS} value={[]} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("exposes aria-expanded for assistive tech", () => {
    render(<EntityMultiSelect options={OPTS} value={[]} onChange={() => {}} />);
    const trigger = screen.getByRole("button");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
