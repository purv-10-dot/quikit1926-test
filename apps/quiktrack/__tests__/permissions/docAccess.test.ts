import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import {
  mostPermissiveRole,
  canEditDocRole,
  resolveDocAccess,
  type DocForAccess,
} from "@/lib/api/docAccess";

const USER = "user_1";
const ORG = "org_1";

beforeEach(() => resetMockDb());

const publishedDoc = (createdBy: string | null): DocForAccess => ({
  id: "doc_1",
  projectId: "proj_1",
  createdBy,
  status: "published",
});
const draftDoc = (createdBy: string | null): DocForAccess => ({
  ...publishedDoc(createdBy),
  status: "draft",
});

// Make hasAdminAccess() resolve to false for the acting user.
function asNonAdmin() {
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
  mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
  mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
}

describe("mostPermissiveRole (Owner > Editor > Viewer)", () => {
  it("returns null when there are no roles", () => {
    expect(mostPermissiveRole([])).toBeNull();
    expect(mostPermissiveRole([null, undefined])).toBeNull();
  });
  it("returns the single role", () => {
    expect(mostPermissiveRole(["viewer"])).toBe("viewer");
  });
  it("project viewer + explicit editor => Editor", () => {
    expect(mostPermissiveRole(["viewer", "editor"])).toBe("editor");
  });
  it("editor + owner => Owner", () => {
    expect(mostPermissiveRole(["editor", "owner"])).toBe("owner");
  });
  it("ignores null/undefined entries", () => {
    expect(mostPermissiveRole([null, "viewer", undefined])).toBe("viewer");
  });
});

describe("canEditDocRole", () => {
  it("owner/editor can edit; viewer/none cannot", () => {
    expect(canEditDocRole("owner")).toBe(true);
    expect(canEditDocRole("editor")).toBe(true);
    expect(canEditDocRole("viewer")).toBe(false);
    expect(canEditDocRole(null)).toBe(false);
  });
});

describe("resolveDocAccess", () => {
  it("the creator is Owner", async () => {
    expect(await resolveDocAccess(USER, ORG, publishedDoc(USER))).toBe("owner");
  });

  it("an org admin is Owner on someone else's doc", async () => {
    // org "owner" tier short-circuits hasAdminAccess → owner.
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    expect(await resolveDocAccess(USER, ORG, publishedDoc("other"))).toBe("owner");
  });

  it("an explicit editor share grants Editor — even on a draft", async () => {
    asNonAdmin();
    mockDb.$queryRaw.mockResolvedValue([{ role: "editor" }] as never); // getDocShareRole
    expect(await resolveDocAccess(USER, ORG, draftDoc("other"))).toBe("editor");
  });

  it("a draft is hidden from a non-owner with no share", async () => {
    asNonAdmin();
    mockDb.$queryRaw.mockResolvedValue([] as never); // no explicit share
    expect(await resolveDocAccess(USER, ORG, draftDoc("other"))).toBeNull();
  });
});
