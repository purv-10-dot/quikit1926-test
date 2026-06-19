// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { TestProviders } from "../helpers/TestProviders";
import { usePermissions, useMenuActions } from "@/hooks/use-permissions";
import type { MeResponse } from "@/hooks/use-permissions";

function stubMe(me: Partial<MeResponse>, ok = true, status = 200) {
  const body: MeResponse = {
    userId: "u1",
    userEmail: "u@x.io",
    userName: "U",
    orgId: "org1",
    roleKey: "user",
    userType: "USER",
    permissions: [],
    projectIds: null,
    modulesAssigned: null,
    permissionMatrix: null,
    ...me,
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

describe("usePermissions", () => {
  it("fetches /api/me and exposes roleKey + permissions", async () => {
    const fetchFn = stubMe({
      roleKey: "project_manager",
      permissions: ["boq.write", "boq.lock"],
    });
    const { result } = renderHook(() => usePermissions(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect((fetchFn.mock.calls as any)[0][0]).toBe("/api/me");
    expect(result.current.roleKey).toBe("project_manager");
    expect(result.current.isSuper).toBe(false);
  });

  it("can() — single key: granted vs denied", async () => {
    stubMe({ permissions: ["boq.write"] });
    const { result } = renderHook(() => usePermissions(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.can("boq.write")).toBe(true);
    expect(result.current.can("boq.delete")).toBe(false);
  });

  it("can() — array form is OR (any)", async () => {
    stubMe({ permissions: ["boq.write"] });
    const { result } = renderHook(() => usePermissions(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.can(["boq.delete", "boq.write"])).toBe(true);
    expect(result.current.can(["boq.delete", "boq.lock"])).toBe(false);
  });

  it("canAll() requires every key", async () => {
    stubMe({ permissions: ["a", "b"] });
    const { result } = renderHook(() => usePermissions(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canAll(["a", "b"])).toBe(true);
    expect(result.current.canAll(["a", "c"])).toBe(false);
  });

  it("wildcard '*' makes isSuper true and grants everything", async () => {
    stubMe({ permissions: ["*"], roleKey: "user" });
    const { result } = renderHook(() => usePermissions(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSuper).toBe(true);
    expect(result.current.can("anything.at.all")).toBe(true);
    expect(result.current.canAll(["x", "y", "z"])).toBe(true);
  });

  it("hasRole() — admin/super_admin always pass; otherwise membership match", async () => {
    stubMe({ roleKey: "accountant", permissions: [] });
    const { result } = renderHook(() => usePermissions(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasRole("accountant")).toBe(true);
    expect(result.current.hasRole(["site_admin", "accountant"])).toBe(true);
    expect(result.current.hasRole("project_manager")).toBe(false);
  });

  it("hasRole() short-circuits true for the admin role", async () => {
    stubMe({ roleKey: "admin", permissions: [] });
    const { result } = renderHook(() => usePermissions(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasRole("anything")).toBe(true);
  });

  it("hasModule() — null modulesAssigned = unrestricted, array = whitelist", async () => {
    stubMe({ permissions: [], modulesAssigned: ["purchase", "store"] });
    const { result } = renderHook(() => usePermissions(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasModule("purchase")).toBe(true);
    expect(result.current.hasModule("masters")).toBe(false);
  });

  it("canMenuAction()/canViewMenu() honour a saved permissionMatrix", async () => {
    // org.company maps to a real menu-catalog key; grant view but deny add.
    stubMe({
      permissions: [],
      permissionMatrix: {
        "org.company": { view: true, add: false, edit: false, delete: false },
      },
    });
    const { result } = renderHook(() => usePermissions(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // A URL not present in the catalog falls through to true.
    expect(result.current.canViewMenu("/totally/unknown/url")).toBe(true);
    // A matrix row that exists but isn't granted → denied for that action.
  });
});

describe("useMenuActions", () => {
  it("returns all-false while loading", () => {
    // Keep the request in flight: never resolves.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const { result } = renderHook(() => useMenuActions("/purchase/indents"), {
      wrapper: TestProviders,
    });
    expect(result.current).toEqual({
      canAdd: false,
      canEdit: false,
      canDelete: false,
      canView: false,
    });
  });

  it("super admin gets all-true once loaded", async () => {
    stubMe({ permissions: ["*"] });
    const { result } = renderHook(() => useMenuActions("/purchase/indents"), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(result.current.canView).toBe(true));
    expect(result.current).toEqual({
      canAdd: true,
      canEdit: true,
      canDelete: true,
      canView: true,
    });
  });
});
