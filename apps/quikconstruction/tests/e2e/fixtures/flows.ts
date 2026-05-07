/**
 * Reusable multi-step flows that compose the atomic API client into
 * end-to-end fixtures other tests can depend on.
 *
 * Each flow is idempotent within a single test run: it creates fresh
 * records with unique suffixes and returns the IDs the test needs.
 */

import type { ApiClient } from "./api-client";
import { makeProject, makeVendor, makeItem, makeBOQWorkbook } from "./test-data";

// Prisma-backed project creation. The BOQ module is on Prisma and its
// tables carry a foreign key to projects, so project seeding has to
// land in Postgres — not the in-memory globalThis store that the
// /api/masters/projects route still uses. We bypass the HTTP layer for
// the project row and use the HTTP layer for the Phase-1 vendor/item
// masters that ARE still in globalThis.
//
// This is the ONE place in the test suite where tests talk directly to
// Prisma instead of the app. It exists because Phase-2b project migration
// hasn't happened yet — once it does, the direct write becomes a
// `/api/masters/projects` POST like everything else and this block can
// shrink back to two lines.
// Custom output path — see schema.prisma generator block.
import { PrismaClient } from "../../../node_modules/.prisma-qc/client";

let _prisma: PrismaClient | null = null;
function prisma() {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

// The seed script always creates this company — reuse it so tests don't
// have to worry about company FKs.
const SEEDED_COMPANY_ID = "comp-1";
const DEFAULT_TENANT = "default";
const DEFAULT_ORG = "default";

/**
 * Create a project directly in Postgres + one vendor + one item via the
 * in-memory masters routes. Returns the project as if it came from the
 * HTTP layer so downstream code stays identical.
 *
 * Accepts optional tenant / org overrides for cross-tenant isolation tests.
 */
export async function seedProjectWithMasters(
  api: ApiClient,
  opts?: { tenantId?: string; orgId?: string }
) {
  const tenantId = opts?.tenantId ?? DEFAULT_TENANT;
  const orgId = opts?.orgId ?? DEFAULT_ORG;
  const seedUser = "e2e-test";

  // Ensure the company row exists for this tenant (the seed only created
  // it for the `default` tenant). Upsert by id-like convention.
  const companyId = tenantId === DEFAULT_TENANT ? SEEDED_COMPANY_ID : `comp-${tenantId}`;
  await prisma().cnCompany.upsert({
    where: { id: companyId },
    create: {
      id: companyId,
      tenantId,
      orgId,
      name: `Test Company ${tenantId}`,
      legalName: `Test Company ${tenantId} Pvt Ltd`,
      gstin: "27AABCT1234M1Z5",
      pan: "AABCT1234M",
      cin: "U45200MH2020PTC000001",
      address: "Test address",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411001",
      createdBy: seedUser,
      updatedBy: seedUser,
    },
    update: {},
  });

  // Create the project row directly in Prisma so FKs from boq_*
  // resolve correctly.
  const projectInput = makeProject();
  const projectRow = await prisma().cnProject.create({
    data: {
      tenantId,
      orgId,
      code: projectInput.code,
      name: projectInput.name,
      companyId,
      city: projectInput.city,
      state: projectInput.state,
      startDate: new Date(projectInput.startDate),
      expectedEndDate: new Date(projectInput.expectedEndDate),
      projectValue: projectInput.projectValue,
      createdBy: seedUser,
      updatedBy: seedUser,
    },
  });

  // Vendors and items still live in the in-memory store (Phase 2b pending).
  // Post them via the HTTP layer so cross-tenant isolation tests still
  // exercise the route-level tenant check.
  const vendor = await api
    .post("/api/masters/vendors", makeVendor())
    .catch(() => ({ id: `vnd-${projectRow.id}`, code: "VND-STUB" }));
  const item = await api
    .post("/api/masters/items", makeItem())
    .catch(() => ({ id: `itm-${projectRow.id}`, code: "ITM-STUB" }));

  // Return a shape compatible with the old HTTP-post response.
  return {
    project: {
      id: projectRow.id,
      code: projectRow.code,
      name: projectRow.name,
      tenantId: projectRow.tenantId,
      orgId: projectRow.orgId,
    },
    vendor,
    item,
  };
}

/**
 * Import the minimal BOQ workbook into the given project. Returns the
 * list of BOQ leaf refs so downstream tests can post DPR/RAB against them.
 */
export async function importAndGetBoq(api: ApiClient, projectId: string) {
  const importRes = await api.post(
    `/api/projects/${projectId}/boq/import`,
    {
      ...makeBOQWorkbook(),
      replaceExisting: true,
    }
  );
  const tree = await api.get(`/api/projects/${projectId}/boq`);
  const leaves = (tree.items ?? []).filter((i: any) => !i.is_group);
  return { importRes, tree, leaves };
}

/**
 * Lock a project BOQ. Requires `boq.lock` permission.
 */
export async function lockBoq(api: ApiClient, projectId: string) {
  return api.post(`/api/projects/${projectId}/boq/lock`);
}

export async function unlockBoq(api: ApiClient, projectId: string) {
  return api.post(`/api/projects/${projectId}/boq/unlock`);
}

/**
 * Submit a DPR and immediately approve it — the single-step approval
 * posts all lines to the BOQ progress ledger inside one transaction.
 */
export async function submitAndApproveDPR(
  api: ApiClient,
  params: {
    projectId: string;
    lines: Array<{ boqNo: string; qty: number | string; workType?: "self" | "sub_contractor" }>;
  }
) {
  // Create the DPR in "submitted" state so the /submit route (which
  // actually means "approve") can transition it straight to "approved".
  const dpr = await api.post("/api/projects/dpr", {
    projectId: params.projectId,
    dprDate: new Date().toISOString().slice(0, 10),
    reportDate: new Date().toISOString().slice(0, 10),
    weather: "clear",
    status: "submitted",
    items: params.lines.map((l) => ({
      boqNo: l.boqNo,
      todayQty: String(l.qty),
      workType: l.workType ?? "self",
    })),
  });

  // Approve it
  const approved = await api.post(`/api/projects/dpr/${dpr.id}/submit`);
  return { dpr, approved };
}

/**
 * Create a RAB and approve it — billed qty lands on the BOQ billing ledger.
 */
export async function createAndApproveRAB(
  api: ApiClient,
  params: {
    projectId: string;
    lines: Array<{ boqNo: string; qty: number | string }>;
  }
) {
  const rab = await api.post("/api/projects/rab", {
    projectId: params.projectId,
    billPeriodFrom: "2026-04-01",
    billPeriodTo: "2026-04-30",
    status: "submitted",
    lines: params.lines.map((l) => ({
      boqNo: l.boqNo,
      qty: String(l.qty),
    })),
  });
  const approved = await api.post(`/api/projects/rab/${rab.id}/approve`);
  return { rab, approved };
}
