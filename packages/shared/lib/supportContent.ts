/**
 * Per-app content for the in-app Contact Support widget — the User Guide
 * sections and the scripted assistant knowledge base.
 *
 * Kept as DATA (not JSX) and kept in @quikit/shared rather than @quikit/ui so
 * it is client-safe, tree-shakeable and editable without touching a component.
 * The widget takes an `appSlug` and looks the entry up, so mounting support in
 * an app is a one-liner: `<SupportLauncher appSlug="quikcrm" />`.
 *
 * The guide describes the modules a user actually has in their sidebar, and the
 * KB answers questions a SIGNED-IN user would ask. The original reference
 * widget answered "pricing / free trial / book a demo", which is useless to
 * someone already inside the product.
 *
 * `replyTo` matches the FIRST entry whose keywords appear in the message, so
 * order matters: put specific topics above generic catch-alls ("support",
 * "help") or the generic entry swallows them.
 */

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface GuideBullet {
  /** Bolded lead-in, usually the module name. */
  label: string;
  text: string;
}

export interface GuideSection {
  heading: string;
  body?: string;
  bullets?: GuideBullet[];
}

export interface KbEntry {
  /** Lowercase substrings matched against the user's message. */
  keywords: string[];
  answer: string;
}

export interface AppSupportContent {
  /** Product name as shown in the panel header and assistant copy. */
  appName: string;
  guide: GuideSection[];
  kb: KbEntry[];
}

/* ─── Entries every app shares ───────────────────────────────────────────── */

/**
 * Tail entries appended to every app's KB. Generic on purpose — they cover
 * "how do I reach a human" and "where did my ticket go", which are identical
 * everywhere. Appended LAST so an app-specific entry always wins the match.
 */
function commonKb(appName: string): KbEntry[] {
  return [
    {
      keywords: ["theme", "colour", "color", "accent", "brand", "logo", "dark mode"],
      answer:
        "You can change your accent colour and theme in your profile settings, and org-wide branding under your company settings. The colour you pick follows you across every QuikIT app.",
    },
    {
      keywords: ["ticket", "raised", "my request", "track", "status of my"],
      answer:
        "Every request you raise here is tracked under Settings → Support Status, with its current status and the latest response from our team. Requests you raised from other QuikIT apps show up there too.",
    },
    {
      keywords: ["bug", "broken", "error", "not working", "crash", "500", "fail"],
      answer: `Sorry that's happening. Go back and choose "Raise a request", pick Bug, and include what you were doing plus what you expected — that goes straight to the QuikIT team with your org and account details attached.`,
    },
    {
      keywords: ["support", "help", "contact", "human", "talk", "email", "reach"],
      answer: `Our team is here to help — go back and choose "Raise a request", or email inquiry@quikit.ai. You can track everything you've raised under Settings → Support Status.`,
    },
    {
      keywords: ["hi", "hello", "hey", "yo", "good morning", "good afternoon"],
      answer: `Hey! 👋 I'm the ${appName} assistant. Ask me how something works — or raise a request and our team will pick it up.`,
    },
  ];
}

/** Closing guide section, identical across apps. */
const NEED_MORE_HELP: GuideSection = {
  heading: "Need more help?",
  body: 'Go back and choose "Raise a request" to reach the QuikIT team, or ask the AI Copilot for a quick answer. You can track everything you have raised under Settings → Support Status.',
};

/* ─── Per-app content ────────────────────────────────────────────────────── */

const CONTENT: Record<string, AppSupportContent> = {
  quikscale: {
    appName: "QuikScale",
    guide: [
      {
        heading: "Getting started with QuikScale",
        body: "QuikScale is your performance operating system — strategy, execution and meeting rhythm in one place. Here's the short tour.",
      },
      {
        heading: "1. Set up your quarters",
        body: "Everything is organised by fiscal quarter. An admin sets the fiscal year start under Settings → Configurations. Until that's done, KPIs and Priorities have no period to attach to.",
      },
      {
        heading: "2. Track execution",
        bullets: [
          {
            label: "KPI",
            text: "the numbers you watch weekly. Set a quarterly goal, enter weekly values, and the traffic-light colours show performance at a glance.",
          },
          {
            label: "Priority",
            text: "your quarterly rocks. Each has an owner, a start and end week, and a status.",
          },
          {
            label: "WWW",
            text: "Who / What / When: the short-term action items that come out of your meetings.",
          },
        ],
      },
      {
        heading: "3. Plan your strategy",
        body: "The OPSP (One Page Strategic Plan) holds long-term goals, this year's targets and the quarterly plan in a single view. Sections can be assigned to owners and reviewed each quarter. Habits and SWT sit alongside it.",
      },
      {
        heading: "4. Run your meeting rhythm",
        body: "Daily huddles and weekly meetings live under Meeting Rhythm, with attendance, scores and notes recorded per meeting. Anything actionable goes straight into WWW so it doesn't get lost.",
      },
      {
        heading: "5. Invite your team",
        body: "Add people and assign roles under Org Setup. Roles control who can view and edit each module — everyone shares the same data, so there's nothing to sync.",
      },
      NEED_MORE_HELP,
    ],
    kb: [
      {
        keywords: ["kpi", "metric", "measure", "target", "weekly value", "traffic light"],
        answer:
          "KPIs live under Execution → KPI. Each KPI has a quarterly goal and weekly values; the cell colour shows performance — blue is exceeded (≥120%), green achieved (≥100%), yellow near (≥80%) and red below target. Use the Team tab for team-level KPIs.",
      },
      {
        keywords: ["priority", "priorities", "rock"],
        answer:
          "Priorities are your quarterly rocks, under Execution → Priority. Give each a start and end week and an owner, then update the status weekly — Completed, On Track, Behind Schedule or Not Yet Started.",
      },
      {
        keywords: ["www", "who what when", "action item", "todo", "to-do"],
        answer:
          "WWW (Who / What / When) tracks short-term action items from your meetings, under Execution → WWW. Each row has an owner, a due date and a status, so nothing agreed in a meeting gets lost.",
      },
      {
        keywords: ["opsp", "one page", "strategic plan", "strategy"],
        answer:
          "The OPSP (One Page Strategic Plan) is under Strategy → OPSP. It holds your long-term goals, this year's targets and the quarterly plan in one view. Sections can be assigned to owners and reviewed each quarter.",
      },
      {
        keywords: ["meeting", "huddle", "rhythm", "weekly meeting", "l10"],
        answer:
          "Meeting Rhythm covers your daily huddles and weekly meetings. Attendance, scores and notes are recorded per meeting, and anything actionable can be captured straight into WWW.",
      },
      {
        keywords: ["quarter", "fiscal", "financial year", "q1", "q2", "q3", "q4"],
        answer:
          "Quarters follow your organisation's fiscal year. An admin sets the fiscal year start and quarter configuration under Settings → Configurations — if you're seeing a 'quarters not set up' warning, that's where to fix it.",
      },
      {
        keywords: ["team", "member", "invite", "user", "role", "permission", "access"],
        answer:
          "Team members and roles are managed under Org Setup. Roles control what each person can view and edit. If you need access to something you can't see, ask an admin in your organisation — or raise a request here and we'll help.",
      },
    ],
  },

  quikcrm: {
    appName: "QuikCRM",
    guide: [
      {
        heading: "Getting started with QuikCRM",
        body: "QuikCRM runs your whole revenue motion — from first touch to a paid order — in one pipeline.",
      },
      {
        heading: "1. Bring in your records",
        body: "Use Imports to upload leads, contacts, accounts and products from a spreadsheet. Map your columns once and the mapping is remembered for the next file.",
      },
      {
        heading: "2. Work the pipeline",
        bullets: [
          { label: "Leads", text: "unqualified interest. Convert a lead and it becomes a contact, an account and an opportunity together." },
          { label: "Contacts & Accounts", text: "the people and the companies they belong to." },
          { label: "Opportunities", text: "live deals with a stage, value and close date — this is what your forecast is built from." },
        ],
      },
      {
        heading: "3. Quote, order, invoice",
        body: "Build a Quote from your Price Lists and Products, send it, then convert the accepted quote into an Order. Everything stays linked back to the opportunity it came from.",
      },
      {
        heading: "4. Stay on top of the day",
        body: "Tasks and Activities capture calls, meetings and follow-ups. Activity Tracker and My Activity Target show what you and your team have actually logged against the target.",
      },
      {
        heading: "5. Automate the repetitive parts",
        body: "Automations fire on record changes — assign an owner, send an email, move a stage. Marketing and Mailbox handle campaigns and two-way email; Telephony logs calls against the right record.",
      },
      NEED_MORE_HELP,
    ],
    kb: [
      {
        keywords: ["lead", "convert", "qualify"],
        answer:
          "Leads live under Leads. When one qualifies, use Convert — QuikCRM creates the Contact, the Account and an Opportunity in one step and keeps them linked, so nothing is retyped.",
      },
      {
        keywords: ["opportunity", "deal", "pipeline", "stage", "forecast"],
        answer:
          "Opportunities are your live deals. Each has a stage, an amount and an expected close date, and the pipeline view lets you drag between stages. Reports → forecast is built from these fields, so keep the close date honest.",
      },
      {
        keywords: ["contact", "account", "company", "customer"],
        answer:
          "Contacts are people, Accounts are the companies they belong to. A contact can be linked to one account; activities, opportunities and documents roll up to the account so you get the full history in one place.",
      },
      {
        keywords: ["quote", "quotation", "price list", "product", "order"],
        answer:
          "Build a Quote from Products and a Price List, send it for approval, then convert the accepted quote into an Order. Price Lists let you hold different rates per customer segment or currency.",
      },
      {
        keywords: ["task", "activity", "follow up", "call log", "meeting"],
        answer:
          "Tasks and Activities capture your calls, meetings and follow-ups against a record. Activity Tracker shows the team's logged activity, and My Activity Target compares your own against the target set for you.",
      },
      {
        keywords: ["automation", "workflow", "trigger", "rule"],
        answer:
          "Automations run under Automations. Pick a trigger (record created, field changed, stage moved), add conditions, then actions like assigning an owner, sending an email or updating a field.",
      },
      {
        keywords: ["email", "mailbox", "campaign", "marketing", "template"],
        answer:
          "Connect your inbox under Mailbox for two-way email sync against contacts. Marketing handles bulk campaigns and templates, with opens and clicks reported back onto the record.",
      },
      {
        keywords: ["import", "csv", "excel", "upload", "bulk"],
        answer:
          "Imports takes a CSV or Excel file for leads, contacts, accounts, products and more. Map your columns once, preview the first rows, then run it — errors are reported per row so you can fix and re-upload just those.",
      },
      {
        keywords: ["telephony", "phone", "dialer", "call"],
        answer:
          "Telephony connects your calling provider so calls are placed from inside QuikCRM and logged automatically against the contact, with duration and recording where your provider supports it.",
      },
      {
        keywords: ["document", "file", "attachment", "folder"],
        answer:
          "Documents holds files against a record or in shared folders. Folder permissions control who can see what, so contracts and internal notes can live in the same app without leaking.",
      },
      {
        keywords: ["report", "dashboard", "analytics"],
        answer:
          "Reports and the Dashboard cover pipeline, conversion, activity and revenue. Most views respect your role, so you see your own numbers unless you manage a team.",
      },
    ],
  },

  quikfinance: {
    appName: "QuikFinance",
    guide: [
      {
        heading: "Getting started with QuikFinance",
        body: "QuikFinance is your books, billing and inventory in one ledger — every document you raise posts through to the accounts automatically.",
      },
      {
        heading: "1. Set up your chart of accounts",
        body: "Chart of Accounts defines the ledgers everything posts to. Add your bank accounts under Bank Accounts so payments and reconciliations have somewhere to land.",
      },
      {
        heading: "2. Money in",
        bullets: [
          { label: "Quotations → Invoices", text: "raise a quote, convert it to an invoice when accepted." },
          { label: "Payments", text: "record what customers pay; Receivables shows what's still outstanding and how overdue it is." },
          { label: "Credit Notes", text: "for returns and adjustments against an issued invoice." },
        ],
      },
      {
        heading: "3. Money out",
        body: "Purchase Orders, Goods Receipts and Bills cover the buying side, with Payables tracking what you owe. OCR Bills reads a supplier PDF and pre-fills the bill for you to check.",
      },
      {
        heading: "4. Inventory and assets",
        body: "Inventory tracks stock levels and movements, wired to Goods Receipts and Delivery Challans. Fixed Assets handles depreciation schedules and posts the entries for you.",
      },
      {
        heading: "5. Close the period",
        body: "Journal Entries handle anything manual. Period Locks freeze a closed month so nobody backdates into it, and Reports gives you the P&L, balance sheet and trial balance.",
      },
      NEED_MORE_HELP,
    ],
    kb: [
      {
        keywords: ["invoice", "bill customer", "receivable", "outstanding"],
        answer:
          "Invoices are under Invoices — raise one directly or convert an accepted Quotation. Receivables shows everything unpaid with its ageing, and recording a Payment against the invoice clears it down.",
      },
      {
        keywords: ["bill", "purchase order", "payable", "supplier", "vendor", "goods receipt"],
        answer:
          "The buying side runs Purchase Order → Goods Receipt → Bill. Payables shows what you owe and when it's due. OCR Bills can read a supplier PDF and pre-fill the bill for you to review before posting.",
      },
      {
        keywords: ["chart of accounts", "ledger", "coa", "account code"],
        answer:
          "Chart of Accounts defines every ledger documents post to. Add or rename accounts there — existing postings keep their link, so renaming is safe.",
      },
      {
        keywords: ["journal", "manual entry", "adjust", "double entry"],
        answer:
          "Journal Entries handle anything the document flows don't cover — accruals, reclasses, opening balances. Each must balance before it posts.",
      },
      {
        keywords: ["period lock", "close", "month end", "year end", "freeze"],
        answer:
          "Period Locks freeze a closed period so nobody can backdate into it. If a document is refusing to save with a past date, an open period lock is usually why.",
      },
      {
        keywords: ["inventory", "stock", "warehouse", "challan"],
        answer:
          "Inventory tracks stock levels and movements. Goods Receipts bring stock in, Delivery Challans take it out, and the valuation flows through to your reports automatically.",
      },
      {
        keywords: ["fixed asset", "depreciation", "capex"],
        answer:
          "Fixed Assets holds each asset with its cost, useful life and depreciation method. The schedule posts the depreciation entries for you each period.",
      },
      {
        keywords: ["bank", "reconcile", "reconciliation", "statement"],
        answer:
          "Bank Accounts and Banking hold your accounts and statements. Import a statement and match lines against recorded payments to reconcile.",
      },
      {
        keywords: ["budget", "forecast", "variance"],
        answer:
          "Budgets lets you set expected figures per account and period; reports then show budget-vs-actual variance.",
      },
      {
        keywords: ["report", "p&l", "profit", "balance sheet", "trial balance", "gst", "tax"],
        answer:
          "Reports covers the P&L, balance sheet, trial balance, ageing and tax summaries. Every report reads the same ledger, so a figure you can see is a figure that posted.",
      },
      {
        keywords: ["recurring", "subscription", "repeat"],
        answer:
          "Recurring sets up documents that generate on a schedule — monthly invoices, standing bills — so you don't re-key the same document each period.",
      },
      {
        keywords: ["expense", "claim", "reimburse"],
        answer:
          "Expenses records spend and, where you use it, reimbursement claims. Approved expenses post to the ledger like any other document.",
      },
    ],
  },

  quikhrms: {
    appName: "QuikHRMS",
    guide: [
      {
        heading: "Getting started with QuikHRMS",
        body: "QuikHRMS covers the full employee lifecycle — hire, onboard, pay, manage and offboard — in one record per person.",
      },
      {
        heading: "1. Build your people directory",
        body: "Employees is the master record: personal details, job, manager, department and documents. Org Chart is generated from the manager field, so keeping that right keeps the chart right.",
      },
      {
        heading: "2. Time and attendance",
        bullets: [
          { label: "Attendance", text: "daily in/out, regularisation requests and monthly summaries." },
          { label: "Leaves", text: "balances, requests and the approval chain." },
          { label: "Duty Roster", text: "shift planning for teams that don't work fixed hours." },
          { label: "Holidays", text: "your calendar per location." },
        ],
      },
      {
        heading: "3. Payroll",
        body: "Payroll runs off the attendance and leave data plus each employee's salary structure. Claims & Declarations collect tax proofs, and Expenses feed reimbursements into the same run.",
      },
      {
        heading: "4. Hire and onboard",
        body: "Recruit handles openings, candidates and interviews. A hired candidate flows into Pre-Onboarding and Onboarding, which create the employee record and their task checklist.",
      },
      {
        heading: "5. Grow and exit",
        body: "Performance covers reviews and goals. Resign, Offboarding and the exit checklist close the loop, with Documents and Audit Logs keeping the paper trail.",
      },
      NEED_MORE_HELP,
    ],
    kb: [
      {
        keywords: ["leave", "holiday request", "time off", "balance", "vacation"],
        answer:
          "Leaves shows your balance per leave type and lets you raise a request; it routes to your manager for approval. If a balance looks wrong, it's usually the leave policy assigned to you — an HR admin can check that under Settings.",
      },
      {
        keywords: ["attendance", "punch", "clock", "regularis", "regulariz", "check in"],
        answer:
          "Attendance shows your daily in/out and monthly summary. Missed a punch? Raise a regularisation request from the same screen and your manager approves it.",
      },
      {
        keywords: ["payroll", "salary", "payslip", "ctc", "pay run"],
        answer:
          "Payroll runs from your attendance, leave and salary structure. Payslips appear once the run is finalised for the month — if yours is missing, the run for that period probably hasn't been closed yet.",
      },
      {
        keywords: ["claim", "declaration", "tax", "investment proof", "80c"],
        answer:
          "Claims & Declarations is where you submit investment declarations and upload proofs. Payroll picks up approved declarations when it computes tax for the period.",
      },
      {
        keywords: ["expense", "reimburse", "claim money"],
        answer:
          "Expenses handles reimbursement claims — attach the receipt, submit, and it routes for approval before flowing into payroll or finance.",
      },
      {
        keywords: ["recruit", "candidate", "interview", "opening", "hiring", "job"],
        answer:
          "Recruit covers openings, the candidate pipeline and interview scheduling. Marking a candidate hired moves them into Pre-Onboarding, which creates their employee record.",
      },
      {
        keywords: ["onboard", "joining", "new hire", "checklist"],
        answer:
          "Onboarding runs the joining checklist — documents to collect, assets to issue, tasks per team. Pre-Onboarding handles everything that happens before day one.",
      },
      {
        keywords: ["offboard", "resign", "exit", "notice", "full and final"],
        answer:
          "Resign raises the request; Offboarding runs the exit checklist — asset return, clearances and the final settlement — with the audit trail kept against the employee record.",
      },
      {
        keywords: ["performance", "review", "appraisal", "goal", "kra"],
        answer:
          "Performance holds review cycles, goals and ratings. Your manager sees your cycle alongside their team's; HR configures the cycle and its stages.",
      },
      {
        keywords: ["org chart", "reporting", "manager", "hierarchy", "department"],
        answer:
          "Org Chart is generated from each employee's manager and department. If someone sits in the wrong place, fix the manager field on their Employees record and the chart updates.",
      },
      {
        keywords: ["document", "letter", "certificate", "policy"],
        answer:
          "Documents holds letters, policies and per-employee files, with visibility controlled by role so payroll documents don't leak to the whole org.",
      },
      {
        keywords: ["delegate", "delegation", "cover", "out of office"],
        answer:
          "Delegations let you hand your approvals to someone else for a date range, so leave and expense requests don't stall while you're away.",
      },
    ],
  },

  quiktrack: {
    appName: "QuikTrack",
    guide: [
      {
        heading: "Getting started with QuikTrack",
        body: "QuikTrack is work tracking built around Spaces — one space per team, project or client, each with its own items, fields and views.",
      },
      {
        heading: "1. Create a Space",
        body: "Spaces holds your work. Each space has its own item types, custom fields, statuses and members, so a client project and an internal backlog don't have to share a shape.",
      },
      {
        heading: "2. Shape your items",
        body: "Add custom fields to capture what your team actually tracks, then set the statuses items move through. Field-level permissions let you keep a field visible to some roles and hidden from others.",
      },
      {
        heading: "3. Find things fast",
        body: "Browse searches across every space you can see. Saved Filters store a query you run often, and each view can be shared with your team.",
      },
      {
        heading: "4. Log your time",
        body: "Timesheet records time against items, and Reports rolls it up per person, space and period — that's what billing and capacity planning read from.",
      },
      {
        heading: "5. Write it down",
        body: "Docs keeps specs and notes next to the work they describe, with per-document access. Dashboards and Notifications keep everyone current without a status meeting.",
      },
      NEED_MORE_HELP,
    ],
    kb: [
      {
        keywords: ["space", "project", "board", "workspace"],
        answer:
          "Spaces are the top-level container — one per team, project or client. Each has its own fields, statuses, views and member list, configured under that space's Settings.",
      },
      {
        keywords: ["field", "custom field", "column", "property"],
        answer:
          "Custom fields are configured per space. You can also set field-level permissions, so a field is visible or editable only to the roles that should see it.",
      },
      {
        keywords: ["status", "workflow", "stage", "transition"],
        answer:
          "Each space defines the statuses its items move through. Change them in the space's settings — existing items keep their current status until someone moves them.",
      },
      {
        keywords: ["timesheet", "time", "log hours", "billable"],
        answer:
          "Timesheet logs time against items. Reports rolls it up by person, space and period, which is what capacity and billing views read from.",
      },
      {
        keywords: ["filter", "search", "browse", "query", "saved view"],
        answer:
          "Browse searches every space you have access to. Save a query you run often under Filters and it becomes a reusable view you can share.",
      },
      {
        keywords: ["doc", "document", "wiki", "note", "spec"],
        answer:
          "Docs keeps specs and notes alongside the work. Access is per document, so a client-facing doc and an internal one can live in the same space.",
      },
      {
        keywords: ["report", "dashboard", "chart", "burndown"],
        answer:
          "Dashboards and Reports cover throughput, time logged and status breakdowns. Most charts respect your access, so you only see spaces you're a member of.",
      },
      {
        keywords: ["notification", "alert", "mention", "watch"],
        answer:
          "Notifications collects mentions, assignments and status changes on items you follow. Tune what you receive in your notification settings.",
      },
      {
        keywords: ["api", "token", "integration", "webhook"],
        answer:
          "API tokens are issued under Settings. Treat one like a password — it carries your access, and anyone holding it can read what you can read.",
      },
      {
        keywords: ["org setup", "member", "invite", "role", "permission", "access"],
        answer:
          "Members and roles are managed under Org Setup, and space membership is set per space. If you can't see a space, ask its owner to add you — or raise a request here.",
      },
    ],
  },

  quikasset: {
    appName: "QuikAsset",
    guide: [
      {
        heading: "Getting started with QuikAsset",
        body: "QuikAsset tracks every physical asset you own — what it is, who has it, and what's happened to it.",
      },
      {
        heading: "1. Register your assets",
        body: "Assets is the register: category, serial number, purchase details, warranty and current condition. Vendors holds who you bought from and who services it.",
      },
      {
        heading: "2. Assign them to people",
        body: "Assignments records who currently holds an asset and since when. Employees see what's assigned to them under Employee View, so there's no dispute about who has what.",
      },
      {
        heading: "3. Handle requests",
        bullets: [
          { label: "Employee Requests", text: "someone asking to be issued an asset." },
          { label: "Repair", text: "raise and track a repair job through to completion." },
          { label: "My Requests", text: "your own open requests and their status." },
        ],
      },
      {
        heading: "4. Keep the history",
        body: "Every issue, return, repair and transfer is written to the Audit Log against the asset, so its full history travels with it.",
      },
      {
        heading: "5. Report on it",
        body: "Reports covers what you own, what's assigned, what's idle and what's out for repair — the numbers you need for an audit or an insurance renewal.",
      },
      NEED_MORE_HELP,
    ],
    kb: [
      {
        keywords: ["asset", "register", "serial", "tag", "inventory"],
        answer:
          "Assets is the register — category, serial number, purchase details, warranty and condition. Each asset carries its full history, so you can see everywhere it's been.",
      },
      {
        keywords: ["assign", "issue", "allocate", "who has", "return"],
        answer:
          "Assignments records who holds an asset and since when. Issue it to a person, and returning it closes the assignment and puts the asset back in the available pool.",
      },
      {
        keywords: ["repair", "maintenance", "service", "broken", "fix"],
        answer:
          "Repair tracks a job from raised to returned, including which vendor has it. The asset shows as out for repair meanwhile, so it isn't assigned to someone else.",
      },
      {
        keywords: ["request", "ask for", "my request", "approval"],
        answer:
          "Employee Requests is where someone asks to be issued an asset; My Requests shows your own and their status. Approvals route to the asset manager for your org.",
      },
      {
        keywords: ["vendor", "supplier", "warranty", "amc", "purchase"],
        answer:
          "Vendors holds who you bought from and who services each category, along with warranty and AMC dates so a renewal doesn't slip past.",
      },
      {
        keywords: ["report", "audit", "depreciation", "count"],
        answer:
          "Reports covers holdings, assignments, idle stock and repair status. The Audit Log records every movement, which is what an audit or insurance renewal will ask for.",
      },
      {
        keywords: ["employee view", "my asset", "what do i have"],
        answer:
          "Employee View shows each person exactly what's assigned to them right now, so there's no argument about who is holding which laptop.",
      },
    ],
  },

  quikinfra: {
    appName: "QuikInfra",
    guide: [
      {
        heading: "Getting started with QuikInfra",
        body: "QuikInfra runs construction and infrastructure projects — site execution, procurement, stores and quality against one project plan.",
      },
      {
        heading: "1. Set up your masters",
        body: "Masters holds the shared reference data — items, units, cost heads, vendors, locations. Getting this right first means every project downstream speaks the same language.",
      },
      {
        heading: "2. Plan the project",
        body: "Projects holds the work breakdown, budget and schedule. Costs booked anywhere in the app roll up here, so the budget view is always live.",
      },
      {
        heading: "3. Buy and receive",
        bullets: [
          { label: "Purchase", text: "indents, enquiries, comparatives and purchase orders." },
          { label: "Store", text: "goods receipt, issue to site, and running stock per store." },
          { label: "Approvals", text: "the queue of anything waiting on you." },
        ],
      },
      {
        heading: "4. Run the site",
        body: "Equipment tracks plant and machinery with utilisation and logs. Quality and Safety capture checklists, observations and incidents against the project.",
      },
      {
        heading: "5. Watch the numbers",
        body: "Finance covers bills, payments and project cost. Reports gives budget-vs-actual, stock and progress views, and Audit keeps the trail of who changed what.",
      },
      NEED_MORE_HELP,
    ],
    kb: [
      {
        keywords: ["project", "wbs", "budget", "schedule", "site"],
        answer:
          "Projects holds the work breakdown, budget and schedule. Every cost booked in purchase, stores or finance rolls up here, so budget-vs-actual is live rather than a monthly export.",
      },
      {
        keywords: ["purchase", "indent", "po", "order", "comparative", "enquiry"],
        answer:
          "Purchase runs indent → enquiry → comparative → purchase order. Each step carries the project and cost head forward, so the spend lands against the right budget line.",
      },
      {
        keywords: ["store", "stock", "grn", "issue", "material", "receipt"],
        answer:
          "Store handles goods receipt against a PO, issue to site, and running stock per store. Issues consume the project budget at the point the material leaves the store.",
      },
      {
        keywords: ["master", "item", "unit", "cost head", "vendor"],
        answer:
          "Masters holds the shared reference data — items, units, cost heads, vendors and locations. Add a new item there once and every project can use it.",
      },
      {
        keywords: ["approval", "approve", "pending", "waiting", "sign off"],
        answer:
          "Approvals is your queue of everything waiting on you across purchase, stores and finance. The approval chain is configured per document type and value band.",
      },
      {
        keywords: ["equipment", "plant", "machinery", "utilisation", "utilization"],
        answer:
          "Equipment tracks plant and machinery — deployment, utilisation and running logs — so idle machines on a site show up rather than quietly billing.",
      },
      {
        keywords: ["quality", "checklist", "inspection", "ncr"],
        answer:
          "Quality captures inspection checklists and observations against the project, with the non-conformance trail kept alongside the work it relates to.",
      },
      {
        keywords: ["safety", "incident", "toolbox", "hse"],
        answer:
          "Safety records observations, incidents and toolbox talks per site, so the HSE record is built as work happens rather than reconstructed later.",
      },
      {
        keywords: ["finance", "bill", "payment", "invoice", "ra bill"],
        answer:
          "Finance covers contractor bills, payments and project cost. Bills reference the PO and the project, so the cost lands on the right budget line automatically.",
      },
      {
        keywords: ["report", "mis", "progress", "variance"],
        answer:
          "Reports covers budget-vs-actual, stock, procurement status and site progress. Audit records who changed what, which is what a project review usually opens with.",
      },
    ],
  },

  quiklms: {
    appName: "QuikLMS",
    guide: [
      {
        heading: "Getting started with QuikLMS",
        body: "QuikLMS is your learning platform — courses, live classes, assessments and certificates, with a different home screen depending on whether you're a learner, teacher, parent or admin.",
      },
      {
        heading: "1. Find your dashboard",
        body: "What you see depends on your role. Learners get their enrolled courses and upcoming sessions; teachers get their batches and submissions; admins get the org-wide view.",
      },
      {
        heading: "2. Build a course",
        body: "Create Course sets up the structure — modules, lessons, videos and materials. Courses lists everything published, and Batches groups the learners taking it together.",
      },
      {
        heading: "3. Teach and assess",
        bullets: [
          { label: "Recordings & Video", text: "session recordings and uploaded content." },
          { label: "Question Bank & Exams", text: "reusable questions and the assessments built from them." },
          { label: "Quiz Proctoring", text: "supervision settings for exams that need it." },
        ],
      },
      {
        heading: "4. Track progress",
        body: "Analytics covers course, school and learner performance. Submissions show what's waiting to be marked, and Certificates issue automatically once a learner meets the criteria.",
      },
      {
        heading: "5. Manage people",
        body: "User Management, Teachers, Students, Parents and Sub-Admins control who's in the platform and what they can do. Branding sets how it looks for your organisation.",
      },
      NEED_MORE_HELP,
    ],
    kb: [
      {
        keywords: ["course", "module", "lesson", "curriculum", "create course"],
        answer:
          "Create Course builds the structure — modules, lessons, videos and materials — and Courses lists what's published. Learners only see a course once it's published and they're in a batch for it.",
      },
      {
        keywords: ["batch", "class", "cohort", "group", "enrol", "enroll"],
        answer:
          "Batches group the learners taking a course together, with their own schedule and teacher. Enrolment happens at the batch level, not the course level.",
      },
      {
        keywords: ["exam", "quiz", "test", "assessment", "question bank"],
        answer:
          "Question Bank holds reusable questions; Exams assemble them into an assessment with timing and attempt rules. Quiz Proctoring adds supervision where an exam needs it.",
      },
      {
        keywords: ["certificate", "completion", "verify"],
        answer:
          "Certificates are issued automatically once a learner meets the course criteria, and each one has a public verification link so an employer can check it.",
      },
      {
        keywords: ["recording", "video", "live", "session", "playback"],
        answer:
          "Recordings holds session captures and uploaded video. Video settings control quality and storage; session timestamps let you jump to a moment inside a long recording.",
      },
      {
        keywords: ["submission", "assignment", "grade", "mark", "homework"],
        answer:
          "Submissions lists what's waiting to be marked, split by batch. Grading a submission updates the learner's progress and feeds the course analytics.",
      },
      {
        keywords: ["teacher", "availability", "level", "payout"],
        answer:
          "Teachers holds your teaching staff, Teacher Availability their bookable hours, and Payouts what they're owed for sessions delivered.",
      },
      {
        keywords: ["student", "learner", "parent", "progress"],
        answer:
          "Students and Parents manage learner records and guardian access. A parent signs in to their own dashboard and sees only their child's progress.",
      },
      {
        keywords: ["analytics", "report", "performance", "attendance"],
        answer:
          "Analytics covers course, school and learner performance — completion, scores and attendance. School Analytics is the org-wide roll-up.",
      },
      {
        keywords: ["branding", "logo", "domain", "white label"],
        answer:
          "Branding sets your organisation's logo, colours and naming across the learner-facing screens, so the platform looks like yours.",
      },
      {
        keywords: ["credit", "storage", "quota", "limit"],
        answer:
          "Credits Config and Storage show what your plan allows and what you've used. If uploads start failing, storage is the first place to look.",
      },
    ],
  },

  quikvc: {
    appName: "QuikVC",
    guide: [
      {
        heading: "Getting started with QuikVC",
        body: "QuikVC runs deal flow end to end — sourcing, diligence, decision and portfolio — with separate views for the investment team, founders and investors.",
      },
      {
        heading: "1. Source and screen",
        body: "Sourcing captures inbound and outbound opportunities. A promising one becomes a Deal, which is where the diligence work actually happens.",
      },
      {
        heading: "2. Run diligence",
        body: "Each Deal holds the application, documents, the memo sections and the question thread with the founder. Sections can be drafted, edited and assigned before the memo goes to committee.",
      },
      {
        heading: "3. Work with founders",
        body: "Founders sign in to their own portal to complete the Application, upload Documents and answer Questions. Everything they submit lands straight on the deal — no email attachments to chase.",
      },
      {
        heading: "4. Decide",
        body: "The memo's recommendation section carries the decision and its conditions. Notifications keep the team current as a deal moves through the stages.",
      },
      {
        heading: "5. Manage the portfolio",
        body: "Investors see Portfolio, Summary and Repayments in their own portal. Admin controls users, verticals and the platform configuration behind all of it.",
      },
      NEED_MORE_HELP,
    ],
    kb: [
      {
        keywords: ["deal", "diligence", "memo", "pipeline", "stage"],
        answer:
          "Deals is where diligence happens — application, documents, memo sections and the founder question thread in one record. Memo sections can be assigned and drafted separately before committee.",
      },
      {
        keywords: ["sourcing", "inbound", "pipeline", "opportunity", "screen"],
        answer:
          "Sourcing captures opportunities before they're a deal. Promote one and it becomes a Deal with the application already attached.",
      },
      {
        keywords: ["founder", "application", "apply", "startup"],
        answer:
          "Founders get their own portal — Application, Documents and Questions. What they submit lands directly on the deal record, so nothing arrives as a loose email attachment.",
      },
      {
        keywords: ["question", "q&a", "ask founder", "thread"],
        answer:
          "Questions is the two-way thread with the founder against a deal. Ask there rather than by email and the answer stays attached to the diligence record.",
      },
      {
        keywords: ["document", "data room", "upload", "file"],
        answer:
          "Documents holds the data room per deal. Founders upload from their portal; the investment team sees them in place on the deal.",
      },
      {
        keywords: ["portfolio", "investor", "summary", "holding"],
        answer:
          "Investors sign in to Portfolio and Summary for their holdings, and Repayments for what's due and paid. They see only their own positions.",
      },
      {
        keywords: ["repayment", "return", "distribution", "schedule"],
        answer:
          "Repayments tracks the schedule and what's actually been paid against each investment, visible in the investor portal.",
      },
      {
        keywords: ["vertical", "sector", "admin", "config"],
        answer:
          "Admin controls users, verticals and platform configuration. Verticals drive how deals are categorised and reported.",
      },
    ],
  },

  quiksocial: {
    appName: "QuikSocial",
    guide: [
      {
        heading: "Getting started with QuikSocial",
        body: "QuikSocial plans, approves and publishes your social content across every brand and channel you run.",
      },
      {
        heading: "1. Connect your channels",
        body: "Integrations links your social accounts. Brands groups them, so an agency running several clients keeps each one's channels, assets and approvals separate.",
      },
      {
        heading: "2. Create content",
        body: "Posts is where a piece of content is written, with its copy, media and target channels. Content Hub and Assets hold the reusable creative you draw from, and Catalog holds product content.",
      },
      {
        heading: "3. Get it approved",
        body: "Approval routes a post to whoever signs off — internal lead or client — before anything goes out. A rejected post comes back with the comment attached.",
      },
      {
        heading: "4. Schedule it",
        body: "Calendar is the publishing plan across brands and channels. Drag to reschedule; the post publishes itself at the slot you set.",
      },
      {
        heading: "5. Campaigns and replies",
        body: "Campaigns group posts around a theme or launch so you can report on them together. Auto-Reply handles common inbound comments and messages without someone watching the inbox.",
      },
      NEED_MORE_HELP,
    ],
    kb: [
      {
        keywords: ["post", "content", "caption", "create", "draft"],
        answer:
          "Posts holds each piece of content — copy, media and the channels it targets. Save as draft, send for approval, then schedule it on the Calendar.",
      },
      {
        keywords: ["calendar", "schedule", "publish", "when"],
        answer:
          "Calendar is your publishing plan across brands and channels. Drag a post to reschedule it; it publishes automatically at the slot you set.",
      },
      {
        keywords: ["approval", "approve", "review", "sign off", "reject"],
        answer:
          "Approval routes a post to whoever signs off before it goes out. A rejection comes back with the reviewer's comment attached so the edit is obvious.",
      },
      {
        keywords: ["brand", "client", "account", "workspace"],
        answer:
          "Brands separate the accounts you run — an agency's clients each get their own channels, assets and approval chain, with no bleed between them.",
      },
      {
        keywords: ["integration", "connect", "channel", "instagram", "facebook", "linkedin", "token"],
        answer:
          "Integrations links your social accounts per brand. If publishing starts failing, a channel's token has usually expired — reconnect it there.",
      },
      {
        keywords: ["asset", "media", "image", "video", "library"],
        answer:
          "Assets and Content Hub hold the reusable creative you draw from when building a post, so the same approved image isn't re-uploaded five times.",
      },
      {
        keywords: ["campaign", "theme", "launch"],
        answer:
          "Campaigns group posts around a launch or theme so you can plan and report on them as one thing rather than post by post.",
      },
      {
        keywords: ["auto reply", "auto-reply", "comment", "dm", "inbox", "message"],
        answer:
          "Auto-Reply answers common inbound comments and messages using rules you set, so routine replies don't need someone watching the inbox.",
      },
      {
        keywords: ["catalog", "product", "shop"],
        answer:
          "Catalog holds product content you can pull into a post, so product details stay consistent wherever they're published.",
      },
    ],
  },

  quiksupport: {
    appName: "QuikSupport",
    guide: [
      {
        heading: "Getting started with QuikSupport",
        body: "QuikSupport is your customer helpdesk — inbound tickets, assignment and resolution, in one queue.",
      },
      {
        heading: "1. Watch the queue",
        body: "The Dashboard is the live queue: what's unassigned, what's yours, and what's breaching. Filters let you carve out just the slice you own.",
      },
      {
        heading: "2. Work a ticket",
        body: "Open a ticket for the full conversation and history with that customer. Reply, change status and priority, and reassign when it needs someone else.",
      },
      {
        heading: "3. Route work",
        body: "Assignment puts a ticket with the right agent or team. Anything left unassigned stays visible at the top of the queue rather than quietly ageing.",
      },
      {
        heading: "4. Keep it honest",
        body: "Status tells the customer where things stand; priority tells your team what to pick up next. Both are on the ticket header, so nothing is buried in the thread.",
      },
      NEED_MORE_HELP,
    ],
    kb: [
      {
        keywords: ["ticket", "queue", "inbox", "case"],
        answer:
          "The Dashboard is your live queue — unassigned, yours, and anything breaching. Open a ticket for the full conversation and history with that customer.",
      },
      {
        keywords: ["assign", "reassign", "agent", "owner", "route"],
        answer:
          "Assignment puts a ticket with an agent or team. Unassigned tickets stay at the top of the queue rather than quietly ageing out of sight.",
      },
      {
        keywords: ["priority", "urgent", "escalate", "sla", "breach"],
        answer:
          "Priority drives what your team picks up next, and the queue highlights anything approaching or past its target response. Escalate by raising priority and reassigning.",
      },
      {
        keywords: ["reply", "respond", "customer", "email"],
        answer:
          "Replies go out from the ticket itself, so the whole thread stays in one place and the next agent picking it up has the full context.",
      },
      {
        keywords: ["close", "resolve", "reopen", "status"],
        answer:
          "Status moves a ticket through open → in progress → resolved → closed. A customer replying to a resolved ticket reopens it rather than starting a new one.",
      },
    ],
  },

  quikchat: {
    appName: "QuikChat",
    guide: [
      {
        heading: "Getting started with QuikChat",
        body: "QuikChat is your team's messaging — channels, direct messages, calls and files, scoped to your organisation.",
      },
      {
        heading: "1. Find your conversations",
        body: "The sidebar lists your channels and direct messages, most recent first. Unread conversations are highlighted, and mentions are called out separately so they don't get lost.",
      },
      {
        heading: "2. Send more than text",
        body: "Attach files, record a voice note, react with an emoji or reply in a thread to keep a side discussion out of the main flow. Mention someone with @ to pull them in.",
      },
      {
        heading: "3. Call when typing is slower",
        body: "Start a voice or video call straight from a conversation — no separate link to share, and everyone in the conversation can join.",
      },
      {
        heading: "4. Control the noise",
        body: "Notification settings are per conversation as well as global, so a busy channel can be muted without going quiet everywhere.",
      },
      NEED_MORE_HELP,
    ],
    kb: [
      {
        keywords: ["channel", "group", "conversation", "create"],
        answer:
          "Channels are your group conversations, listed in the sidebar with unread ones highlighted. Direct messages sit in the same list, most recent first.",
      },
      {
        keywords: ["mention", "@", "tag", "notify someone"],
        answer:
          "Type @ and pick a person to mention them — they get notified even in a muted channel, and mentions are called out separately so they don't get buried.",
      },
      {
        keywords: ["thread", "reply", "side conversation"],
        answer:
          "Reply in a thread to keep a side discussion attached to the message it's about, instead of scrolling the whole channel off course.",
      },
      {
        keywords: ["call", "video", "voice", "meeting", "screen"],
        answer:
          "Start a voice or video call straight from a conversation. Everyone in it can join — there's no separate link to circulate.",
      },
      {
        keywords: ["file", "upload", "attach", "image", "document"],
        answer:
          "Attach files directly to a message. They stay with the conversation, so finding that spreadsheet later means finding the conversation, not the email.",
      },
      {
        keywords: ["notification", "mute", "sound", "alert", "quiet"],
        answer:
          "Notification settings work per conversation as well as globally, so you can mute a busy channel without going quiet everywhere.",
      },
      {
        keywords: ["voice note", "audio", "record"],
        answer:
          "Record a voice note from the composer when typing is slower than talking — it posts inline with a waveform so people can scrub through it.",
      },
      {
        keywords: ["reaction", "emoji", "react"],
        answer:
          "React to a message with an emoji instead of adding a one-word reply — it acknowledges without pushing the conversation down.",
      },
    ],
  },

  admin: {
    appName: "QuikIT Admin",
    guide: [
      {
        heading: "Getting started with QuikIT Admin",
        body: "Admin is where your organisation is configured — the people, the apps they can reach, and the settings shared across every QuikIT product.",
      },
      {
        heading: "1. Manage your people",
        body: "Invite members, set their organisation role, and deactivate anyone who leaves. The role you set here is the org-level role every app reads as its baseline.",
      },
      {
        heading: "2. Grant app access",
        body: "Each member is granted the apps they need. A member without access to an app is redirected away from it — grant it here and they can sign straight in.",
      },
      {
        heading: "3. Configure the organisation",
        body: "Company details, branding and the accent colour set here apply across every QuikIT app your team uses, so the suite looks like one product.",
      },
      NEED_MORE_HELP,
    ],
    kb: [
      {
        keywords: ["member", "user", "invite", "add person", "deactivate"],
        answer:
          "Invite members from the members page and set their organisation role. Deactivating a member revokes their access everywhere at once rather than app by app.",
      },
      {
        keywords: ["app access", "grant", "app", "cannot access", "denied", "no access"],
        answer:
          "App access is granted per member. Someone seeing an 'access not granted' message needs that app enabled against their record here — then they can sign straight in.",
      },
      {
        keywords: ["role", "permission", "admin", "owner"],
        answer:
          "The organisation role set here is the baseline every app reads. Individual apps layer their own roles on top, so someone can be an org member but an admin inside one app.",
      },
      {
        keywords: ["branding", "logo", "accent", "company", "colour", "color"],
        answer:
          "Company details, logo and accent colour are set once here and apply across every QuikIT app your organisation uses.",
      },
      {
        keywords: ["plan", "subscription", "billing", "invoice", "upgrade"],
        answer:
          "Your plan and its limits are shown against the organisation. To change plan or query an invoice, raise a request here and our team will pick it up.",
      },
    ],
  },

  quikit: {
    appName: "QuikIT",
    guide: [
      {
        heading: "Welcome to QuikIT",
        body: "QuikIT is the home for your whole suite — one sign-in, and every app your organisation has enabled.",
      },
      {
        heading: "1. Open an app",
        body: "The launcher shows every app you have been granted. Pick one and you are signed straight in — there is no second login.",
      },
      {
        heading: "2. Switch organisations",
        body: "If you belong to more than one organisation, switch between them from the launcher. Each keeps its own data, apps and settings.",
      },
      {
        heading: "3. Missing an app?",
        body: "Apps you have not been granted are not shown. Ask an admin in your organisation to grant access, or raise a request here and we will help.",
      },
      NEED_MORE_HELP,
    ],
    kb: [
      {
        keywords: ["app", "launcher", "open", "missing", "cannot see", "not showing"],
        answer:
          "The launcher shows every app you have been granted. If one is missing, an admin in your organisation needs to grant you access to it — or raise a request here and we will help.",
      },
      {
        keywords: ["organisation", "organization", "switch", "tenant", "workspace"],
        answer:
          "If you belong to more than one organisation you can switch between them from the launcher. Each keeps its own data, apps and settings — nothing is shared across them.",
      },
      {
        keywords: ["login", "sign in", "password", "sso", "locked out", "reset"],
        answer:
          "One QuikIT sign-in covers every app, so there is no separate password per product. If you cannot sign in at all, raise a request here from a device where you are still signed in, or email inquiry@quikit.ai.",
      },
      {
        keywords: ["profile", "name", "email", "account"],
        answer:
          "Your name, email and preferences are set once against your QuikIT account and follow you into every app.",
      },
    ],
  },
};

/* ─── Lookup ─────────────────────────────────────────────────────────────── */

/**
 * Content for an app, with the shared KB tail appended.
 *
 * Falls back to a generic entry for a slug with no bespoke content — a new app
 * still gets a working widget on day one, before anyone writes its guide.
 */
export function getSupportContent(appSlug: string): AppSupportContent {
  const entry = CONTENT[appSlug];
  if (entry) {
    return { ...entry, kb: [...entry.kb, ...commonKb(entry.appName)] };
  }
  const appName = "QuikIT";
  return {
    appName,
    guide: [
      {
        heading: `Getting started`,
        body: "Use the sidebar to move between modules. Most screens list your records with filters at the top and a button to add a new one.",
      },
      {
        heading: "Access and roles",
        body: "What you can see and edit is set by your role. If a module is missing or read-only for you, an admin in your organisation controls that.",
      },
      NEED_MORE_HELP,
    ],
    kb: commonKb(appName),
  };
}

/** Opening line the assistant greets with. */
export function supportGreeting(appName: string): string {
  return `Hi there 👋 I'm the ${appName} assistant. Ask me how something works — or raise a request to reach our team.`;
}

/** Shown when nothing in the KB matches. */
export function supportFallback(): string {
  return `Thanks for your message! I don't have an answer for that one. Go back and choose "Raise a request" to reach the QuikIT team — they'll follow up and you can track it under Settings → Support Status.`;
}

/** First KB entry whose keywords appear in the message, else the fallback. */
export function replyTo(text: string, kb: KbEntry[]): string {
  const t = text.toLowerCase();
  for (const entry of kb) {
    if (entry.keywords.some((k) => t.includes(k))) return entry.answer;
  }
  return supportFallback();
}
