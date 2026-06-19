// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { TestProviders } from "../helpers/TestProviders";
import { useMyPermissions } from "@/hooks/useMyPermissions";

/** Wrap a payload in the `{ success, data }` envelope the hook expects. */
function stubPerms(
  data: {
    isAdmin?: boolean;
    roleId?: string | null;
    roleName?: string | null;
    permissions?: string[];
    extras?: string[];
  },
  ok = true,
  status = 200,
) {
  const body = {
    success: true,
    data: {
      isAdmin: false,
      roleId: null,
      roleName: null,
      permissions: [],
      extras: [],
      ...data,
    },
  };
  const fn = vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("useMyPermissions", () => {
  it("fetches /api/me/permissions and unwraps the success envelope", async () => {
    const fetchFn = stubPerms({
      isAdmin: false,
      roleName: "Project Manager",
      roleId: "r1",
      permissions: ["boq:write", "po:approve"],
    });
    const { result } = renderHook(() => useMyPermissions(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect((fetchFn.mock.calls as any)[0][0]).toBe("/api/me/permissions");
    expect(result.current.roleName).toBe("Project Manager");
    expect(result.current.roleId).toBe("r1");
    expect(result.current.permissions).toEqual(["boq:write", "po:approve"]);
  });

  it("has(resource, action) checks the 'resource:action' set", async () => {
    stubPerms({ permissions: ["boq:write", "po:approve"] });
    const { result } = renderHook(() => useMyPermissions(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.has("boq", "write")).toBe(true);
    expect(result.current.has("po", "approve")).toBe(true);
    expect(result.current.has("boq", "delete")).toBe(false);
  });

  it("exposes isAdmin from the payload", async () => {
    stubPerms({ isAdmin: true, permissions: [] });
    const { result } = renderHook(() => useMyPermissions(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAdmin).toBe(true);
  });

  it("fails open (has() returns true) while still loading", () => {
    // Never resolves → query stays in loading state.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const { result } = renderHook(() => useMyPermissions(), { wrapper: TestProviders });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.has("anything", "write")).toBe(true);
  });

  it("surfaces an error when the envelope reports failure", async () => {
    const body = { success: false, error: "nope" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
      })),
    );
    const { result } = renderHook(() => useMyPermissions(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe("nope");
  });
});
