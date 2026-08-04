// @vitest-environment jsdom
/**
 * Call-history quick reply. Scope is only the "Send a quick message" control —
 * the Chat/Org chart/Video/Call buttons beside it are still unwired by design.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui";
import type { CallHistoryItem } from "@/lib/shared";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = {
  fetchCallHistory: vi.fn(),
  createChannel: vi.fn(),
  sendMessage: vi.fn(),
};
vi.mock("@/lib/api", () => ({
  fetchCallHistory: (...a: unknown[]) => api.fetchCallHistory(...a),
  createChannel: (...a: unknown[]) => api.createChannel(...a),
  sendMessage: (...a: unknown[]) => api.sendMessage(...a),
}));

import { CallsModule } from "./CallsModule";

const call = (over: Partial<CallHistoryItem> = {}): CallHistoryItem => ({
  id: "call-1",
  name: "Alice",
  avatarUrl: null,
  direction: "incoming",
  type: "audio",
  isGroup: false,
  startedAt: new Date().toISOString(),
  durationSeconds: 42,
  status: "ended",
  channelId: null,
  otherUserId: "u-alice",
  ...over,
});

function renderCalls() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CallsModule />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Select the first history row so the details pane (and the input) renders. */
async function openFirstCall(name = "Alice") {
  const row = await screen.findByRole("button", { name: new RegExp(name) });
  fireEvent.click(row);
  return screen.getByRole("textbox", { name: "Send a quick message" }) as HTMLInputElement;
}

const sendBtn = () => screen.getByRole("button", { name: "Send" });

beforeEach(() => {
  api.fetchCallHistory.mockReset();
  api.createChannel.mockReset();
  api.sendMessage.mockReset();
  api.fetchCallHistory.mockResolvedValue([call()]);
  api.createChannel.mockResolvedValue({ channelId: "dm-1" });
  api.sendMessage.mockResolvedValue({ id: "m1" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("call-history quick message", () => {
  it("opens (find-or-create) the DM then sends, for a 1:1 call with no channel", async () => {
    renderCalls();
    const input = await openFirstCall();

    fireEvent.change(input, { target: { value: "  missed your call  " } });
    await act(async () => {
      fireEvent.click(sendBtn());
    });

    expect(api.createChannel).toHaveBeenCalledWith({ type: "dm", memberIds: ["u-alice"] });
    expect(api.sendMessage).toHaveBeenCalledWith("dm-1", { content: "missed your call" });
  });

  it("sends straight to the call's own channel without creating a DM", async () => {
    api.fetchCallHistory.mockResolvedValue([call({ channelId: "c-99" })]);
    renderCalls();
    const input = await openFirstCall();

    fireEvent.change(input, { target: { value: "hi" } });
    await act(async () => {
      fireEvent.click(sendBtn());
    });

    expect(api.createChannel).not.toHaveBeenCalled();
    expect(api.sendMessage).toHaveBeenCalledWith("c-99", { content: "hi" });
  });

  it("sends on Enter", async () => {
    renderCalls();
    const input = await openFirstCall();

    fireEvent.change(input, { target: { value: "via enter" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(api.sendMessage).toHaveBeenCalledWith("dm-1", { content: "via enter" });
  });

  it("clears the input and confirms on success", async () => {
    renderCalls();
    const input = await openFirstCall();

    fireEvent.change(input, { target: { value: "done" } });
    await act(async () => {
      fireEvent.click(sendBtn());
    });

    expect(input.value).toBe("");
    expect(await screen.findByText("Message sent")).toBeInTheDocument();
  });

  it("KEEPS the draft and toasts on failure so nothing is lost", async () => {
    api.sendMessage.mockRejectedValue(new Error("network down"));
    renderCalls();
    const input = await openFirstCall();

    fireEvent.change(input, { target: { value: "important draft" } });
    await act(async () => {
      fireEvent.click(sendBtn());
    });

    expect(await screen.findByText("Couldn't send message")).toBeInTheDocument();
    expect(input.value).toBe("important draft");
  });

  it("does not fire twice while a send is in flight", async () => {
    let release: (v: unknown) => void = () => {};
    api.sendMessage.mockImplementation(() => new Promise((res) => (release = res)));
    renderCalls();
    const input = await openFirstCall();
    fireEvent.change(input, { target: { value: "once only" } });

    await act(async () => {
      fireEvent.click(sendBtn());
    });
    // Mid-flight: the control is disabled, and Enter is inert too.
    expect(sendBtn()).toBeDisabled();
    expect(input).toBeDisabled();
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(sendBtn());

    await act(async () => {
      release({ id: "m1" });
    });

    expect(api.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("won't send whitespace only", async () => {
    renderCalls();
    const input = await openFirstCall();

    fireEvent.change(input, { target: { value: "   " } });
    expect(sendBtn()).toBeDisabled();
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it("disables the control when the call has no channel and no other party", async () => {
    // An ad-hoc group call placed outside a channel: nowhere to reply.
    api.fetchCallHistory.mockResolvedValue([
      call({ name: "Group call", isGroup: true, channelId: null, otherUserId: null }),
    ]);
    renderCalls();
    const input = await openFirstCall("Group call");

    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("placeholder", "No conversation for this call");
    expect(sendBtn()).toBeDisabled();
  });

  it("stays in the call-history panel after sending (no navigation)", async () => {
    renderCalls();
    const input = await openFirstCall();
    fireEvent.change(input, { target: { value: "still here" } });

    await act(async () => {
      fireEvent.click(sendBtn());
    });

    await waitFor(() => expect(api.sendMessage).toHaveBeenCalled());
    // The history pane and the same selected call are still on screen — this is an
    // inline quick reply, not a jump into the chat view.
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Send a quick message" })).toBeInTheDocument();
  });
});
