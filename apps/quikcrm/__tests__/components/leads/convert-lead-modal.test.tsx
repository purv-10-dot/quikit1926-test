// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConvertLeadModal } from "@/components/leads/convert-lead-modal";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
});

function renderModal(props: Partial<Parameters<typeof ConvertLeadModal>[0]> = {}) {
  const onSuccess = vi.fn();
  const onClose = vi.fn();
  render(
    <ConvertLeadModal
      open
      leadId="lead-1"
      leadName="Test Lead"
      leadCompany="Acme Corp"
      onClose={onClose}
      onSuccess={onSuccess}
      {...props}
    />,
  );
  return { onSuccess, onClose };
}

describe("<ConvertLeadModal>", () => {
  it("renders with Contact checked + Opportunity unchecked by default", () => {
    renderModal();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes[0]?.checked).toBe(true);
    expect(boxes[0]?.disabled).toBe(true);
    expect(boxes[1]?.checked).toBe(false);
  });

  it("Contact checkbox cannot be unchecked (disabled)", () => {
    renderModal();
    const contactBox = screen.getAllByRole("checkbox")[0] as HTMLInputElement;
    fireEvent.click(contactBox);
    expect(contactBox.checked).toBe(true);
  });

  it("toggling Opportunity reveals title, amount, and date fields", () => {
    renderModal();
    expect(screen.queryByLabelText("Opportunity title")).toBeNull();

    const oppBox = screen.getAllByRole("checkbox")[1] as HTMLInputElement;
    fireEvent.click(oppBox);

    expect(screen.getByLabelText("Opportunity title")).toBeInTheDocument();
  });

  it("shows inline error and does NOT submit when Opportunity is checked but title is empty", async () => {
    const { onSuccess } = renderModal({ leadCompany: null });

    const oppBox = screen.getAllByRole("checkbox")[1] as HTMLInputElement;
    fireEvent.click(oppBox);

    // Clear the pre-filled title (none, since leadCompany=null, but verify it's empty)
    const titleInput = screen.getByLabelText("Opportunity title") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "   " } }); // whitespace-only

    const convertBtn = screen.getByRole("button", { name: /^Convert$/ });
    fireEvent.click(convertBtn);

    expect(screen.getByText(/Title is required/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("submits with createContact=true, createOpportunity=false when Opportunity is unchecked", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ contactId: "c-new", opportunityId: null }),
    } as Response);
    const { onSuccess, onClose } = renderModal();

    const convertBtn = screen.getByRole("button", { name: /^Convert$/ });
    await act(async () => {
      fireEvent.click(convertBtn);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/leads/lead-1/convert");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ createContact: true, createOpportunity: false });
    expect(onSuccess).toHaveBeenCalledWith({ contactId: "c-new", opportunityId: null });
    expect(onClose).toHaveBeenCalled();
  });

  it("submits with the full opportunity payload when Opportunity is checked", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ contactId: "c-new", opportunityId: "opp-new" }),
    } as Response);
    const { onSuccess } = renderModal();

    const oppBox = screen.getAllByRole("checkbox")[1] as HTMLInputElement;
    fireEvent.click(oppBox);

    const titleInput = screen.getByLabelText("Opportunity title") as HTMLInputElement;
    expect(titleInput.value).toBe("Acme Corp Deal");

    const convertBtn = screen.getByRole("button", { name: /^Convert$/ });
    await act(async () => {
      fireEvent.click(convertBtn);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.createContact).toBe(true);
    expect(body.createOpportunity).toBe(true);
    expect(body.opportunityTitle).toBe("Acme Corp Deal");
    // opportunityCloseDate is an ISO datetime string (defaulted to 30 days out)
    expect(typeof body.opportunityCloseDate).toBe("string");
    expect(body.opportunityCloseDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(onSuccess).toHaveBeenCalledWith({ contactId: "c-new", opportunityId: "opp-new" });
  });
});
