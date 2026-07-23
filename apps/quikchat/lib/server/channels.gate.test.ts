import { describe, it, expect, beforeEach, vi } from "vitest";
// Registers vi.mock for "@/lib/db" + "@quikit/database" (hoisted).
import { mockDb, resetMockDb } from "../../__tests__/helpers/mockDb";

// Mock the RBAC gate so we can drive allow/deny deterministically. The service
// under test imports `userCan` from here.
vi.mock("@/lib/authz/permissions", () => ({ userCan: vi.fn() }));
import { userCan } from "@/lib/authz/permissions";
import {
  create,
  findOrCreateAiChat,
  requireChannelAdminOrModerator,
} from "./channels.service";

const ctx = { userId: "u1", orgId: "org-1" };
const mockUserCan = vi.mocked(userCan);

beforeEach(() => {
  resetMockDb();
  mockUserCan.mockReset();
});

describe("create() RBAC gate", () => {
  it("denies group creation without Channel:create", async () => {
    mockUserCan.mockResolvedValue(false);
    await expect(create(ctx, { type: "group", name: "x" })).rejects.toThrow(/permission/i);
    expect(mockUserCan).toHaveBeenCalledWith("u1", "org-1", "Channel", "create");
  });

  it("denies PUBLIC group creation when Channel.Public:create is missing", async () => {
    // Channel:create granted, Channel.Public:create denied.
    mockUserCan.mockImplementation(async (_u, _o, resource) => resource === "Channel");
    await expect(
      create(ctx, { type: "group", visibility: "public", name: "general" }),
    ).rejects.toThrow(/public/i);
    expect(mockUserCan).toHaveBeenCalledWith("u1", "org-1", "Channel.Public", "create");
  });

  it("denies DM creation without Channel.DM:create", async () => {
    mockDb.qcChannelMember.findMany.mockResolvedValue([] as never); // no existing DM
    mockUserCan.mockResolvedValue(false);
    await expect(create(ctx, { type: "dm", memberIds: ["u2"] })).rejects.toThrow(/permission/i);
    expect(mockUserCan).toHaveBeenCalledWith("u1", "org-1", "Channel.DM", "create");
  });
});

describe("findOrCreateAiChat() RBAC gate", () => {
  it("denies (bars Guests) without Assistant:create", async () => {
    mockUserCan.mockResolvedValue(false);
    await expect(findOrCreateAiChat(ctx)).rejects.toThrow(/assistant/i);
    expect(mockUserCan).toHaveBeenCalledWith("u1", "org-1", "Assistant", "create");
  });
});

describe("requireChannelAdminOrModerator", () => {
  const member = (role: string) =>
    ({
      id: "m1",
      orgId: "org-1",
      channelId: "c1",
      userId: "u1",
      role,
      isPinned: false,
      lastReadAt: null,
      lastDeliveredAt: null,
      joinedAt: new Date(),
    }) as never;

  it("passes a channel-admin without consulting userCan", async () => {
    mockDb.qcChannelMember.findUnique.mockResolvedValue(member("admin"));
    await expect(requireChannelAdminOrModerator(ctx, "c1", "update")).resolves.toBeTruthy();
    expect(mockUserCan).not.toHaveBeenCalled();
  });

  it("passes a non-admin who holds the Channel.Moderate grant", async () => {
    mockDb.qcChannelMember.findUnique.mockResolvedValue(member("member"));
    mockUserCan.mockResolvedValue(true);
    await expect(requireChannelAdminOrModerator(ctx, "c1", "delete")).resolves.toBeTruthy();
    expect(mockUserCan).toHaveBeenCalledWith("u1", "org-1", "Channel.Moderate", "delete");
  });

  it("denies a plain member without the moderate grant", async () => {
    mockDb.qcChannelMember.findUnique.mockResolvedValue(member("member"));
    mockUserCan.mockResolvedValue(false);
    await expect(requireChannelAdminOrModerator(ctx, "c1", "update")).rejects.toThrow(
      /admins or moderators/i,
    );
  });

  it("denies a non-member (no channel membership)", async () => {
    mockDb.qcChannelMember.findUnique.mockResolvedValue(null as never);
    await expect(requireChannelAdminOrModerator(ctx, "c1", "update")).rejects.toThrow(
      /not a member/i,
    );
  });
});
