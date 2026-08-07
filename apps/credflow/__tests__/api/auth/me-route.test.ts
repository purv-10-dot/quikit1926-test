import { describe, expect, it, beforeEach, vi } from "vitest";
import { getServerSession } from "next-auth";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/services/profile/me-profile", () => ({
  updateMeProfile: vi.fn(),
}));

vi.mock("@/lib/services/profile/agent-phone", () => ({
  getAgentPhoneForUser: vi.fn(),
}));

const getSession = vi.mocked(getServerSession);
const updateMeProfile = vi.mocked(
  (await import("@/lib/services/profile/me-profile")).updateMeProfile,
);
const getAgentPhoneForUser = vi.mocked(
  (await import("@/lib/services/profile/agent-phone")).getAgentPhoneForUser,
);

function authedSession() {
  getSession.mockResolvedValue({
    user: {
      id: "u1",
      orgId: "t1",
      membershipRole: "admin",
      email: "admin@test.co",
    },
  } as never);
}

describe("PATCH /api/auth/me", () => {
  beforeEach(() => {
    getSession.mockReset();
    updateMeProfile.mockReset();
    getAgentPhoneForUser.mockReset();
    getSession.mockResolvedValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { PATCH } = await import("@/app/api/auth/me/route");
    const res = await PATCH(
      new Request("http://test/api/auth/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstName: "A", lastName: "B" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on validation failure", async () => {
    authedSession();
    const { PATCH } = await import("@/app/api/auth/me/route");
    const res = await PATCH(
      new Request("http://test/api/auth/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstName: "", lastName: "User", phone: "123" }),
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.errors?.firstName ?? json.errors?.phone).toBeDefined();
  });

  it("updates profile and returns telephony result", async () => {
    authedSession();
    updateMeProfile.mockResolvedValue({
      profile: {
        id: "u1",
        firstName: "Admin",
        lastName: "User",
        email: "admin@test.co",
      },
      telephony: { registered: true, message: "Member added" },
    });
    getAgentPhoneForUser.mockResolvedValue("7024324880");

    const { PATCH } = await import("@/app/api/auth/me/route");
    const res = await PATCH(
      new Request("http://test/api/auth/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: "Admin",
          lastName: "User",
          phone: "7024324880",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user).toMatchObject({
      id: "u1",
      orgId: "t1",
      firstName: "Admin",
      lastName: "User",
      phone: "7024324880",
      role: "Administrator",
    });
    expect(json.telephony?.registered).toBe(true);
    expect(updateMeProfile).toHaveBeenCalledWith({
      userId: "u1",
      orgId: "t1",
      firstName: "Admin",
      lastName: "User",
      phone: "7024324880",
    });
  });
});
