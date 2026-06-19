// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { TestProviders } from "../helpers/TestProviders";

// vi.mock factories are hoisted above all imports, so any variables they
// reference must be created with vi.hoisted (also hoisted) to avoid a
// temporal-dead-zone "cannot access before initialization" error.
const { canMock, toastSuccess, toastError } = vi.hoisted(() => ({
  canMock: vi.fn((_: string | string[]) => true),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

// usePermissions hits /api/me via React Query — mock it so we control the
// `can()` gate and isLoading flag directly.
vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({ can: canMock, isLoading: false }),
}));

// toast emits a side-effect; stub it so we can assert success/error calls.
vi.mock("@/lib/toast", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

import { ApprovalActionBar } from "@/components/ApprovalActionBar";

function setup(overrides: Partial<React.ComponentProps<typeof ApprovalActionBar>> = {}) {
  render(
    <ApprovalActionBar
      entityType="mr"
      entityId="mr-1"
      currentStatus="pending_approval"
      requiredPermission="purchase.mr.approve"
      actionEndpoint="/api/purchase/requisitions/mr-1/approve"
      {...overrides}
    />,
    { wrapper: TestProviders },
  );
}

function mockFetch(data: unknown, ok = true, status = 200) {
  const fetchSpy = vi.fn(async () => ({
    ok,
    status,
    json: async () => data,
  })) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

describe("ApprovalActionBar", () => {
  beforeEach(() => {
    canMock.mockReturnValue(true);
    toastSuccess.mockClear();
    toastError.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the three action buttons when actionable and permitted", () => {
    mockFetch({ ok: true });
    setup();
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /return/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
  });

  it("renders nothing when the user lacks the required permission", () => {
    canMock.mockReturnValue(false);
    mockFetch({ ok: true });
    const { container } = render(
      <ApprovalActionBar
        entityType="mr"
        entityId="mr-1"
        currentStatus="pending_approval"
        requiredPermission="purchase.mr.approve"
        actionEndpoint="/x"
      />,
      { wrapper: TestProviders },
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the status is not actionable", () => {
    mockFetch({ ok: true });
    const { container } = render(
      <ApprovalActionBar
        entityType="mr"
        entityId="mr-1"
        currentStatus="draft"
        requiredPermission="purchase.mr.approve"
        actionEndpoint="/x"
      />,
      { wrapper: TestProviders },
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when hidden is explicitly true", () => {
    mockFetch({ ok: true });
    const { container } = render(
      <ApprovalActionBar
        entityType="mr"
        entityId="mr-1"
        currentStatus="pending_approval"
        requiredPermission="purchase.mr.approve"
        actionEndpoint="/x"
        hidden
      />,
      { wrapper: TestProviders },
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("POSTs approve immediately (no comment modal) and toasts success", async () => {
    const fetchSpy = mockFetch({ ok: true });
    const onSuccess = vi.fn();
    setup({ onSuccess });
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalled());

    const [url, init] = (fetchSpy as any).mock.calls[0];
    expect(url).toBe("/api/purchase/requisitions/mr-1/approve");
    expect(JSON.parse(init.body).action).toBe("approve");
    expect(onSuccess).toHaveBeenCalledWith("approve");
  });

  it("opens a comment modal for Return and requires a comment", async () => {
    const fetchSpy = mockFetch({ ok: true });
    setup();
    fireEvent.click(screen.getByRole("button", { name: /return/i }));
    // Modal heading appears
    expect(await screen.findByText(/return for revision/i)).toBeInTheDocument();

    // Confirm without a comment → inline validation, no fetch. Scope to the
    // dialog so we don't match the action-bar's own "Return" button.
    const dialog = screen.getByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: /^return$/i });
    fireEvent.click(confirm);
    // The validation message surfaces in the modal helper text (and the
    // action-bar alert), so there may be more than one node.
    expect((await screen.findAllByText(/add a comment before continuing/i)).length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("submits Reject with a comment in the POST body", async () => {
    const fetchSpy = mockFetch({ ok: true });
    setup();
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    const textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Wrong spec" } });
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^reject$/i }));

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = JSON.parse((fetchSpy as any).mock.calls[0][1].body);
    expect(body.action).toBe("reject");
    expect(body.comments).toBe("Wrong spec");
  });

  it("surfaces a 409 conflict error from the server", async () => {
    mockFetch({ error: "Already acted on" }, false, 409);
    setup();
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledWith("Already acted on"));
    expect(screen.getByRole("alert")).toHaveTextContent("Already acted on");
  });

  it("disables the Approve button when approveDisabled is set", () => {
    mockFetch({ ok: true });
    setup({ approveDisabled: true, approveDisabledReason: "Pick a location first" });
    expect(screen.getByRole("button", { name: /approve/i })).toBeDisabled();
  });

  it("honours custom action labels", () => {
    mockFetch({ ok: true });
    setup({ labels: { approve: "Sanction", reject: "Decline", return: "Send back" } });
    expect(screen.getByRole("button", { name: /sanction/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /decline/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send back/i })).toBeInTheDocument();
  });
});
