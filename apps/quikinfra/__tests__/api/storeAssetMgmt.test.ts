import { describe, it, expect, beforeEach } from "vitest";
import { resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx } from "../setup";
import { NextRequest } from "next/server";
import {
  GET as ASSETS_GET,
  POST as ASSETS_POST,
} from "@/app/api/store/asset-mgmt/assets/route";
import {
  PATCH as ASSET_PATCH,
  DELETE as ASSET_DELETE,
} from "@/app/api/store/asset-mgmt/assets/[id]/route";
import {
  GET as CATS_GET,
  POST as CATS_POST,
} from "@/app/api/store/asset-mgmt/categories/route";
import {
  GET as ISS_GET,
  POST as ISS_POST,
} from "@/app/api/store/asset-mgmt/issuances/route";
import {
  PATCH as ISS_PATCH,
} from "@/app/api/store/asset-mgmt/issuances/[id]/route";
import { getAssets, getCategories, getIssuances } from "@/lib/store/asset-mgmt-store";

function buildGET(path: string, qs = ""): NextRequest {
  return new NextRequest(`http://localhost${path}${qs ? "?" + qs : ""}`, { method: "GET" });
}
function buildBody(path: string, method: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// Asset Mgmt is backed by an in-memory globalThis store, not Prisma.
// Reset it before each test so collections start empty.
beforeEach(() => {
  resetMockDb();
  setContext(null);
  // The store binds its arrays once at import (a `m` reference closed over by
  // the getters), so reassigning globalThis.__qcAssetMgmt would not be seen by
  // the routes. Clear the live arrays in place instead.
  getAssets().length = 0;
  getCategories().length = 0;
  getIssuances().length = 0;
});

const VALID_ASSET = {
  assetCode: "AST-1",
  name: "Excavator",
  categoryId: "cat-1",
  cost: 1000,
  purchaseDate: "2026-01-01",
};

// ═══════════════════════════════════════════════
// Asset Categories
// ═══════════════════════════════════════════════

describe("GET /api/store/asset-mgmt/categories", () => {
  it("is ungated and returns the (empty) category list", async () => {
    const res = await CATS_GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });
});

describe("POST /api/store/asset-mgmt/categories", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await CATS_POST(buildBody("/api/store/asset-mgmt/categories", "POST", { name: "Heavy" }))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.stock.create", async () => {
    setContext(makeUserCtx([]));
    expect((await CATS_POST(buildBody("/api/store/asset-mgmt/categories", "POST", { name: "Heavy" }))).status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.stock.create"], {
        permissionMatrix: { "store.asset_mgmt": { add: false } },
      }),
    );
    expect((await CATS_POST(buildBody("/api/store/asset-mgmt/categories", "POST", { name: "Heavy" }))).status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    setContext(makeAdminCtx());
    const res = await CATS_POST(buildBody("/api/store/asset-mgmt/categories", "POST", {}));
    expect(res.status).toBe(400);
  });

  it("creates a category and returns 201", async () => {
    setContext(makeAdminCtx());
    const res = await CATS_POST(buildBody("/api/store/asset-mgmt/categories", "POST", { name: "Heavy" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Heavy");
    expect(body.id).toMatch(/^cat-/);
  });
});

// ═══════════════════════════════════════════════
// Assets
// ═══════════════════════════════════════════════

describe("GET /api/store/asset-mgmt/assets", () => {
  it("is ungated and returns the (empty) asset list", async () => {
    const res = await ASSETS_GET(buildGET("/api/store/asset-mgmt/assets"));
    expect(res.status).toBe(200);
    expect((await res.json()).total).toBe(0);
  });
});

describe("POST /api/store/asset-mgmt/assets", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await ASSETS_POST(buildBody("/api/store/asset-mgmt/assets", "POST", VALID_ASSET))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.stock.create", async () => {
    setContext(makeUserCtx([]));
    expect((await ASSETS_POST(buildBody("/api/store/asset-mgmt/assets", "POST", VALID_ASSET))).status).toBe(403);
  });

  it("returns 400 when required fields are missing", async () => {
    setContext(makeAdminCtx());
    const res = await ASSETS_POST(buildBody("/api/store/asset-mgmt/assets", "POST", { assetCode: "X" }));
    expect(res.status).toBe(400);
  });

  it("creates an active asset (below approval threshold) and returns 201", async () => {
    setContext(makeAdminCtx());
    const res = await ASSETS_POST(buildBody("/api/store/asset-mgmt/assets", "POST", VALID_ASSET));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.assetCode).toBe("AST-1");
    expect(body.status).toBe("active");
    expect(body.requiresApproval).toBe(false);
  });

  it("flags assets over the approval threshold as pending_approval", async () => {
    setContext(makeAdminCtx());
    const res = await ASSETS_POST(
      buildBody("/api/store/asset-mgmt/assets", "POST", { ...VALID_ASSET, cost: 60000 }),
    );
    const body = await res.json();
    expect(body.status).toBe("pending_approval");
    expect(body.requiresApproval).toBe(true);
  });

  it("rejects a duplicate asset code with 409", async () => {
    setContext(makeAdminCtx());
    await ASSETS_POST(buildBody("/api/store/asset-mgmt/assets", "POST", VALID_ASSET));
    const res = await ASSETS_POST(buildBody("/api/store/asset-mgmt/assets", "POST", VALID_ASSET));
    expect(res.status).toBe(409);
  });
});

describe("PATCH/DELETE /api/store/asset-mgmt/assets/[id]", () => {
  it("PATCH returns 401 when unauthenticated", async () => {
    const res = await ASSET_PATCH(buildBody("/api/store/asset-mgmt/assets/x", "PATCH", { name: "Y" }), {
      params: { id: "x" },
    });
    expect(res.status).toBe(401);
  });

  it("PATCH returns 403 when the user lacks edit", async () => {
    setContext(makeUserCtx([]));
    const res = await ASSET_PATCH(buildBody("/api/store/asset-mgmt/assets/x", "PATCH", { name: "Y" }), {
      params: { id: "x" },
    });
    expect(res.status).toBe(403);
  });

  it("PATCH returns 404 for an unknown asset", async () => {
    setContext(makeAdminCtx());
    const res = await ASSET_PATCH(buildBody("/api/store/asset-mgmt/assets/x", "PATCH", { name: "Y" }), {
      params: { id: "x" },
    });
    expect(res.status).toBe(404);
  });

  it("PATCH updates an existing asset in place", async () => {
    setContext(makeAdminCtx());
    const created = await (await ASSETS_POST(buildBody("/api/store/asset-mgmt/assets", "POST", VALID_ASSET))).json();
    const res = await ASSET_PATCH(
      buildBody(`/api/store/asset-mgmt/assets/${created.id}`, "PATCH", { name: "Renamed" }),
      { params: { id: created.id } },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Renamed");
  });

  it("DELETE returns 403 when the user lacks delete", async () => {
    setContext(makeUserCtx([]));
    const res = await ASSET_DELETE(buildGET("/api/store/asset-mgmt/assets/x") as NextRequest, {
      params: { id: "x" },
    });
    expect(res.status).toBe(403);
  });

  it("DELETE removes an existing asset", async () => {
    setContext(makeAdminCtx());
    const created = await (await ASSETS_POST(buildBody("/api/store/asset-mgmt/assets", "POST", VALID_ASSET))).json();
    const res = await ASSET_DELETE(buildGET(`/api/store/asset-mgmt/assets/${created.id}`) as NextRequest, {
      params: { id: created.id },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// Issuances
// ═══════════════════════════════════════════════

describe("GET /api/store/asset-mgmt/issuances", () => {
  it("is ungated and returns the (empty) issuance list", async () => {
    const res = await ISS_GET();
    expect(res.status).toBe(200);
    expect((await res.json()).total).toBe(0);
  });
});

describe("POST /api/store/asset-mgmt/issuances", () => {
  it("returns 401 when unauthenticated", async () => {
    expect(
      (await ISS_POST(buildBody("/api/store/asset-mgmt/issuances", "POST", { assetId: "a", issuedTo: "B", issueDate: "2026-01-01" }))).status,
    ).toBe(401);
  });

  it("returns 403 when the user lacks construction.stock.create", async () => {
    setContext(makeUserCtx([]));
    expect(
      (await ISS_POST(buildBody("/api/store/asset-mgmt/issuances", "POST", { assetId: "a", issuedTo: "B", issueDate: "2026-01-01" }))).status,
    ).toBe(403);
  });

  it("returns 400 when required fields are missing", async () => {
    setContext(makeAdminCtx());
    const res = await ISS_POST(buildBody("/api/store/asset-mgmt/issuances", "POST", { assetId: "a" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the asset does not exist", async () => {
    setContext(makeAdminCtx());
    const res = await ISS_POST(
      buildBody("/api/store/asset-mgmt/issuances", "POST", { assetId: "ghost", issuedTo: "Bob", issueDate: "2026-01-01" }),
    );
    expect(res.status).toBe(404);
  });

  it("issues an existing asset and returns 201", async () => {
    setContext(makeAdminCtx());
    const asset = await (await ASSETS_POST(buildBody("/api/store/asset-mgmt/assets", "POST", VALID_ASSET))).json();
    const res = await ISS_POST(
      buildBody("/api/store/asset-mgmt/issuances", "POST", { assetId: asset.id, issuedTo: "Bob", issueDate: "2026-01-01" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("issued");
    expect(body.issuanceNumber).toMatch(/^ISS-/);
  });

  it("rejects issuing an already-out asset with 409", async () => {
    setContext(makeAdminCtx());
    const asset = await (await ASSETS_POST(buildBody("/api/store/asset-mgmt/assets", "POST", VALID_ASSET))).json();
    await ISS_POST(buildBody("/api/store/asset-mgmt/issuances", "POST", { assetId: asset.id, issuedTo: "Bob", issueDate: "2026-01-01" }));
    const res = await ISS_POST(
      buildBody("/api/store/asset-mgmt/issuances", "POST", { assetId: asset.id, issuedTo: "Eve", issueDate: "2026-01-02" }),
    );
    expect(res.status).toBe(409);
  });
});

describe("PATCH /api/store/asset-mgmt/issuances/[id]", () => {
  it("returns 403 when the user lacks edit", async () => {
    setContext(makeUserCtx([]));
    const res = await ISS_PATCH(buildBody("/api/store/asset-mgmt/issuances/x", "PATCH", { action: "return" }), {
      params: { id: "x" },
    });
    expect(res.status).toBe(403);
  });

  it("marks an issuance as returned", async () => {
    setContext(makeAdminCtx());
    const asset = await (await ASSETS_POST(buildBody("/api/store/asset-mgmt/assets", "POST", VALID_ASSET))).json();
    const iss = await (
      await ISS_POST(buildBody("/api/store/asset-mgmt/issuances", "POST", { assetId: asset.id, issuedTo: "Bob", issueDate: "2026-01-01" }))
    ).json();
    const res = await ISS_PATCH(
      buildBody(`/api/store/asset-mgmt/issuances/${iss.id}`, "PATCH", { action: "return" }),
      { params: { id: iss.id } },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("returned");
  });
});
