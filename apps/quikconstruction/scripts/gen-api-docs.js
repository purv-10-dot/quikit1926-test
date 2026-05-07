/* Generates API_Documentation.docx — endpoint catalog + DB connection info. */
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageNumber, PageBreak,
} = require("docx");

// ---------- Endpoint catalog (grouped by module) -----------------------------
const groups = [
  {
    name: "Authentication & Session",
    blurb: "User sign-in, session info, and the current-user lookup.",
    rows: [
      ["GET/POST", "/api/auth/[...nextauth]", "NextAuth catch-all. Handles sign-in, sign-out, session, CSRF, and provider callbacks."],
      ["GET",  "/api/me", "Returns the current authenticated user (id, name, email, roles, tenant)."],
    ],
  },
  {
    name: "Invites (onboard new users)",
    blurb: "Email-based invitation flow used to create new accounts inside a tenant.",
    rows: [
      ["GET",  "/api/invites/[token]", "Fetch invite details by token (used by the invite landing page)."],
      ["POST", "/api/invites/accept",  "Accept an invite and create the user account."],
    ],
  },
  {
    name: "Dashboard & Health",
    blurb: "Overview metrics and liveness/readiness probes for ops.",
    rows: [
      ["GET", "/api/dashboard", "Aggregated dashboard KPIs (projects, approvals, purchase, finance)."],
      ["GET", "/api/health",    "Liveness probe. Returns 200 OK when the service is up."],
      ["GET", "/api/ready",     "Readiness probe. Confirms DB connectivity before routing traffic."],
      ["GET", "/api/debug/mail-test", "Sends a test email via the configured SMTP to debug outbound mail."],
    ],
  },
  {
    name: "Approvals",
    blurb: "Generic multi-step approval workflow engine used across Purchase, Store, Finance, etc.",
    rows: [
      ["GET",  "/api/approvals/inbox",       "My approval inbox — items waiting on the current user."],
      ["GET",  "/api/approvals/pending",     "All pending approvals visible to the current user's role."],
      ["GET",  "/api/approvals/chain",       "Resolve the approval chain (steps + approvers) for a given entity."],
      ["GET",  "/api/approvals/[id]/history","Audit trail for a single approval — who acted, when, and the comment."],
      ["POST", "/api/approvals/[id]/[action]","Perform an action on an approval (approve, reject, return, reassign)."],
    ],
  },
  {
    name: "Settings — Users",
    blurb: "Tenant user administration.",
    rows: [
      ["GET",    "/api/settings/users",                     "List users (supports search, role, status filters)."],
      ["POST",   "/api/settings/users",                     "Create a user and send an invite email."],
      ["GET",    "/api/settings/users/[id]",                "Fetch a single user with roles and permissions."],
      ["PUT",    "/api/settings/users/[id]",                "Replace user fields (full update)."],
      ["PATCH",  "/api/settings/users/[id]",                "Partial update — toggle status, update roles, rename."],
      ["DELETE", "/api/settings/users/[id]",                "Soft-delete / deactivate a user."],
      ["POST",   "/api/settings/users/[id]/resend-invite",  "Resend the invitation email for a pending user."],
    ],
  },
  {
    name: "Settings — Workflows",
    blurb: "Configure approval chains per document type and project.",
    rows: [
      ["GET",    "/api/settings/workflows",      "List approval workflow templates."],
      ["POST",   "/api/settings/workflows",      "Create a new workflow template."],
      ["GET",    "/api/settings/workflows/[id]", "Fetch a workflow template with its steps."],
      ["PATCH",  "/api/settings/workflows/[id]", "Update a workflow (steps, approvers, conditions)."],
      ["PUT",    "/api/settings/workflows/[id]", "Replace a workflow template."],
      ["DELETE", "/api/settings/workflows/[id]", "Delete a workflow template."],
    ],
  },
  {
    name: "Masters — Generic",
    blurb: "Generic CRUD for simple lookup entities (cost-centres, categories, etc.).",
    rows: [
      ["GET",    "/api/masters/[entity]",      "List rows for a master entity."],
      ["POST",   "/api/masters/[entity]",      "Create a row in a master entity."],
      ["GET",    "/api/masters/[entity]/[id]", "Fetch a single master row."],
      ["PUT",    "/api/masters/[entity]/[id]", "Replace a master row."],
      ["PATCH",  "/api/masters/[entity]/[id]", "Partial update."],
      ["DELETE", "/api/masters/[entity]/[id]", "Delete a master row."],
    ],
  },
  {
    name: "Masters — Specific",
    blurb: "Typed CRUD endpoints for well-known masters.",
    rows: [
      ["GET/POST",                        "/api/masters/projects",            "List / create projects."],
      ["GET/PUT",                         "/api/masters/projects/[id]",       "Fetch / update a project."],
      ["GET/POST",                        "/api/masters/vendors",             "List / create vendors."],
      ["GET/PUT/PATCH/DELETE",            "/api/masters/vendors/[id]",        "Vendor details and updates."],
      ["GET/POST",                        "/api/masters/contractors",         "List / create contractors (labour suppliers)."],
      ["GET/PUT/PATCH/DELETE",            "/api/masters/contractors/[id]",    "Contractor details and updates."],
      ["GET/POST",                        "/api/masters/items",               "List / create inventory items."],
      ["GET/PUT/PATCH/DELETE",            "/api/masters/items/[id]",          "Item details and updates."],
      ["GET/PUT/PATCH/DELETE",            "/api/masters/item-groups/[id]",    "Item-group details and updates."],
      ["GET/POST",                        "/api/masters/uom",                 "List / create units of measure."],
      ["GET/PUT/PATCH/DELETE",            "/api/masters/uom/[id]",            "UOM details and updates."],
      ["GET/POST",                        "/api/masters/locations",           "List / create storage locations."],
      ["GET/PUT/PATCH/DELETE",            "/api/masters/locations/[id]",      "Location details and updates."],
      ["GET/POST",                        "/api/masters/assets",              "List / create fixed assets (machinery, vehicles)."],
    ],
  },
  {
    name: "Projects — Core",
    blurb: "Project execution endpoints: BOQ, DPR, work orders, hindrances, documents.",
    rows: [
      ["GET",    "/api/projects/[projectId]/boq",                      "List BOQ line items for a project."],
      ["POST",   "/api/projects/[projectId]/boq",                      "Add a BOQ item."],
      ["PUT",    "/api/projects/[projectId]/boq/[itemId]",             "Update a BOQ item."],
      ["DELETE", "/api/projects/[projectId]/boq/[itemId]",             "Delete a BOQ item."],
      ["POST",   "/api/projects/[projectId]/boq/preview-upload",       "Parse an uploaded BOQ file and return a preview without committing."],
      ["POST",   "/api/projects/[projectId]/boq/import",               "Bulk import BOQ lines from the previewed file."],
      ["POST",   "/api/projects/[projectId]/boq/confirm",              "Confirm the imported BOQ (moves it from staging to live)."],
      ["POST",   "/api/projects/[projectId]/boq/lock",                 "Lock the BOQ so further edits require an unlock."],
      ["POST",   "/api/projects/[projectId]/boq/unlock",               "Unlock the BOQ for editing (privileged)."],
      ["GET",    "/api/projects/[projectId]/estimations",              "Estimations scoped to a project."],
      ["POST",   "/api/projects/[projectId]/estimations",              "Create an estimation under a project."],
      ["GET/POST","/api/projects/work-orders",                          "List / create work orders."],
      ["GET/PUT/PATCH/DELETE", "/api/projects/work-orders/[id]",        "Work order details and updates."],
      ["GET/POST","/api/projects/dpr",                                  "Daily Progress Reports — list / create."],
      ["GET/PUT/DELETE", "/api/projects/dpr/[id]",                      "DPR detail, update, or delete."],
      ["POST",   "/api/projects/dpr/[id]/submit",                       "Submit a DPR for approval."],
      ["GET/POST","/api/projects/rab",                                  "Running Account Bills — list / create."],
      ["POST",   "/api/projects/rab/[id]/approve",                      "Approve a Running Account Bill."],
      ["GET/POST","/api/projects/hindrance",                            "Hindrance (blocker) register — list / create."],
      ["GET/POST","/api/projects/documents",                            "Project documents — list / add metadata records."],
    ],
  },
  {
    name: "Estimations",
    blurb: "Tenant-wide estimation records (outside a specific project).",
    rows: [
      ["GET",    "/api/estimations",       "List estimations."],
      ["GET",    "/api/estimations/[id]",  "Fetch a single estimation."],
      ["PUT",    "/api/estimations/[id]",  "Replace an estimation."],
      ["PATCH",  "/api/estimations/[id]",  "Partial update."],
      ["DELETE", "/api/estimations/[id]",  "Delete an estimation."],
    ],
  },
  {
    name: "Purchase",
    blurb: "Procurement pipeline: Indent → Requisition → RFQ → Purchase Order → GRN.",
    rows: [
      ["GET",    "/api/purchase/dashboard",                "Purchase module KPIs."],
      ["GET/POST","/api/purchase/indents",                 "List / create material indents."],
      ["GET/DELETE", "/api/purchase/indents/[id]",         "Fetch or delete an indent."],
      ["POST",   "/api/purchase/indents/[id]/submit",      "Submit an indent for approval."],
      ["POST",   "/api/purchase/indents/[id]/approve",     "Approve / reject an indent."],
      ["GET/POST","/api/purchase/requisitions",            "List / create purchase requisitions."],
      ["GET/POST/PATCH/DELETE", "/api/purchase/requisitions/[id]", "Requisition detail and updates."],
      ["POST",   "/api/purchase/requisitions/[id]/submit", "Submit a requisition for approval."],
      ["POST",   "/api/purchase/requisitions/[id]/approve","Approve / reject a requisition."],
      ["GET/POST","/api/purchase/rfqs",                    "List / create RFQs (request for quotation)."],
      ["GET/DELETE","/api/purchase/rfqs/[id]",             "RFQ detail / delete."],
      ["POST",   "/api/purchase/rfqs/[id]/submit",         "Submit an RFQ."],
      ["POST",   "/api/purchase/rfqs/[id]/approve",        "Approve / reject an RFQ."],
      ["GET/POST","/api/purchase/orders",                  "List / create purchase orders."],
      ["GET",    "/api/purchase/orders/[id]",              "Fetch a purchase order."],
      ["POST",   "/api/purchase/orders/[id]/submit",       "Submit a PO."],
      ["POST",   "/api/purchase/orders/[id]/approve",      "Approve / reject a PO."],
      ["GET/POST","/api/purchase/grn",                     "Goods Received Notes — list / create."],
      ["GET",    "/api/purchase/grn/[id]",                 "Fetch a GRN."],
      ["POST",   "/api/purchase/grn/[id]/approve",         "Approve / reject a GRN."],
    ],
  },
  {
    name: "Store (Inventory)",
    blurb: "Site-level material movement, reconciliation and consumables.",
    rows: [
      ["GET",    "/api/store/stock-register",                "Current stock by item / location."],
      ["GET/POST","/api/store/issues",                        "Material issue vouchers."],
      ["POST",   "/api/store/issue/[id]/approve",             "Approve a material issue."],
      ["GET/POST","/api/store/transfers",                     "Inter-site stock transfers."],
      ["POST",   "/api/store/transfer/[id]/approve",          "Approve a stock transfer."],
      ["GET/POST","/api/store/reconciliations",               "Physical stock reconciliations."],
      ["POST",   "/api/store/reconciliation/[id]/approve",    "Approve a reconciliation."],
      ["GET/POST","/api/store/good-returns",                  "Material return / RTV records."],
      ["GET/POST","/api/store/gate-passes",                   "Gate passes (returnable / non-returnable)."],
      ["GET/POST","/api/store/diesel-logs",                   "Diesel consumption logs for plant & machinery."],
    ],
  },
  {
    name: "HRMS & Labour",
    blurb: "Workforce attendance and contractor labour.",
    rows: [
      ["GET/POST", "/api/hrms/attendance", "Daily attendance records for staff / labour."],
      ["GET/POST", "/api/hrms/labour",     "Labour roster (gangs, contractor assignments, rates)."],
    ],
  },
  {
    name: "Safety",
    blurb: "Site safety: incident reports and toolbox talks.",
    rows: [
      ["GET/POST", "/api/safety/incidents",     "Log and list safety incidents."],
      ["GET/POST", "/api/safety/toolbox-talks", "Log and list toolbox talk sessions."],
    ],
  },
  {
    name: "Quality",
    blurb: "Quality inspections and their checklists.",
    rows: [
      ["GET/POST", "/api/quality/checklists",  "List / create QA checklists."],
      ["GET/POST", "/api/quality/inspections", "List / create QA inspections against those checklists."],
    ],
  },
  {
    name: "Finance",
    blurb: "Client billing, vendor payments, petty cash and retention money.",
    rows: [
      ["GET/POST", "/api/finance/client-billing",  "Raise / list client invoices (RA bills)."],
      ["GET/POST", "/api/finance/vendor-payments", "Record / list vendor payments against POs."],
      ["GET/POST", "/api/finance/petty-cash",      "Petty cash entries."],
      ["GET/POST", "/api/finance/retention",       "Retention money tracked per contract."],
    ],
  },
  {
    name: "Files & Uploads",
    blurb: "Storage-driver-agnostic file attachment pipeline (local / S3 / R2).",
    rows: [
      ["POST",   "/api/files/upload-init",    "Begin an upload — returns a signed URL / token."],
      ["POST",   "/api/files/upload-confirm", "Confirm an upload completed and persist the file record."],
      ["PUT",    "/api/files/local-upload",   "Direct PUT endpoint used by the local storage driver."],
      ["GET",    "/api/files/local-download", "Signed download for files stored on local disk."],
      ["GET",    "/api/files/by-entity",      "List files attached to an entity (e.g. PO 123, DPR 45)."],
      ["GET",    "/api/files/[id]",           "Download / fetch metadata for a single file."],
      ["DELETE", "/api/files/[id]",           "Delete a file."],
    ],
  },
];

// ---------- Styling helpers --------------------------------------------------
const COLOR = { accent: "1F4E79", accentLight: "D5E1EC", border: "CCCCCC", muted: "555555" };
const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: COLOR.border };
const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 80, ...opts.spacing },
    alignment: opts.alignment,
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, color: opts.color, size: opts.size, font: "Arial" })],
  });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    children: [new TextRun({ text, font: "Arial", size: 22 })],
  });
}

function headingCell(text, width) {
  return new TableCell({
    borders: cellBorders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: COLOR.accent, type: ShadingType.CLEAR, color: "auto" },
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 22, font: "Arial" })] })],
  });
}

function bodyCell(text, width, opts = {}) {
  return new TableCell({
    borders: cellBorders,
    width: { size: width, type: WidthType.DXA },
    shading: opts.shade ? { fill: COLOR.accentLight, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 80, bottom: 80, left: 140, right: 140 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold, color: opts.color, size: 20, font: opts.mono ? "Consolas" : "Arial" })] })],
  });
}

const TABLE_WIDTH = 9360;
const COL_METHOD = 1500;
const COL_PATH   = 3700;
const COL_DESC   = 4160;

function endpointTable(rows) {
  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [COL_METHOD, COL_PATH, COL_DESC],
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          headingCell("Method", COL_METHOD),
          headingCell("Path",   COL_PATH),
          headingCell("Description", COL_DESC),
        ],
      }),
      ...rows.map(([m, path, desc], i) =>
        new TableRow({
          children: [
            bodyCell(m, COL_METHOD, { bold: true, color: COLOR.accent }),
            bodyCell(path, COL_PATH, { mono: true, shade: i % 2 === 1 }),
            bodyCell(desc, COL_DESC, { shade: i % 2 === 1 }),
          ],
        })
      ),
    ],
  });
}

function kvTable(pairs) {
  const L = 2800, R = TABLE_WIDTH - L;
  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [L, R],
    rows: pairs.map(([k, v], i) => new TableRow({
      children: [
        new TableCell({
          borders: cellBorders,
          width: { size: L, type: WidthType.DXA },
          shading: { fill: COLOR.accentLight, type: ShadingType.CLEAR, color: "auto" },
          margins: { top: 80, bottom: 80, left: 140, right: 140 },
          children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, size: 22, font: "Arial" })] })],
        }),
        new TableCell({
          borders: cellBorders,
          width: { size: R, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 140, right: 140 },
          children: [new Paragraph({ children: [new TextRun({ text: v, size: 22, font: "Consolas" })] })],
        }),
      ],
    })),
  });
}

// ---------- Document body ----------------------------------------------------
const children = [];

// Cover
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 2000, after: 240 },
  children: [new TextRun({ text: "QuikConstruction", bold: true, size: 56, color: COLOR.accent, font: "Arial" })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 240 },
  children: [new TextRun({ text: "API & Database Reference", size: 40, color: COLOR.muted, font: "Arial" })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 160 },
  children: [new TextRun({ text: "Developer onboarding document", italics: true, color: COLOR.muted, size: 24, font: "Arial" })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 6000 },
  children: [new TextRun({ text: "Generated: 22 April 2026", color: COLOR.muted, size: 22, font: "Arial" })],
}));
children.push(new Paragraph({ children: [new PageBreak()] }));

// Section 1 — How to read this doc
children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "1. How to read this document", font: "Arial" })] }));
children.push(p("This document lists every HTTP endpoint exposed by the QuikConstruction backend (Next.js App Router under app/api), together with the PostgreSQL connection string used in local development. Every endpoint is prefixed with /api and is called relative to the base URL of the running server."));
children.push(p("Endpoints are grouped by business module. Each row tells you:", { spacing: { after: 120 } }));
children.push(bullet("Method — which HTTP verb(s) the route implements."));
children.push(bullet("Path — the URL template. Parameters are shown in [brackets]."));
children.push(bullet("Description — what the endpoint does, in one line."));
children.push(p("Base URL in local dev is http://localhost:3010 (NEXTAUTH_URL in .env). Example: GET http://localhost:3010/api/dashboard.", { spacing: { before: 120 } }));

// Section 2 — Database
children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "2. PostgreSQL connection", font: "Arial" })] }));
children.push(p("The app connects to PostgreSQL through Prisma. The connection URL is read from the DATABASE_URL variable in the .env file at the project root."));
children.push(p("Connection string (as configured in .env)", { bold: true, spacing: { before: 160, after: 100 } }));
children.push(new Paragraph({
  spacing: { after: 200 },
  shading: { type: ShadingType.CLEAR, fill: "F4F4F4", color: "auto" },
  border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
  children: [new TextRun({ text: "postgresql://postgres:postgres@127.0.0.1:5432/quikconstruction?schema=public", font: "Consolas", size: 22 })],
}));
children.push(p("Broken down", { bold: true, spacing: { after: 100 } }));
children.push(kvTable([
  ["Driver",      "postgresql"],
  ["Host",        "127.0.0.1 (localhost)"],
  ["Port",        "5432"],
  ["Database",    "quikconstruction"],
  ["Username",    "postgres"],
  ["Password",    "postgres"],
  ["Schema",      "public"],
  ["Env variable","DATABASE_URL (in .env at project root)"],
  ["ORM",         "Prisma (schema at prisma/schema.prisma)"],
]));
children.push(p("Quick setup", { bold: true, spacing: { before: 200, after: 100 } }));
children.push(bullet("Start a local Postgres: docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres --name quikconstruction-pg postgres"));
children.push(bullet("Create the schema and seed data: npx prisma db push && npx prisma db seed"));
children.push(bullet("Open a Prisma Studio GUI to inspect data: npx prisma studio"));
children.push(p("Security note: the credentials above are for local development only. Production credentials must live in a secret manager and never be committed.", { italics: true, color: COLOR.muted, spacing: { before: 160 } }));

children.push(new Paragraph({ children: [new PageBreak()] }));

// Section 3 — Endpoints
children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "3. API endpoints", font: "Arial" })] }));
children.push(p("All endpoints below are relative to the base URL. Path parameters are shown in square brackets (for example, [id] or [projectId]). For routes that implement more than one method (GET/POST, etc.), the Method column lists them together."));

groups.forEach((g, idx) => {
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text: `3.${idx + 1}  ${g.name}`, font: "Arial" })],
  }));
  children.push(p(g.blurb, { italics: true, color: COLOR.muted, spacing: { after: 120 } }));
  children.push(endpointTable(g.rows));
});

// Section 4 — Conventions
children.push(new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 360 },
  children: [new TextRun({ text: "4. Cross-cutting conventions", font: "Arial" })],
}));
children.push(bullet("Authentication — all endpoints except /api/health, /api/ready, /api/auth/* and /api/invites/[token] require a NextAuth session. In dev you can set ENABLE_DEMO_MODE=true in .env to bypass sign-in."));
children.push(bullet("Tenant scoping — every request resolves a tenant from the session; list endpoints automatically filter by the caller's tenant."));
children.push(bullet("Approvals — any document that goes through an approval chain exposes /submit to send it for approval, /approve to act on it, and writes audit rows visible via /api/approvals/[id]/history."));
children.push(bullet("Pagination — list endpoints accept page, pageSize, q (search), and module-specific filters as query parameters, and return { data, total }."));
children.push(bullet("File uploads — never POST a binary to the app. Call /api/files/upload-init to get a signed URL, PUT the bytes to it, then POST /api/files/upload-confirm so the app persists the record."));

// ---------- Build doc --------------------------------------------------------
const doc = new Document({
  creator: "QuikConstruction",
  title: "QuikConstruction API & Database Reference",
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, color: COLOR.accent, font: "Arial" },
        paragraph: { spacing: { before: 320, after: 180 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, color: COLOR.accent, font: "Arial" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    }],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR.accent, space: 4 } },
          children: [new TextRun({ text: "QuikConstruction  ·  API & DB Reference", color: COLOR.muted, size: 18, font: "Arial" })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Page ", size: 18, color: COLOR.muted, font: "Arial" }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: COLOR.muted, font: "Arial" }),
            new TextRun({ text: " of ", size: 18, color: COLOR.muted, font: "Arial" }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: COLOR.muted, font: "Arial" }),
          ],
        })],
      }),
    },
    children,
  }],
});

const outPath = path.join(__dirname, "..", "QuikConstruction_API_Reference.docx");
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log("Wrote", outPath);
});
