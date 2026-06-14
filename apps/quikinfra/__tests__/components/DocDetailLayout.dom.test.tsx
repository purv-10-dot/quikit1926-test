// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocDetailLayout, type LineCol } from "@/components/procurement/DocDetailLayout";

interface Row {
  name: string;
  qty: number;
}

const lineColumns: LineCol<Row>[] = [
  { key: "name", label: "Material", render: (r) => r.name },
  { key: "qty", label: "Qty", align: "right", render: (r) => r.qty },
];

function setup(overrides: Partial<React.ComponentProps<typeof DocDetailLayout<Row>>> = {}) {
  return render(
    <DocDetailLayout<Row>
      backHref="/purchase/orders"
      backLabel="Back to orders"
      title="PO-PROJ-2025-0001"
      meta={[{ label: "Vendor", value: "Acme Cement" }]}
      lineColumns={lineColumns}
      lines={[{ name: "Cement", qty: 10 }]}
      {...overrides}
    />,
  );
}

describe("DocDetailLayout", () => {
  it("renders the title and back link", () => {
    setup();
    expect(screen.getByText("PO-PROJ-2025-0001")).toBeInTheDocument();
    const back = screen.getByRole("link", { name: /back to orders/i });
    expect(back).toHaveAttribute("href", "/purchase/orders");
  });

  it("renders the subtitle and status badge when provided", () => {
    setup({
      subtitle: "Created 2025-01-01",
      statusBadge: <span>Approved</span>,
    });
    expect(screen.getByText("Created 2025-01-01")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("renders the meta grid key/value pairs", () => {
    setup({
      meta: [
        { label: "Vendor", value: "Acme Cement" },
        { label: "Project", value: "Metro Phase 2" },
      ],
    });
    expect(screen.getByText("Vendor")).toBeInTheDocument();
    expect(screen.getByText("Acme Cement")).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("Metro Phase 2")).toBeInTheDocument();
  });

  it("renders the line table header and rows from the columns", () => {
    setup({
      lines: [
        { name: "Cement", qty: 10 },
        { name: "Steel", qty: 5 },
      ],
    });
    expect(screen.getByText("Material")).toBeInTheDocument();
    expect(screen.getByText("Qty")).toBeInTheDocument();
    expect(screen.getByText("Cement")).toBeInTheDocument();
    expect(screen.getByText("Steel")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("renders the empty-state row when there are no lines", () => {
    setup({ lines: [] });
    expect(screen.getByText(/no line items/i)).toBeInTheDocument();
  });

  it("renders actions and footer when provided", () => {
    setup({
      actions: <button type="button">Submit</button>,
      footer: <div>Footer content</div>,
    });
    expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument();
    expect(screen.getByText("Footer content")).toBeInTheDocument();
  });
});
