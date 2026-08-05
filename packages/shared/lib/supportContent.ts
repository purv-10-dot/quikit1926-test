/**
 * Per-app User Guide content for the in-app Contact Support widget.
 *
 * Kept as DATA (not JSX) and kept in @quikit/shared rather than @quikit/ui so
 * it is client-safe, tree-shakeable and editable without touching a component.
 * The widget takes an `appSlug` and looks the entry up, so mounting support in
 * an app is a one-liner: `<SupportLauncher appSlug="quikcrm" />`.
 *
 * The guide describes the modules a user actually has in their sidebar. The
 * original reference widget's content answered "pricing / free trial / book a
 * demo", which is useless to someone already inside the product.
 *
 * This file also carried a scripted assistant knowledge base for an "Ask the AI
 * Copilot" panel view. That view was removed, so the KB went with it rather
 * than lingering as ~600 lines nothing imports. Recoverable from git history if
 * the Copilot is ever revived.
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

export interface AppSupportContent {
  /** Product name as shown in the panel header. */
  appName: string;
  guide: GuideSection[];
}

/** Closing guide section, identical across apps. */
const NEED_MORE_HELP: GuideSection = {
  heading: "Need more help?",
  body: 'Go back and choose "Raise a request" to reach the QuikIT team. Attach a screenshot if something looks wrong — it usually saves a round-trip.',
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
  },
};

/* ─── Lookup ─────────────────────────────────────────────────────────────── */

/**
 * Guide content for an app.
 *
 * Falls back to a generic entry for a slug with no bespoke content — a new app
 * still gets a working widget on day one, before anyone writes its guide.
 */
export function getSupportContent(appSlug: string): AppSupportContent {
  const entry = CONTENT[appSlug];
  if (entry) return entry;

  return {
    appName: "QuikIT",
    guide: [
      {
        heading: "Getting started",
        body: "Use the sidebar to move between modules. Most screens list your records with filters at the top and a button to add a new one.",
      },
      {
        heading: "Access and roles",
        body: "What you can see and edit is set by your role. If a module is missing or read-only for you, an admin in your organisation controls that.",
      },
      NEED_MORE_HELP,
    ],
  };
}
