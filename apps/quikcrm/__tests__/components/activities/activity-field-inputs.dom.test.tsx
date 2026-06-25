// @vitest-environment jsdom
/**
 * T-P3.2 — RED-first jsdom test for ActivityFieldInputs: the multi-field
 * WRAPPER for the logging UX. It does NOT re-implement per-control rendering —
 * it renders each ActivityFieldDefinition via the shared DynamicFieldInput
 * (the proven lead/product component) using the shared toLeadDefShape mapper,
 * owns the values-map state ({ key: value }), marks Required fields, and
 * defensively skips Phone (excluded for activities).
 *
 * Written BEFORE components/activities/activity-field-inputs.tsx exists → RED
 * for one reason: the module doesn't resolve.
 *
 * What's asserted is the WIRING (right control per field, via the shared
 * component) + the wrapper's own behavior (values-map output incl.
 * MultiSelect→string[], required markers, Phone skipped) — not a re-built
 * control mapping.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ActivityFieldInputs } from "@/components/activities/activity-field-inputs";
import type { ActivityFieldDefinition } from "@/types/activity-type";

function def(p: Partial<ActivityFieldDefinition> & { key: string; fieldType: ActivityFieldDefinition["fieldType"] }): ActivityFieldDefinition {
  return {
    id: `fd_${p.key}`,
    activityTypeId: "at1",
    key: p.key,
    label: p.label ?? p.key,
    fieldType: p.fieldType,
    requirement: p.requirement ?? "Optional",
    options: p.options ?? null,
    visible: p.visible ?? true,
    sortOrder: p.sortOrder ?? 0,
  };
}

afterEach(() => cleanup());

describe("ActivityFieldInputs — multi-field wrapper", () => {
  it("renders the right control per fieldType (via the shared DynamicFieldInput)", () => {
    render(
      <ActivityFieldInputs
        fields={[
          def({ key: "notes", label: "Notes", fieldType: "TextArea" }),
          def({ key: "bid", label: "Bid", fieldType: "Number" }),
          def({ key: "follow_up", label: "Follow up", fieldType: "Date" }),
          def({ key: "replied", label: "Replied", fieldType: "Boolean" }),
          def({ key: "channel", label: "Channel", fieldType: "Select", options: ["Upwork", "LinkedIn"] }),
        ]}
        values={{}}
        onChange={() => {}}
      />,
    );

    // TextArea → <textarea>; Number/Date → typed <input>; Boolean → checkbox;
    // Select → <select> with options. (Control-type-per-field = the wiring.)
    expect(document.querySelector("textarea")).toBeTruthy();
    expect(document.querySelector('input[type="number"]')).toBeTruthy();
    expect(document.querySelector('input[type="date"]')).toBeTruthy();
    expect(document.querySelector('input[type="checkbox"]')).toBeTruthy();
    expect(document.querySelector("select")).toBeTruthy();
    expect(screen.getByText("Upwork")).toBeTruthy();
  });

  it("marks Required fields with a marker inside the field's label", () => {
    const { container } = render(
      <ActivityFieldInputs
        fields={[def({ key: "bid", label: "Bid", fieldType: "Number", requirement: "Required" })]}
        values={{}}
        onChange={() => {}}
      />,
    );
    // The component renders the label text and the required marker in separate
    // spans (the "*" is styled), so assert on the DOM shape: the field's <label>
    // contains both "Bid" and a "*" marker. (text matcher across nodes.)
    const label = container.querySelector("label");
    expect(label).toBeTruthy();
    expect(label!.textContent).toContain("Bid");
    expect(label!.textContent).toContain("*");
  });

  it("does NOT mark Optional fields with a required marker", () => {
    const { container } = render(
      <ActivityFieldInputs
        fields={[def({ key: "notes", label: "Notes", fieldType: "TextArea", requirement: "Optional" })]}
        values={{}}
        onChange={() => {}}
      />,
    );
    // Negative guard: an Optional field's label has no "*".
    const label = container.querySelector("label");
    expect(label!.textContent).toContain("Notes");
    expect(label!.textContent).not.toContain("*");
  });

  it("emits the values-map keyed by field key on change (Number coerces to number)", () => {
    const onChange = vi.fn();
    render(
      <ActivityFieldInputs
        fields={[def({ key: "bid", label: "Bid", fieldType: "Number" })]}
        values={{}}
        onChange={onChange}
      />,
    );
    fireEvent.change(document.querySelector('input[type="number"]')!, { target: { value: "250" } });
    // The wrapper owns the values map and reports { bid: 250 }.
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ bid: 250 }));
  });

  it("MultiSelect emits a string[] in the values-map (matches valueJson routing)", () => {
    const onChange = vi.fn();
    render(
      <ActivityFieldInputs
        fields={[def({ key: "tags", label: "Tags", fieldType: "MultiSelect", options: ["a", "b", "c"] })]}
        values={{}}
        onChange={onChange}
      />,
    );
    const sel = document.querySelector("select[multiple]") as HTMLSelectElement;
    // select options a and c
    Array.from(sel.options).forEach((o) => (o.selected = o.value === "a" || o.value === "c"));
    fireEvent.change(sel);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tags: ["a", "c"] }));
  });

  it("defensively SKIPS Phone fields — keys off control COUNT, not the label string", () => {
    // Two defs (TextArea + Phone) but Phone is excluded → exactly ONE control
    // should render (the TextArea). Counting controls proves the Phone field
    // didn't render under ANY label, unlike a queryByText("Phone") check which
    // would pass even if a Phone control rendered with a different label.
    const { container } = render(
      <ActivityFieldInputs
        fields={[
          def({ key: "notes", label: "Notes", fieldType: "TextArea" }),
          def({ key: "contact_phone", label: "Contact number", fieldType: "Phone" }),
        ]}
        values={{}}
        onChange={() => {}}
      />,
    );

    // The TextArea renders; no Phone-specific control (PhoneField renders a
    // tel/number input + a dial-code selector) appears.
    expect(container.querySelectorAll("textarea")).toHaveLength(1);
    const controls = container.querySelectorAll("input, select, textarea");
    expect(controls).toHaveLength(1); // only the TextArea — Phone skipped entirely
  });

  it("renders ONLY a Phone def as zero controls (the whole set is skippable)", () => {
    const { container } = render(
      <ActivityFieldInputs
        fields={[def({ key: "contact_phone", label: "Contact number", fieldType: "Phone" })]}
        values={{}}
        onChange={() => {}}
      />,
    );
    // A lone Phone def → no controls at all (it's filtered before render).
    expect(container.querySelectorAll("input, select, textarea")).toHaveLength(0);
  });
});
