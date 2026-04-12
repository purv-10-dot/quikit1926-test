import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";

import {
  GET as listTemplatesGET,
  POST as createTemplatePOST,
} from "@/app/api/meetings/templates/route";
import {
  GET as getTemplateGET,
  PUT as updateTemplatePUT,
  DELETE as deleteTemplateDELETE,
} from "@/app/api/meetings/templates/[id]/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-tpl-1";
const TEMPLATE_ID = "cktmpl0000000000000000001";

function buildRequest(
  path = "http://localhost/api/meetings/templates",
  body?: unknown,
  method = "GET",
): NextRequest {
  return new NextRequest(path, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : undefined,
  });
}

function asAdmin() {
  setSession({ id: USER, tenantId: TENANT, role: "admin" });
  mockDb.membership.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    tenantId: TENANT,
    role: "admin",
    status: "active",
  } as any);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

/* ═══════════════════════════════════════════════
   GET /api/meetings/templates — list + auto-seed
═══════════════════════════════════════════════ */

describe("GET /api/meetings/templates — auth", () => {
  it("401 unauthenticated", async () => {
    const res = await listTemplatesGET(buildRequest(), { params: {} as any });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/meetings/templates — auto-seed on first visit", () => {
  beforeEach(asAdmin);

  it("seeds 5 Scaling Up defaults when the tenant has none", async () => {
    // First count: 0 templates → triggers seeding
    mockDb.meetingTemplate.count.mockResolvedValue(0);
    mockDb.meetingTemplate.createMany.mockResolvedValue({ count: 5 } as any);
    mockDb.meetingTemplate.findMany.mockResolvedValue([] as any);

    const res = await listTemplatesGET(buildRequest(), { params: {} as any });
    expect(res.status).toBe(200);

    // createMany called once with 5 seeded rows
    expect(mockDb.meetingTemplate.createMany).toHaveBeenCalledOnce();
    const seedArg = (mockDb.meetingTemplate.createMany as any).mock.calls[0][0];
    expect(seedArg.data).toHaveLength(5);

    // All 5 Scaling Up cadences are present
    const cadences = seedArg.data.map((r: any) => r.cadence).sort();
    expect(cadences).toEqual(["annual", "daily", "monthly", "quarterly", "weekly"]);

    // Every seeded row is scoped to the requesting tenant
    for (const row of seedArg.data) {
      expect(row.tenantId).toBe(TENANT);
      expect(row.createdBy).toBe(USER);
      expect(row.sections.length).toBeGreaterThan(0);
    }
  });

  it("does NOT seed if the tenant already has templates", async () => {
    mockDb.meetingTemplate.count.mockResolvedValue(3);
    mockDb.meetingTemplate.findMany.mockResolvedValue([
      {
        id: "ckt1",
        name: "Existing",
        cadence: "weekly",
        description: null,
        sections: ["A", "B"],
        defaultAttendees: [],
        duration: 60,
        createdAt: new Date(),
      },
    ] as any);

    const res = await listTemplatesGET(buildRequest(), { params: {} as any });
    expect(res.status).toBe(200);
    expect(mockDb.meetingTemplate.createMany).not.toHaveBeenCalled();
  });

  it("returns templates scoped to the current tenant", async () => {
    mockDb.meetingTemplate.count.mockResolvedValue(1);
    mockDb.meetingTemplate.findMany.mockResolvedValue([
      {
        id: "ckt1",
        name: "Weekly",
        cadence: "weekly",
        description: null,
        sections: ["a"],
        defaultAttendees: [],
        duration: 60,
        createdAt: new Date(),
      },
    ] as any);

    await listTemplatesGET(buildRequest(), { params: {} as any });

    expect(mockDb.meetingTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT }),
      }),
    );
  });
});

/* ═══════════════════════════════════════════════
   POST /api/meetings/templates — create
═══════════════════════════════════════════════ */

describe("POST /api/meetings/templates — auth + validation", () => {
  it("401 unauthenticated", async () => {
    const res = await createTemplatePOST(
      buildRequest(undefined, { name: "x" }, "POST"),
      { params: {} as any },
    );
    expect(res.status).toBe(401);
  });

  it("400 when name is missing", async () => {
    asAdmin();
    const res = await createTemplatePOST(
      buildRequest(
        "http://localhost/api/meetings/templates",
        { name: "", cadence: "weekly", sections: ["a"] },
        "POST",
      ),
      { params: {} as any },
    );
    expect(res.status).toBe(400);
  });

  it("400 when sections array is empty", async () => {
    asAdmin();
    const res = await createTemplatePOST(
      buildRequest(
        "http://localhost/api/meetings/templates",
        { name: "x", cadence: "weekly", sections: [] },
        "POST",
      ),
      { params: {} as any },
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/meetings/templates — happy path", () => {
  beforeEach(asAdmin);

  it("201 on valid create, audit-logged", async () => {
    mockDb.meetingTemplate.create.mockResolvedValue({
      id: "cktnew",
      name: "Standup",
      cadence: "daily",
      description: null,
      sections: ["Yesterday", "Today", "Blockers"],
      duration: 15,
    } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    const res = await createTemplatePOST(
      buildRequest(
        "http://localhost/api/meetings/templates",
        {
          name: "Standup",
          cadence: "daily",
          sections: ["Yesterday", "Today", "Blockers"],
          duration: 15,
        },
        "POST",
      ),
      { params: {} as any },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("cktnew");

    expect(mockDb.auditLog.create).toHaveBeenCalledOnce();
    const auditArg = (mockDb.auditLog.create as any).mock.calls[0][0];
    expect(auditArg.data.action).toBe("CREATE");
  });

  it("stores tenantId + createdBy from the session", async () => {
    mockDb.meetingTemplate.create.mockResolvedValue({
      id: "cktnew",
      name: "x",
      cadence: "weekly",
      description: null,
      sections: ["a"],
      duration: 60,
    } as any);

    await createTemplatePOST(
      buildRequest(
        "http://localhost/api/meetings/templates",
        { name: "x", cadence: "weekly", sections: ["a"] },
        "POST",
      ),
      { params: {} as any },
    );

    const createArg = (mockDb.meetingTemplate.create as any).mock.calls[0][0];
    expect(createArg.data.tenantId).toBe(TENANT);
    expect(createArg.data.createdBy).toBe(USER);
  });
});

/* ═══════════════════════════════════════════════
   GET /api/meetings/templates/[id]
═══════════════════════════════════════════════ */

describe("GET /api/meetings/templates/[id]", () => {
  it("401 unauthenticated", async () => {
    const res = await getTemplateGET(
      buildRequest("http://localhost/api/meetings/templates/" + TEMPLATE_ID),
      { params: { id: TEMPLATE_ID } },
    );
    expect(res.status).toBe(401);
  });

  it("404 when template not in tenant", async () => {
    asAdmin();
    mockDb.meetingTemplate.findFirst.mockResolvedValue(null);
    const res = await getTemplateGET(
      buildRequest("http://localhost/api/meetings/templates/" + TEMPLATE_ID),
      { params: { id: TEMPLATE_ID } },
    );
    expect(res.status).toBe(404);
    expect(mockDb.meetingTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: TEMPLATE_ID, tenantId: TENANT }),
      }),
    );
  });

  it("200 with the template payload", async () => {
    asAdmin();
    mockDb.meetingTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      name: "Weekly",
      cadence: "weekly",
      description: "desc",
      sections: ["a", "b"],
      defaultAttendees: [],
      duration: 60,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const res = await getTemplateGET(
      buildRequest("http://localhost/api/meetings/templates/" + TEMPLATE_ID),
      { params: { id: TEMPLATE_ID } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(TEMPLATE_ID);
  });
});

/* ═══════════════════════════════════════════════
   PUT /api/meetings/templates/[id]
═══════════════════════════════════════════════ */

describe("PUT /api/meetings/templates/[id]", () => {
  it("401 unauthenticated", async () => {
    const res = await updateTemplatePUT(
      buildRequest(
        "http://localhost/api/meetings/templates/" + TEMPLATE_ID,
        { name: "Renamed" },
        "PUT",
      ),
      { params: { id: TEMPLATE_ID } },
    );
    expect(res.status).toBe(401);
  });

  it("404 when template not in tenant", async () => {
    asAdmin();
    mockDb.meetingTemplate.findFirst.mockResolvedValue(null);
    const res = await updateTemplatePUT(
      buildRequest(
        "http://localhost/api/meetings/templates/" + TEMPLATE_ID,
        { name: "Renamed" },
        "PUT",
      ),
      { params: { id: TEMPLATE_ID } },
    );
    expect(res.status).toBe(404);
  });

  it("400 on invalid sections", async () => {
    asAdmin();
    mockDb.meetingTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID } as any);
    const res = await updateTemplatePUT(
      buildRequest(
        "http://localhost/api/meetings/templates/" + TEMPLATE_ID,
        { sections: [] },
        "PUT",
      ),
      { params: { id: TEMPLATE_ID } },
    );
    expect(res.status).toBe(400);
  });

  it("200 with partial update (name only)", async () => {
    asAdmin();
    mockDb.meetingTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID } as any);
    mockDb.meetingTemplate.update.mockResolvedValue({
      id: TEMPLATE_ID,
      name: "Renamed",
      cadence: "weekly",
      description: null,
      sections: ["a"],
      defaultAttendees: [],
      duration: 60,
    } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    const res = await updateTemplatePUT(
      buildRequest(
        "http://localhost/api/meetings/templates/" + TEMPLATE_ID,
        { name: "Renamed" },
        "PUT",
      ),
      { params: { id: TEMPLATE_ID } },
    );
    expect(res.status).toBe(200);

    const updateArg = (mockDb.meetingTemplate.update as any).mock.calls[0][0];
    expect(updateArg.data.name).toBe("Renamed");
    // Untouched fields should not be in the payload
    expect(updateArg.data.cadence).toBeUndefined();
    expect(updateArg.data.sections).toBeUndefined();
  });

  it("writes an UPDATE audit log", async () => {
    asAdmin();
    mockDb.meetingTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID } as any);
    mockDb.meetingTemplate.update.mockResolvedValue({
      id: TEMPLATE_ID,
      name: "x",
      cadence: "weekly",
      description: null,
      sections: ["a"],
      defaultAttendees: [],
      duration: 60,
    } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    await updateTemplatePUT(
      buildRequest(
        "http://localhost/api/meetings/templates/" + TEMPLATE_ID,
        { name: "x" },
        "PUT",
      ),
      { params: { id: TEMPLATE_ID } },
    );
    const auditArg = (mockDb.auditLog.create as any).mock.calls[0][0];
    expect(auditArg.data.action).toBe("UPDATE");
    expect(auditArg.data.entityType).toBe("Meeting");
  });
});

/* ═══════════════════════════════════════════════
   DELETE /api/meetings/templates/[id]
═══════════════════════════════════════════════ */

describe("DELETE /api/meetings/templates/[id]", () => {
  it("401 unauthenticated", async () => {
    const res = await deleteTemplateDELETE(
      buildRequest(
        "http://localhost/api/meetings/templates/" + TEMPLATE_ID,
        undefined,
        "DELETE",
      ),
      { params: { id: TEMPLATE_ID } },
    );
    expect(res.status).toBe(401);
  });

  it("404 when template not in tenant", async () => {
    asAdmin();
    mockDb.meetingTemplate.findFirst.mockResolvedValue(null);
    const res = await deleteTemplateDELETE(
      buildRequest(
        "http://localhost/api/meetings/templates/" + TEMPLATE_ID,
        undefined,
        "DELETE",
      ),
      { params: { id: TEMPLATE_ID } },
    );
    expect(res.status).toBe(404);
  });

  it("hard-deletes the template and audit-logs with oldValues snapshot", async () => {
    asAdmin();
    mockDb.meetingTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      name: "Weekly",
    } as any);
    mockDb.meetingTemplate.delete.mockResolvedValue({} as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    const res = await deleteTemplateDELETE(
      buildRequest(
        "http://localhost/api/meetings/templates/" + TEMPLATE_ID,
        undefined,
        "DELETE",
      ),
      { params: { id: TEMPLATE_ID } },
    );
    expect(res.status).toBe(200);

    expect(mockDb.meetingTemplate.delete).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID },
    });

    const auditArg = (mockDb.auditLog.create as any).mock.calls[0][0];
    expect(auditArg.data.action).toBe("DELETE");
    // oldValues preserved (pre-delete snapshot)
    expect(auditArg.data.oldValues).toBeTruthy();
  });
});
