import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: () => ({
    NODE_ENV: "test",
    RP_DIGITAL_BASE_URL: "https://indiavoice.example.com",
    RP_DIGITAL_AUTHCODE: "test-auth",
    RP_DIGITAL_BASIC_USER: "",
    RP_DIGITAL_BASIC_PASSWORD: "",
    RP_DIGITAL_DESKPHONE: "919999999999",
    RP_DIGITAL_CALLING_PARTY_A: "",
    RP_DIGITAL_CALL_FROM_DID: "1",
    RP_DIGITAL_WAITTIME: 30,
    RP_DIGITAL_CALL_LIMIT: "1",
    RP_DIGITAL_UID: "1",
    RP_DIGITAL_HTTP_TIMEOUT_MS: 5000,
    RP_DIGITAL_WORKING_STATUS_DIRECTION: "IVR",
  }),
}));

const fetchMock = vi.fn();

describe("india-voice working status", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("memberNumVariants includes leading-zero Indian format", async () => {
    const { memberNumVariants } = await import("@/lib/services/telephony/india-voice");
    expect(memberNumVariants("8120833324")).toContain("8120833324");
    expect(memberNumVariants("8120833324")).toContain("08120833324");
  });

  it("findProviderMemberNum matches by last 10 digits", async () => {
    const { findProviderMemberNum } = await import("@/lib/services/telephony/india-voice");
    const num = findProviderMemberNum("8120833324", [
      { member_name: "A", member_num: "08120833324", status: "1" },
    ]);
    expect(num).toBe("08120833324");
  });

  it("updateWorkingStatus uses working_status and direction (not status or deskphone)", async () => {
    // setAgentAvailable first fetches the member list (to resolve the provider
    // member_num), then issues the update-working-status call. Stub both, and
    // locate the update call by URL rather than assuming it is fetch #0.
    fetchMock
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ getmember: [{ member_name: "A", member_num: "08120833324" }] }),
      })
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ type: "success", message: "Working Status Updated Successfully." }),
      });

    const { setAgentAvailable } = await import("@/lib/services/telephony/india-voice");
    const result = await setAgentAvailable("8120833324");

    expect(result.ok).toBe(true);
    const updateUrl = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .find((u) => u.includes("/api_v3/update-working-status-v2"));
    expect(updateUrl, "expected an update-working-status-v2 call").toBeDefined();
    expect(updateUrl).toContain("working_status=Ready");
    expect(updateUrl).toContain("direction=IVR");
    expect(updateUrl).toContain("member_num=");
    expect(updateUrl).not.toContain("status=Available");
    expect(updateUrl).not.toContain("deskphone=");
  });

  it("setAgentAvailable retries next phone variant when Ready returns Invalid Parameter", async () => {
    fetchMock
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ getmember: [{ member_name: "A", member_num: "08120833324" }] }),
      })
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ type: "error", message: "Invalid Parameter value." }),
      })
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ type: "success", message: "Working Status Updated Successfully." }),
      });

    const { setAgentAvailable } = await import("@/lib/services/telephony/india-voice");
    const result = await setAgentAvailable("8120833324");
    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("registerMember sets working status after addmember success", async () => {
    fetchMock
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ type: "success", message: "Member added" }),
      })
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ getmember: [] }),
      })
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ type: "success", message: "Working Status Updated Successfully." }),
      });

    const { registerMember } = await import("@/lib/services/telephony/india-voice");
    const result = await registerMember("Test Agent", "8120833324");

    expect(result.workingStatus?.ok).toBe(true);
  });
});
