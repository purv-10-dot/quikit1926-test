// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { renderGrnLine } from "@/components/GrnLineRow";

// GrnLineRow exports a render FUNCTION (`renderGrnLine`) that returns the
// inner content of a GRN line (a <div>, not a <tr>). The QuickCreateDrawer
// drops it inside a table cell, so we mirror that here to keep the markup
// valid.
function setup(line: Record<string, any> = {}) {
  const update = vi.fn();
  render(
    <table>
      <tbody>
        <tr>
          <td>{renderGrnLine(line, update)}</td>
        </tr>
      </tbody>
    </table>,
  );
  return { update };
}

describe("renderGrnLine (GRN line row)", () => {
  it("renders the material name and UOM chip", () => {
    setup({ itemName: "TMT Steel Bar", uomCode: "kg" });
    expect(screen.getByText("TMT Steel Bar")).toBeInTheDocument();
    // UOM is uppercased
    expect(screen.getByText("KG")).toBeInTheDocument();
  });

  it("renders the read-only reference tiles (PO Qty / Prev. Rcvd / Pending)", () => {
    setup({ itemName: "Cement", poQty: "100", prevRcvd: "30" });
    expect(screen.getByText("PO Qty")).toBeInTheDocument();
    expect(screen.getByText("Prev. Rcvd")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    // pending = 100 - 30 = 70
    expect(screen.getByText("70")).toBeInTheDocument();
  });

  it("fires update with the new value when Received changes", () => {
    const { update } = setup({ itemName: "Sand", poQty: "50" });
    // Received is the first number input; Rejected is the second (both
    // share placeholder "0").
    const numberInputs = document.querySelectorAll('input[type="number"]');
    fireEvent.change(numberInputs[0] as HTMLInputElement, { target: { value: "20" } });
    expect(update).toHaveBeenCalledWith({ receivedQty: "20" });
  });

  it("fires update for the Rejected input", () => {
    const { update } = setup({ itemName: "Sand", poQty: "50" });
    const numberInputs = document.querySelectorAll('input[type="number"]');
    fireEvent.change(numberInputs[1] as HTMLInputElement, { target: { value: "5" } });
    expect(update).toHaveBeenCalledWith({ rejectedQty: "5" });
  });

  it("computes Accepted = received - rejected", () => {
    // received 40, rejected 10 → accepted 30
    setup({ itemName: "Aggregate", poQty: "100", receivedQty: "40", rejectedQty: "10" });
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("shows a shortage warning when short-received", () => {
    // pending = 100, accepted = 20 → short by 80
    setup({ itemName: "Bricks", uomCode: "nos", poQty: "100", receivedQty: "20" });
    expect(screen.getByText(/Short by 80/i)).toBeInTheDocument();
  });

  it("shows a 'Fully received' badge when accepted covers pending", () => {
    // pending 50, received 50, rejected 0 → fully accepted
    setup({ itemName: "Pipes", poQty: "50", receivedQty: "50" });
    expect(screen.getByText(/Fully received/i)).toBeInTheDocument();
  });

  it("fires update for the Condition select", () => {
    const { update } = setup({ itemName: "Glass" });
    const select = screen.getByDisplayValue("Good");
    fireEvent.change(select, { target: { value: "Damaged" } });
    expect(update).toHaveBeenCalledWith({ condition: "Damaged" });
  });

  it("fires update for the Rejected, Batch, Test Cert and Remarks inputs", () => {
    const { update } = setup({ itemName: "Tiles" });
    fireEvent.change(screen.getByPlaceholderText("Batch / Heat No."), {
      target: { value: "B-77" },
    });
    expect(update).toHaveBeenCalledWith({ batchNo: "B-77" });

    fireEvent.change(screen.getByPlaceholderText("Certificate / report reference"), {
      target: { value: "TC-9" },
    });
    expect(update).toHaveBeenCalledWith({ testCertRef: "TC-9" });

    fireEvent.change(
      screen.getByPlaceholderText("Inspection notes, deviations, damage details…"),
      { target: { value: "ok" } },
    );
    expect(update).toHaveBeenCalledWith({ remarks: "ok" });
  });

  it("falls back to an em-dash when no material name is given", () => {
    setup({});
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
