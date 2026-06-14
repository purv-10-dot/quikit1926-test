// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkflowConfirmDialog } from "@/components/WorkflowConfirmDialog";

type Props = React.ComponentProps<typeof WorkflowConfirmDialog>;

function setup(overrides: Partial<Props> = {}) {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  const onRejectReasonChange = vi.fn();
  const utils = render(
    <WorkflowConfirmDialog
      action="approve"
      pending={false}
      rejectReason=""
      onRejectReasonChange={onRejectReasonChange}
      onClose={onClose}
      onConfirm={onConfirm}
      entityNoun="Work Order"
      entityLabel="WO-1001"
      {...overrides}
    />,
  );
  return { onClose, onConfirm, onRejectReasonChange, ...utils };
}

describe("WorkflowConfirmDialog", () => {
  it("renders nothing when action is null", () => {
    const { container } = setup({ action: null });
    expect(container).toBeEmptyDOMElement();
  });

  it("submit: shows the submit title, label and entity prompt", () => {
    setup({ action: "submit" });
    expect(
      screen.getByRole("heading", { name: /submit for approval/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^submit$/i })).toBeInTheDocument();
    expect(screen.getByText("WO-1001")).toBeInTheDocument();
  });

  it("approve: shows the approve title and label including the entity noun", () => {
    setup({ action: "approve" });
    expect(
      screen.getByRole("heading", { name: /approve work order/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^approve$/i })).toBeInTheDocument();
  });

  it("reject: shows the reject title, label and a reason textarea", () => {
    setup({ action: "reject" });
    expect(
      screen.getByRole("heading", { name: /reject work order/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reject$/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("reject: does NOT render the textarea for non-reject actions", () => {
    setup({ action: "approve" });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("reject: typing in the textarea fires onRejectReasonChange", () => {
    const { onRejectReasonChange } = setup({ action: "reject" });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Wrong rate" },
    });
    expect(onRejectReasonChange).toHaveBeenCalledWith("Wrong rate");
  });

  it("fires onConfirm when the confirm button is clicked", () => {
    const { onConfirm } = setup({ action: "approve" });
    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("renders a server error banner when error is passed", () => {
    setup({ action: "reject", error: "Approver not configured" });
    expect(screen.getByText("Approver not configured")).toBeInTheDocument();
  });

  it("pending: locks the confirm button into the working state", () => {
    const { onConfirm } = setup({ action: "approve", pending: true });
    const working = screen.getByRole("button", { name: /working/i });
    expect(working).toBeDisabled();
    fireEvent.click(working);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
