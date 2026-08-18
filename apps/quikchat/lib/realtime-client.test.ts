import { beforeEach, describe, expect, it, vi } from "vitest";

const ioSpy = vi.fn();
vi.mock("socket.io-client", () => ({
  io: (...args: unknown[]) => {
    ioSpy(...args);
    return { on: vi.fn(), off: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };
  },
}));

import { createRealtimeClient } from "./realtime-client";

beforeEach(() => {
  ioSpy.mockClear();
});

describe("createRealtimeClient", () => {
  it("connects websocket-only, skipping the polling handshake", () => {
    createRealtimeClient({ url: "http://rt", getToken: async () => "t" });

    expect(ioSpy).toHaveBeenCalledTimes(1);
    const [url, options] = ioSpy.mock.calls[0] as [string, { transports: string[] }];
    expect(url).toBe("http://rt");
    expect(options.transports).toEqual(["websocket"]);
  });
});
