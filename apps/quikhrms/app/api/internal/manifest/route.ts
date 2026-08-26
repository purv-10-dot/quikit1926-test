import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { APP_ID } from "@/lib/rbac/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/internal/manifest — AI Runtime capability discovery (P0-2).
 *
 * The runtime reads this to learn HRMS's tool surface: the app id, the API
 * route prefix, the *enforced* `hrms.*` permission catalog (the real RBAC
 * registry — NOT the 14 advertising strings in the static manifest.ts / launcher
 * manifest), the primary entities, and the tool→route map for the AI scaffolding
 * in lib/ai/claude.ts.
 *
 * Auth: service-to-service only. Accepts the dedicated AI-runtime secret
 * (INTERNAL_SECRET) OR the shared launcher secret (INTERNAL_SECRET),
 * so both the runtime and the platform launcher can discover the surface. Read
 * only — no DB work, no per-tenant data.
 *
 * NOTE on gates (verified against the actual route handlers, P1-1/P1-2):
 *  - `gate` says how the route REALLY enforces access:
 *      "self-scoped"  → any authenticated employee; returns only their own data
 *                       (no hrms.* code checked — resolveEmployeeId scopes it).
 *      "org-scoped"   → any authenticated org member may read (no code checked).
 *      "scope"        → resolveScope(self/team/all); `permission` is the self-code.
 *      "permission"   → withAuth requiredPermissions; `permission` is the code.
 *  - `permission` is the enforced hrms.* code, or null when the route enforces
 *    none (self/org-scoped). There is NO hrms.payroll.* code — every payroll
 *    self-tool is self-scoped, gated purely by resolveEmployeeId (P1-2 answer).
 *  - `notes` flags tool↔route contract mismatches the runtime must handle.
 *  The runtime's permission layer is advisory today (§X-1); the authoritative
 *  gate is each route's own withAuth check reflected here.
 */

const ROUTE_PREFIX = "/api/v1/hrms";

type Gate = "self-scoped" | "org-scoped" | "scope" | "permission";

interface ToolRoute {
  /** Tool name as declared in lib/ai/claude.ts. */
  name: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Route relative to routePrefix. `:param` marks a value the runtime fills. */
  route: string;
  /** How the route actually enforces access (see header note). */
  gate: Gate;
  /** Enforced hrms.* code, or null when the route checks none (self/org-scoped). */
  permission: string | null;
  /** True for the one intended write tool (behind the runtime's approval gate). */
  write?: boolean;
  /** Contract caveats: param mismatches, missing filters, unbacked tools. */
  notes?: string;
  /** True when no backing route exists yet — a confirmed P1-1 gap. */
  gap?: boolean;
}

// Tool→route map for the reused claude.ts scaffolding (HR_CHAT_TOOLS +
// LEAVE_ASSISTANT_TOOLS + PAYSLIP_EXPLAINER_TOOLS), verified route-by-route.
// `:param` / `=me` values resolve to the caller's own Employee.id server-side.
const TOOLS: ToolRoute[] = [
  // ── Profile / identity ──
  { name: "get_my_profile", method: "GET", route: "/employees/me", gate: "self-scoped", permission: null },
  { name: "get_my_team", method: "GET", route: "/employees/me/subordinates", gate: "self-scoped", permission: null },
  {
    name: "search_employees", method: "GET", route: "/employees?search=:query",
    gate: "scope", permission: "hrms.employee.read",
    notes: "Query param is `search`, not `q`. resolveScope self/team/all — a self-only employee sees only themselves.",
  },

  // ── Leave ──
  {
    name: "get_my_leave_balance", method: "GET", route: "/leaves/balances?employeeId=me",
    gate: "self-scoped", permission: null,
    notes: "No code checked for own balance; viewing another employee applies a role-hierarchy guard.",
  },
  { name: "list_leave_types", method: "GET", route: "/leaves/types", gate: "org-scoped", permission: null },
  {
    name: "get_my_pending_requests", method: "GET", route: "/leaves/requests?employeeId=me&status=Pending",
    gate: "scope", permission: "hrms.leave.read_self",
    notes: "Param is `employeeId=me` (not `scope=me`). Covers leave only; expense pendings are a separate route.",
  },
  { name: "get_team_on_leave_today", method: "GET", route: "/leaves/availability-today", gate: "org-scoped", permission: null },
  // The one intended write tool — behind the runtime's S80 approval gate (P1-3).
  {
    name: "apply_leave", method: "POST", route: "/leaves/requests",
    gate: "self-scoped", permission: null, write: true,
    notes: "API body needs `leaveTypeId` (resolve from list_leave_types — tool sends leaveTypeCode) and expresses half-day via `dayBreakdown[].session` (FirstHalf/SecondHalf), NOT a `halfDay` bool. Runs full policy + frequency-cap + once-in-lifetime checks (422 with violations). NOT idempotent — no dedup key; a repeat submit creates another Pending request unless a cap blocks it. Hold behind the approval gate.",
  },

  // ── Payroll (P1-2: no hrms.payroll.* code — all self-scoped via resolveEmployeeId) ──
  {
    name: "get_latest_payslip", method: "GET", route: "/payroll/my-payslips",
    gate: "self-scoped", permission: null,
    notes: "No `limit` param; returns all Released/Generated payslips desc — latest = payslips[0].",
  },
  {
    name: "get_my_recent_payslips", method: "GET", route: "/payroll/my-payslips",
    gate: "self-scoped", permission: null,
    notes: "No `months` param; returns the full released list — slice the N most recent client-side.",
  },
  {
    name: "get_payslip_by_month", method: "GET", route: "/payroll/my-payslips?month=:month",
    gate: "self-scoped", permission: null,
    notes: "`month`=YYYY-MM, matched against the payslip pay-period (periodStart). Takes precedence over `fy` if both are sent.",
  },
  {
    name: "get_ytd_summary", method: "GET", route: "/payroll/my-payslips?fy=:year",
    gate: "self-scoped", permission: null,
    notes: "`fy` = FY start calendar year (Apr–Mar). Response `.totals` is the YTD summary (gross, deductions, net, TDS, EPF). NOT /payroll/my-salary (that returns the current CTC structure).",
  },

  // ── Attendance ──
  {
    name: "get_my_attendance_summary", method: "GET", route: "/attendance/records?employeeId=me&month=:month",
    gate: "scope", permission: "hrms.attendance.read_self",
    notes: "`month`=YYYY-MM. Returns raw records, not an aggregate — the runtime must summarise (present/absent/WFH) client-side.",
  },

  // ── Holidays ──
  { name: "get_upcoming_holidays", method: "GET", route: "/holidays/upcoming", gate: "org-scoped", permission: null },
  { name: "get_company_holidays_year", method: "GET", route: "/holidays?year=:year", gate: "org-scoped", permission: null },

  // ── Documents / policies ──
  {
    name: "get_my_documents", method: "GET", route: "/documents?employeeId=me",
    gate: "scope", permission: "hrms.document.read_self",
  },
  {
    name: "search_company_policies", method: "GET", route: "/documents?companyOnly=true&category=Policy&search=:query",
    gate: "scope", permission: "hrms.document.read",
    notes: "No `type=policy` param. Filter with `companyOnly=true` + `category` (+ `search`). §S: policy/handbook docs only — never index/serve payslips or ID scans.",
  },
  {
    name: "read_policy_content", method: "GET", route: "/documents/:documentId",
    gate: "org-scoped", permission: null,
    notes: "Detail GET is authenticated (org-scoped); returns extracted text for the doc. Only call for policy/handbook docs surfaced by search_company_policies.",
  },

  // ── Engagement ──
  { name: "get_my_announcements", method: "GET", route: "/engage/announcements/active", gate: "org-scoped", permission: null },
];

// Tools declared in claude.ts that have NO backing data model/route today, so
// the runtime must NOT advertise them as callable. Kept here for traceability.
const UNSUPPORTED_TOOLS = [
  {
    name: "get_my_assets",
    reason:
      "HRMS has no employee-asset data model. 'Assets' exist only as a document-based report category and free-text offboarding checklist items ('Return company laptop') — nothing queryable per employee. Needs a net-new Asset + assignment model + migration before any /employees/me/assets route can be built.",
  },
];

// Status-poll endpoints for in-process background work (P1-4). The runtime
// polls these rather than expecting webhooks/SSE. Read-only for v1.
const STATUS_ENDPOINTS = [
  { job: "payroll.compute", trigger: `POST ${ROUTE_PREFIX}/payroll/runs/:id/compute`, poll: `GET ${ROUTE_PREFIX}/payroll/runs/:id/compute/status` },
  { job: "payroll.setup", poll: `GET ${ROUTE_PREFIX}/payroll/setup/status` },
  { job: "payroll.statutory", poll: `GET ${ROUTE_PREFIX}/payroll/statutory/status` },
  { job: "employee.bulkImport", trigger: `POST ${ROUTE_PREFIX}/employees/bulk-import`, poll: `GET ${ROUTE_PREFIX}/employees/bulk-import/:importId` },
];

// Primary entities the runtime reads. `summary` points at the compact,
// §13-safe projection endpoint (P0-3) where one exists yet.
const ENTITIES = [
  { entity: "Employee", summary: `${ROUTE_PREFIX}/employees/:id/summary`, list: `${ROUTE_PREFIX}/employees` },
  { entity: "LeaveBalance", summary: `${ROUTE_PREFIX}/employees/:id/leave-summary`, list: `${ROUTE_PREFIX}/leaves/balances` },
  { entity: "LeaveRequest", summary: null, list: `${ROUTE_PREFIX}/leaves/requests` },
  { entity: "Department", summary: null, list: `${ROUTE_PREFIX}/departments` },
  { entity: "JobRequisition", summary: null, list: `${ROUTE_PREFIX}/recruit/requisitions` },
  { entity: "JobApplication", summary: null, list: `${ROUTE_PREFIX}/recruit/applications` },
  { entity: "Payslip", summary: null, list: `${ROUTE_PREFIX}/payroll/my-payslips` },
  { entity: "Holiday", summary: null, list: `${ROUTE_PREFIX}/holidays` },
  { entity: "Announcement", summary: null, list: `${ROUTE_PREFIX}/engage/announcements/active` },
];

export async function GET(req: NextRequest) {
  const runtimeSecret = process.env.INTERNAL_SECRET;
  const sharedSecret = process.env.INTERNAL_SECRET;
  const provided = req.headers.get("x-internal-secret");
  const ok =
    !!provided &&
    ((!!runtimeSecret && provided === runtimeSecret) || (!!sharedSecret && provided === sharedSecret));
  if (!ok) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    data: {
      appId: APP_ID,
      routePrefix: ROUTE_PREFIX,
      // Service-auth contract the runtime uses to call as an employee (P0-1).
      serviceAuth: {
        header: "x-internal-secret",
        secretEnvVar: "INTERNAL_SECRET",
        requiredHeaders: ["x-org-id", "x-acting-employee-id"],
        optionalHeaders: ["x-acting-agent-id", "x-acting-as"],
      },
      // The enforced hrms.* permission catalog (authoritative RBAC registry).
      permissions: PERMISSIONS.map((p) => ({
        code: p.code,
        name: p.name,
        category: p.category,
        description: p.description,
      })),
      entities: ENTITIES,
      tools: TOOLS,
      unsupportedTools: UNSUPPORTED_TOOLS,
      statusEndpoints: STATUS_ENDPOINTS,
    },
  });
}
