import { describe, expect, it, vi, beforeEach } from "vitest";
import { StubIceConfigProvider } from "./ice-provider.stub";
import { RealIceConfigProvider, turnConfigFromEnv } from "./ice-provider.real";
import { selectIceMode } from "./ice-provider";
import { getIceConfigProvider, __resetIceConfigForTest } from "./ice-index";

beforeEach(() => {
  __resetIceConfigForTest();
});

describe("StubIceConfigProvider", () => {
  it("returns Google STUN servers", async () => {
    const provider = new StubIceConfigProvider();
    const config = await provider.getIceConfig();

    expect(config.iceServers).toHaveLength(2);
    expect(config.iceServers[0]!.urls).toContain("stun.l.google.com");
    expect(config.iceServers[1]!.urls).toContain("stun1.l.google.com");
  });
});

describe("RealIceConfigProvider", () => {
  it("returns TURN credentials from env when METERED_API_KEY is unset", async () => {
    const savedKey = process.env.METERED_API_KEY;
    delete process.env.METERED_API_KEY;
    process.env.TURN_URLS = "turn:server:3478";
    process.env.TURN_USERNAME = "user";
    process.env.TURN_CREDENTIAL = "pass";

    const provider = new RealIceConfigProvider();
    const config = await provider.getIceConfig();

    expect(config.iceServers).toHaveLength(1);
    expect(config.iceServers[0]!.urls).toEqual(["turn:server:3478"]);
    expect(config.iceServers[0]!.username).toBe("user");
    expect(config.iceServers[0]!.credential).toBe("pass");

    delete process.env.TURN_URLS;
    delete process.env.TURN_USERNAME;
    delete process.env.TURN_CREDENTIAL;
    if (savedKey) process.env.METERED_API_KEY = savedKey;
  });

  it("fetches credentials from Metered API when METERED_API_KEY is set", async () => {
    const savedKey = process.env.METERED_API_KEY;
    process.env.METERED_API_KEY = "test-api-key";

    const mockResponse = [
      {
        urls: ["turn:global.relay.metered.ca:80"],
        username: "test-user",
        credential: "test-pass",
      },
    ];

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const provider = new RealIceConfigProvider();
    const config = await provider.getIceConfig();

    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("apiKey=test-api-key"));
    expect(config.iceServers).toHaveLength(1);
    expect(config.iceServers[0]!.urls).toEqual(["turn:global.relay.metered.ca:80"]);
    expect(config.iceServers[0]!.username).toBe("test-user");
    expect(config.iceServers[0]!.credential).toBe("test-pass");

    fetchSpy.mockRestore();
    if (savedKey) process.env.METERED_API_KEY = savedKey;
    else delete process.env.METERED_API_KEY;
  });
});

describe("turnConfigFromEnv", () => {
  it("returns null when TURN_URLS is missing", () => {
    expect(turnConfigFromEnv({})).toBeNull();
  });

  it("returns null when TURN_USERNAME is missing", () => {
    expect(turnConfigFromEnv({ TURN_URLS: "turn:server:3478" })).toBeNull();
  });

  it("returns config when all required env vars are set", () => {
    const result = turnConfigFromEnv({
      TURN_URLS: "turn:server:3478",
      TURN_USERNAME: "user",
      TURN_CREDENTIAL: "pass",
    });
    expect(result).toEqual({
      urls: ["turn:server:3478"],
      username: "user",
      credential: "pass",
    });
  });

  it("parses comma-separated URLs", () => {
    const result = turnConfigFromEnv({
      TURN_URLS: "turn:server1:3478, turn:server2:3478",
      TURN_USERNAME: "user",
      TURN_CREDENTIAL: "pass",
    });
    expect(result?.urls).toEqual(["turn:server1:3478", "turn:server2:3478"]);
  });
});

describe("selectIceMode", () => {
  it("returns stub by default", () => {
    expect(selectIceMode({})).toEqual({ mode: "stub" });
  });

  it("returns real when ICE_MODE=real and TURN_URLS set", () => {
    expect(selectIceMode({ ICE_MODE: "real", TURN_URLS: "turn:server:3478" })).toEqual({
      mode: "real",
    });
  });

  it("falls back to stub with warning when ICE_MODE=real but TURN_URLS missing", () => {
    const result = selectIceMode({ ICE_MODE: "real" });
    expect(result.mode).toBe("stub");
    expect(result.warning).toContain("TURN_URLS");
  });
});

describe("getIceConfigProvider", () => {
  it("returns stub provider by default", () => {
    const provider = getIceConfigProvider();
    expect(provider).toBeInstanceOf(StubIceConfigProvider);
  });

  it("caches the provider", () => {
    const p1 = getIceConfigProvider();
    const p2 = getIceConfigProvider();
    expect(p1).toBe(p2);
  });

  it("returns real provider when ICE_MODE=real", () => {
    process.env.ICE_MODE = "real";
    process.env.TURN_URLS = "turn:server:3478";
    process.env.TURN_USERNAME = "user";
    process.env.TURN_CREDENTIAL = "pass";

    __resetIceConfigForTest();
    const provider = getIceConfigProvider();
    expect(provider).toBeInstanceOf(RealIceConfigProvider);

    delete process.env.ICE_MODE;
    delete process.env.TURN_URLS;
    delete process.env.TURN_USERNAME;
    delete process.env.TURN_CREDENTIAL;
  });
});
