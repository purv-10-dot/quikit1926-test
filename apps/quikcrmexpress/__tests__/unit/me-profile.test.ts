import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb } from "../helpers/mockDb";

const db = mockDb();

vi.mock("@/lib/services/telephony/india-voice", () => ({
  isConfigured: vi.fn(() => true),
  registerMember: vi.fn(),
}));

const { isConfigured, registerMember } = await import("@/lib/services/telephony/india-voice");

describe("updateMeProfile", () => {
  beforeEach(() => {
    db.user.findUnique.mockReset();
    db.user.update.mockReset();
    db.qceOrgWorkspaceSettings.findUnique.mockReset();
    db.qceOrgWorkspaceSettings.update.mockReset();
    db.qceOrgWorkspaceSettings.create.mockReset();
    vi.mocked(isConfigured).mockReturnValue(true);
    vi.mocked(registerMember).mockReset();
  });

  it("calls addmember_v2 via registerMember when phone is provided", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1" } as never);
    db.user.update.mockResolvedValue({
      id: "u1",
      firstName: "Admin",
      lastName: "User",
      email: "a@test.co",
    } as never);
    db.qceOrgWorkspaceSettings.findUnique.mockResolvedValue(null);
    db.qceOrgWorkspaceSettings.create.mockResolvedValue({} as never);
    vi.mocked(registerMember).mockResolvedValue({
      status: 200,
      type: "success",
      message: "Member added",
      data: {},
      statusSync: { ok: true, status: "Available", message: "Agent status set to Available" },
    });

    const { updateMeProfile } = await import("@/lib/services/profile/me-profile");
    const result = await updateMeProfile({
      userId: "u1",
      orgId: "t1",
      firstName: "Admin",
      lastName: "User",
      phone: "7024324880",
    });

    expect(registerMember).toHaveBeenCalledWith("Admin User", "7024324880");
    expect(result.telephony?.registered).toBe(true);
  });
});
