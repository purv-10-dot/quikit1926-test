import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression tests for the "provider returns success but the phone never rings"
 * bug. Root cause: calling_party_a (the agent leg the provider rings FIRST)
 * silently fell back to the outbound DID when no agent number was supplied, so
 * the provider queued a campaign (returned a campid) with a dead agent leg.
 *
 * These tests lock in the fixes:
 *   1. clickToCall throws a 400 when calling_party_a is missing/short instead
 *      of dialing the DID.
 *   2. clickToCall throws a 400 when the agent cannot be set to Ready.
 *   3. On the happy path calling_party_a is the AGENT number and deskphone is
 *      the DID's last-10 — never the same fallback value.
 */

vi.mock("@/lib/env", () => ({
  env: () => ({
    NODE_ENV: "test",
    RP_DIGITAL_BASE_URL: "https://indiavoice.example.com",
    RP_DIGITAL_AUTHCODE: "test-auth",
    RP_DIGITAL_BASIC_USER: "",
    RP_DIGITAL_BASIC_PASSWORD: "",
    RP_DIGITAL_DESKPHONE: "917935486393",
    RP_DIGITAL_CALLING_PARTY_A: "",
    RP_DIGITAL_CALL_FROM_DID: "1",
    RP_DIGITAL_WAITTIME: 30,
    RP_DIGITAL_CALL_LIMIT: "1",
    RP_DIGITAL_UID: "3641",
    RP_DIGITAL_HTTP_TIMEOUT_MS: 5000,
    RP_DIGITAL_WORKING_STATUS_DIRECTION: "IVR",
  }),
}));

const axiosGet = vi.fn();
vi.mock("axios", () => ({
  default: { get: (...args: unknown[]) => axiosGet(...args) },
}));

const fetchMock = vi.fn();

/** Mock the fetch-based working-status calls to always succeed (agent Ready). */
function mockAgentReady() {
  fetchMock.mockImplementation(async () => ({
    status: 200,
    text: async () => JSON.stringify({ type: "success", message: "Working Status Updated Successfully." }),
  }));
}

describe("india-voice clickToCall — agent leg (Party A) guards", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    axiosGet.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("throws a 400 (does NOT call the provider) when Party A is missing", async () => {
    const { clickToCall } = await import("@/lib/services/telephony/india-voice");
    await expect(clickToCall("9876543210")).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/calling_party_a|agent phone number/i),
    });
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it("throws a 400 when Party A has fewer than 10 digits", async () => {
    const { clickToCall } = await import("@/lib/services/telephony/india-voice");
    await expect(clickToCall("9876543210", "1234")).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it("throws a 400 when the agent cannot be set to Ready (no silent success)", async () => {
    // update-working-status-v2 fails for every variant → agent not Ready.
    fetchMock.mockImplementation(async () => ({
      status: 200,
      text: async () => JSON.stringify({ type: "error", message: "Invalid Parameter value." }),
    }));
    const { clickToCall } = await import("@/lib/services/telephony/india-voice");
    await expect(clickToCall("9876543210", "8120833324")).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/ready/i),
    });
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it("on success sends the AGENT as calling_party_a and DID last-10 as deskphone", async () => {
    mockAgentReady();
    axiosGet.mockResolvedValueOnce({
      status: 200,
      data: { type: "success", campid: 5298041, deskphone: "917935486393", message: "Call to Customer Initiate Successfully.." },
    });

    const { clickToCall } = await import("@/lib/services/telephony/india-voice");
    const result = await clickToCall("9876543210", "8120833324");

    expect(result.callSid).toBe("5298041");
    expect(axiosGet).toHaveBeenCalledTimes(1);
    const calledUrl = String(axiosGet.mock.calls[0][0]);
    // Agent leg = the supplied agent number, NOT the DID.
    expect(calledUrl).toContain("calling_party_a=8120833324");
    expect(calledUrl).toContain("calling_party_b=9876543210");
    // Deskphone = DID last-10 only.
    expect(calledUrl).toContain("deskphone=7935486393");
    // The two must never collapse to the same fallback value.
    expect(calledUrl).not.toContain("calling_party_a=7935486393");
  });
});
