// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CreateOpportunityModal } from "@/components/opportunities/create-opportunity-modal";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
});

function renderModal(props: Partial<Parameters<typeof CreateOpportunityModal>[0]> = {}) {
  const onSuccess = vi.fn();
  const onClose = vi.fn();
  render(
    <CreateOpportunityModal
      open
      contactId="c1"
      contactFullName="Jane Doe"
      accountId="acc-1"
      accountName="Acme Corp"
      onClose={onClose}
      onSuccess={onSuccess}
      {...props}
    />,
  );
  return { onSuccess, onClose };
}

describe("<CreateOpportunityModal>", () => {
  it("pre-fills the title from accountName + ' Deal'", () => {
    renderModal();
    const titleInput = screen.getByLabelText("Opportunity title") as HTMLInputElement;
    expect(titleInput.value).toBe("Acme Corp Deal");
  });

  it("shows inline error when submitted with empty title", () => {
    const { onSuccess } = renderModal({ accountName: "" });
    const titleInput = screen.getByLabelText("Opportunity title") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: /^Create opportunity$/ }));
    expect(screen.getByText(/Title is required/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("defaults stage to Prospecting", () => {
    renderModal();
    const stageSelect = screen.getByRole("combobox") as HTMLSelectElement;
    expect(stageSelect.value).toBe("Prospecting");
  });

  it("defaults close date to roughly 30 days from now", () => {
    renderModal();
    // DateInput renders as <input type="date" /> internally.
    const dateInputs = document
      .querySelectorAll<HTMLInputElement>("input[type=date]");
    expect(dateInputs.length).toBeGreaterThan(0);
    const v = dateInputs[0]!.value; // YYYY-MM-DD
    expect(v).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const days = Math.round(
      (new Date(v).getTime() - new Date(new Date().toDateString()).getTime()) /
        86400000,
    );
    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(31);
  });

  it("submits with the expected payload on valid title", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { opportunityId: "opp-9" } }),
    } as Response);
    const { onSuccess } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: /^Create opportunity$/ }));
    await act(async () => {
      // let the fetch microtask resolve
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/contacts/c1/opportunities");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.title).toBe("Acme Corp Deal");
    expect(body.stage).toBe("Prospecting");
    // closeDate present as ISO datetime string
    expect(typeof body.closeDate).toBe("string");
    expect(body.closeDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(onSuccess).toHaveBeenCalledWith({ opportunityId: "opp-9" });
  });
});
