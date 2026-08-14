import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";

vi.mock("next/navigation", () => ({
  useParams: () => ({ callId: "call-1" }),
  useSearchParams: () => new URLSearchParams(""),
}));

// The lifecycle socket is the thing under test; LiveKit is irrelevant here and
// never reached anyway (the generic fetch mock below fails the token fetch).
vi.mock("@/components/calling/LiveKitOneToOneCall", () => ({
  LiveKitOneToOneCall: () => null,
}));
vi.mock("@/components/calling/LiveKitGroupCall", () => ({
  LiveKitGroupCall: () => null,
}));

const ioSpy = vi.fn();
vi.mock("socket.io-client", () => ({
  io: (...args: unknown[]) => {
    ioSpy(...args);
    return { on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };
  },
}));

import CallPage from "./page";

beforeEach(() => {
  ioSpy.mockClear();
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
  })) as unknown as typeof fetch;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("call page lifecycle socket", () => {
  it("connects websocket-only, same as the main realtime client", async () => {
    render(
      <ToastProvider>
        <CallPage />
      </ToastProvider>,
    );

    await waitFor(() => expect(ioSpy).toHaveBeenCalled());
    const [, options] = ioSpy.mock.calls[0] as [string, { transports: string[] }];
    expect(options.transports).toEqual(["websocket"]);
  });
});
