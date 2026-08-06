/**
 * HRMS → platform Search index emitter (§S).
 *
 * Fire-and-forget push of §13-SAFE locator documents to the platform Search
 * service. Two HRMS-specific, NON-NEGOTIABLE rules:
 *   1. The index NEVER contains §13 sensitive data (salary/CTC, PAN, Aadhaar,
 *      bank, personal contact, address, DOB, …). Only the safe locator fields
 *      declared in SEARCH_INDEX_POLICY are ever sent — default-deny allow-list.
 *   2. Payslip / ID-scan / salary-letter document TYPES are excluded from the
 *      index entirely (EXCLUDED_DOCUMENT_TYPES) — a full-text index over those
 *      bodies would be a data-exposure hole even behind a gated fetch.
 *
 * Transport: POST {SEARCH_SERVICE_URL}/api/internal/index-event with
 * x-internal-secret (SEARCH_SERVICE_SECRET). This is a NO-OP when either env
 * var is unset — the Search service and `@quikit/search-sdk` do not exist in
 * the monorepo yet (docs/21 pending), so the emitter is inert until they land.
 * When the SDK ships, replace the fetch in `postIndexEvent` with the SDK call;
 * the policy + shapes below stay unchanged.
 */

import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/utils/app-url";

type IndexOperation = "create" | "update" | "delete";

interface IndexDoc {
  entityType: string;
  entityId: string;
  orgId: string;
  displayName?: string;
  /** Concatenated safe, searchable text. §13 fields must never appear here. */
  indexableText?: string;
  snippet?: string;
  url?: string;
}

/**
 * Authoritative S-2 index policy. `indexableText` = the only fields that may be
 * indexed; `neverIndex` documents the §13 fields that must never reach the
 * index (enforced by the builders, which only read allow-listed columns). Sagar
 * / the runtime projection layer should mirror this exactly.
 */
const SEARCH_INDEX_POLICY = {
  Employee: {
    indexableText: ["firstName", "lastName", "displayName", "employeeCode", "jobTitle", "designation", "department", "team"],
    neverIndex: ["salary", "ctc", "panNumber", "aadhaarNumber", "bankAccounts", "personalEmail", "personalPhone", "currentAddress", "permanentAddress", "dateOfBirth", "bloodGroup", "maritalStatus"],
  },
  Department: {
    indexableText: ["name", "code", "description"],
    neverIndex: [],
  },
  JobRequisition: {
    indexableText: ["title", "rolePurpose", "jobDescription", "department"],
    neverIndex: ["candidateCompExpectations"],
  },
  JobApplication: {
    indexableText: ["candidateName", "appliedRole"],
    neverIndex: ["currentSalary", "expectedSalary", "resumePII", "aiMatchAnalysis"],
  },
  Document: {
    indexableText: ["title", "type"],
    neverIndex: ["§13 document bodies"],
  },
} as const;

/**
 * Document TYPES whose bodies must never be indexed (they contain §13 data).
 * A policy/handbook doc is fine; a payslip or ID scan is not.
 */
const EXCLUDED_DOCUMENT_TYPES = [
  "Payslip", "SalaryLetter", "SalarySlip", "IdProof", "PAN", "Aadhaar",
  "BankProof", "PassbookProof", "OfferLetter", "TaxProof", "Form16",
];

/** POST the event, guarded so it's inert until the Search service exists. */
async function postIndexEvent(operation: IndexOperation, doc: IndexDoc): Promise<void> {
  const base = process.env.SEARCH_SERVICE_URL;
  const secret = process.env.SEARCH_SERVICE_SECRET;
  if (!base || !secret) return; // Search service / SDK not wired yet — no-op.
  try {
    await fetch(`${base.replace(/\/$/, "")}/api/internal/index-event`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({ operation, ...doc }),
    });
  } catch (error) {
    // Fire-and-forget — indexing must never break the mutation that triggered it.
    console.error("[search-index] emit failed:", error);
  }
}

// ── Employee (reference entity — the other entities follow this pattern) ──

const deepLinkBase = () => appBaseUrl();

/**
 * Re-fetch the §13-safe Employee projection and emit a create/update index
 * event. Fire-and-forget: call as `void emitEmployeeIndex(...)`. Re-fetches so
 * it always sends the correct safe fields regardless of the caller's data.
 */
export function emitEmployeeIndex(orgId: string, employeeId: string, operation: "create" | "update"): void {
  void (async () => {
    const e = await prisma.employee.findFirst({
      where: { orgId, id: employeeId, deletedAt: null },
      // §13 allow-list ONLY (mirrors employees/:id/summary). Never add sensitive columns.
      select: {
        firstName: true, lastName: true, displayName: true, employeeCode: true, jobTitle: true,
        department: { select: { name: true } },
        designation: { select: { title: true } },
        team: { select: { name: true } },
      },
    });
    if (!e) return;
    const name = e.displayName || [e.firstName, e.lastName].filter(Boolean).join(" ");
    const dept = e.department?.name ?? "";
    const desig = e.designation?.title ?? e.jobTitle ?? "";
    const indexableText = [e.firstName, e.lastName, e.displayName, e.employeeCode, e.jobTitle, desig, dept, e.team?.name]
      .filter(Boolean)
      .join(" ");
    await postIndexEvent(operation, {
      entityType: "Employee",
      entityId: employeeId,
      orgId,
      displayName: name,
      indexableText,
      snippet: [desig, dept].filter(Boolean).join(" · "),
      url: `${deepLinkBase()}/employees/${employeeId}`,
    });
  })();
}

/** Emit a delete/deindex event when an employee is soft-deleted (deletedAt set). */
export function emitEmployeeDeindex(orgId: string, employeeId: string): void {
  void postIndexEvent("delete", { entityType: "Employee", entityId: employeeId, orgId });
}
