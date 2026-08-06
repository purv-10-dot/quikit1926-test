import type { KBChapter } from "../types";

/* ────────────────────────────────────────────────────────────────────────────
 * Platform — org setup, settings, roles & permissions, exports, and the Cash
 * pillar roadmap. Mostly administrator material.
 * ──────────────────────────────────────────────────────────────────────────── */

export const orgSetup: KBChapter = {
  id: "org-setup",
  title: "Org Setup",
  pillar: "Platform",
  summary: "Teams, users, quarter settings and unit master — the four things to configure before anything else.",
  route: "/org-setup/teams",
  sections: [
    {
      id: "os-order",
      title: "Set it up in this order",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Quarter Settings", text: "Generate the fiscal year first. Nothing week-based works without it." },
            { title: "Teams", text: "Create the teams before inviting people, so users can be assigned as they are added." },
            { title: "Users", text: "Invite people, assign them to teams and give them roles." },
            { title: "Unit Master", text: "Define the display units your Number KPIs will use." },
          ],
        },
        {
          type: "figure",
          file: "org-setup-nav.png",
          caption: "Org Setup",
          hint: "Screenshot of the sidebar with Org Setup expanded showing Teams, Users, Quarter Settings and Unit Master, alongside one of those pages open.",
        },
      ],
    },
    {
      id: "os-quarters",
      title: "Quarter Settings",
      blocks: [
        {
          type: "p",
          text: "This page defines your fiscal calendar — the foundation every week-based module is built on. See the Fiscal Calendar chapter for the concepts; this section covers the operations.",
        },
        {
          type: "steps",
          items: [
            { title: "Generate a fiscal year", text: "Click Initialize / Generate, set the Q1 start date, and QuikScale creates all four quarters." },
            { title: "Set week counts if needed", text: "With Custom Quarter Settings enabled you can set weeks per quarter. Leaving all four at 13 gives clean calendar three-month quarters." },
            { title: "Edit a quarter", text: "Open a quarter to adjust its start date or week count. Derived values are shown read-only so you can see the effect before saving." },
            { title: "Delete", text: "Quarters and whole fiscal years can be removed. Do this only for a year with no data — deleting a quarter that has KPIs orphans their week structure." },
          ],
        },
        {
          type: "callout",
          tone: "warn",
          title: "Reload after changing the calendar",
          text: "Quarter changes take effect on your next navigation into a module. If a grid still shows the old number of week columns, reload the browser tab." },
      ],
    },
    {
      id: "os-teams",
      title: "Teams",
      blocks: [
        {
          type: "bullets",
          items: [
            "A team has a name and a team head, and holds a set of members.",
            "Teams drive Team KPIs, the dashboard's Team tab, Analytics → Teams and most filter dropdowns.",
            "A person can belong to more than one team.",
            "Keep teams aligned to how work is actually organised — mirroring a formal org chart that nobody works to produces filters nobody uses.",
          ],
        },
      ],
    },
    {
      id: "os-users",
      title: "Users",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Add a user", text: "Enter their name and email address and send the invitation." },
            { title: "Assign teams", text: "Add them to one or more teams." },
            { title: "Assign roles", text: "Give them the roles that match what they need to do. A user can hold several roles; grants add together." },
            { title: "Grant extras if needed", text: "Individual permissions can be added on top of a user's roles for one-off cases. Extras only ever add access — they can never take it away." },
          ],
        },
        {
          type: "callout",
          tone: "rule",
          title: "An organisation must keep at least one administrator",
          text: "QuikScale blocks any change that would remove the last administrator from an organisation. If you are moving admin duties, grant the new administrator first, then remove the old one." },
      ],
    },
    {
      id: "os-units",
      title: "Unit Master",
      blocks: [
        {
          type: "p",
          text: "Unit Master holds the display labels available to Number KPIs — Leads, Calls, Tickets, Demos, Sign-ups and so on. Choosing from a curated list instead of free-typing keeps exports and reports consistent.",
        },
        {
          type: "bullets",
          items: [
            "Add units as you need them; keep the list short and singular in style.",
            "Deleted units go to a trash view rather than vanishing, so a mistaken delete is recoverable.",
            "Currency KPIs use your organisation's currency from Settings → Company, not Unit Master.",
          ],
        },
      ],
    },
  ],
};

export const settings: KBChapter = {
  id: "settings",
  title: "Settings",
  pillar: "Platform",
  summary: "Your profile, the company profile and the configuration switches that shape the whole application.",
  route: "/settings",
  sections: [
    {
      id: "set-profile",
      title: "Profile",
      blocks: [
        {
          type: "p",
          text: "Your own details — name, email and the role labels you hold. Available to every user from the header's user menu.",
        },
      ],
    },
    {
      id: "set-company",
      title: "Company",
      blocks: [
        {
          type: "p",
          text: "Administrator-only. Sets the organisation-wide identity and formatting.",
        },
        {
          type: "kv",
          items: [
            { k: "Organisation name", v: "Shown in the header chip and on every export." },
            { k: "Country and timezone", v: "Drives date handling and week boundaries." },
            { k: "Currency", v: "Used by every Currency KPI and in exports." },
            { k: "Accent colour", v: "The theme colour applied across buttons, the sidebar, active states and table headers. Ten presets are available, and the change is applied live." },
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "The accent colour never touches data colours",
          text: "Changing the accent recolours the interface chrome only. KPI traffic-light cells, Priority and WWW status colours and quarter badges stay fixed, so a red cell means the same thing in a purple tenant as in a blue one." },
        {
          type: "figure",
          file: "settings-company.png",
          caption: "Company settings",
          hint: "Screenshot of Settings → Company showing the organisation name, country/timezone pickers, currency and the row of ten accent-colour swatches.",
        },
      ],
    },
    {
      id: "set-config",
      title: "Configurations",
      blocks: [
        {
          type: "p",
          text: "Administrator-only. The feature switches that turn modules on and off for the organisation and tune the strategy deadlines.",
        },
        {
          type: "table",
          head: ["Setting", "Effect"],
          widths: [1.2, 2.4],
          rows: [
            ["Module toggles", "Switch whole modules on or off. A disabled module disappears from the sidebar for everyone, regardless of permissions."],
            ["Custom quarter settings", "Unlocks per-quarter week counts and the weekly meeting day. See the Fiscal Calendar chapter."],
            ["Weekly meeting day", "The day your week turns over. Drives dynamic week boundaries and partial weeks."],
            ["OPSP finalize threshold", "Days allowed to finalize an OPSP, counted from the date the OPSP was created. Drives the countdown banner and, in automatic mode, the auto-finalize."],
            ["OPSP review threshold", "Days allowed to review a finalized OPSP. Drives the review reminder banner. It never auto-finalizes anything and has no hard cutoff."],
          ],
        },
        {
          type: "callout",
          tone: "warn",
          title: "The review reminder looks back across quarters",
          text: "The review banner tracks the oldest finalized-but-unreviewed OPSP, not just the current quarter. If you enable the review threshold while an old quarter is still unreviewed, the banner will show as overdue until that quarter is reviewed." },
      ],
    },
  ],
};

export const permissions: KBChapter = {
  id: "permissions",
  title: "Roles & Permissions",
  pillar: "Platform",
  summary: "How access is granted, what the seeded roles can do, and why there is no administrator bypass.",
  sections: [
    {
      id: "perm-model",
      title: "The model",
      blocks: [
        {
          type: "p",
          text: "Access in QuikScale is the union of two things: the permissions carried by the roles a user holds, and any per-user extras granted on top. There is no code path that lets a role skip a check because it is called 'admin' — the administrator role is powerful because it has been granted the permissions, not because it is exempt from them.",
        },
        {
          type: "kv",
          items: [
            { k: "Role", v: "A named set of permissions scoped to your organisation. A user can hold several." },
            { k: "Permission", v: "A resource plus an action. Resources are dot-namespaced (KPI, TeamKPI, Priority, WWW, OPSP.Review, Analytics.Teams…), and actions are view, create, update and delete." },
            { k: "Navigation", v: "Which sidebar entries a role can see. Anything not permitted is hidden rather than shown disabled." },
            { k: "Per-user extra", v: "An additional grant for one person. Additive only — an extra can never revoke something a role grants." },
          ],
        },
        {
          type: "table",
          caption: "Seeded roles",
          head: ["Role", "Grants"],
          widths: [1, 3],
          rows: [
            ["admin", "Every permission except the one that unlocks a finalized OPSP for editing, which must be granted deliberately."],
            ["Member (default)", "Dashboard view, plus full create / read / update / delete on KPI, Team KPI, Priority and WWW. Nothing else — Strategy, People, Org Setup, Meeting Rhythm and Analytics must be granted explicitly."],
          ],
        },
        {
          type: "callout",
          tone: "rule",
          title: "Unlocking a finalized OPSP is opt-in",
          text: "Even the seeded administrator role does not carry the permission to edit a finalized OPSP. It is the one deliberately destructive action in the product, so it must be granted to a named person on purpose." },
      ],
    },
    {
      id: "perm-practice",
      title: "Granting access in practice",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Start from the default", text: "New users join with the Member role, which covers the weekly execution loop. Most contributors need nothing more." },
            { title: "Add a role for a job, not a person", text: "Create roles like 'Team Head' or 'Strategy Lead' and grant them the resources that job needs. Roles scale; per-person configuration does not." },
            { title: "Use extras sparingly", text: "A per-user extra is right for a genuine one-off — one person who needs OPSP Review this quarter only. If you find yourself granting the same extra three times, make it a role." },
            { title: "Check the sidebar to verify", text: "The fastest confirmation that a grant worked is that the module appears in the user's sidebar." },
          ],
        },
        {
          type: "faq",
          items: [
            { q: "A user says a page is missing.", a: "Check the module is enabled in Settings → Configurations first, then check the role grant. A disabled module is hidden from everyone including administrators." },
            { q: "Can a role take permissions away?", a: "No. Grants only add. To reduce someone's access, remove a role or an extra rather than trying to grant a negative." },
            { q: "What is impersonation?", a: "A support facility that lets an authorised administrator view the app as another user. When it is active a banner and an Exit impersonation action appear in the user menu." },
            { q: "Why can a team head see other teams' KPIs?", a: "Row visibility follows the grant. If the role carries organisation-wide KPI view, it sees every row. Scope the role to the module's team-level resource instead." },
          ],
        },
      ],
    },
  ],
};

export const exports: KBChapter = {
  id: "exports",
  title: "Exports & Reporting",
  pillar: "Platform",
  summary: "Every way data leaves QuikScale — Excel, PDF, Word — and which module produces which.",
  sections: [
    {
      id: "ex-matrix",
      title: "What each module exports",
      blocks: [
        {
          type: "table",
          head: ["Module", "Formats", "Range", "Notes"],
          widths: [1.1, 0.9, 1.2, 1.6],
          rows: [
            ["Individual KPI", "xlsx, PDF", "Year + quarters", "One sheet per quarter with that quarter's weeks; traffic-light cells painted"],
            ["Teams KPI", "xlsx, PDF", "Year + quarters", "As above, at team level"],
            ["Priority", "xlsx, PDF", "Year + quarters", "Weekly status cells painted"],
            ["WWW", "xlsx, PDF", "Due-date range", "Status cell painted"],
            ["Daily Huddle", "xlsx, PDF", "Meeting-date range", "One row per huddle"],
            ["Weekly Meeting", "xlsx, PDF", "Meeting-date range", "One row per meeting"],
            ["Meeting Rhythm", "xlsx", "Monthly", "Separate aggregated Metrics Report"],
            ["Client Master / Members", "xlsx", "Full list", "No range selection"],
            ["OPSP", "PDF, Word", "One plan", "The formatted one-page plan"],
            ["SWT", "PDF", "One quarter", "The formatted worksheet"],
            ["FACe / PACe", "PDF", "Current chart", "The accountability chart"],
            ["Habits", "xlsx", "One round", "The scored checklist"],
            ["Knowledge Base", "PDF", "Whole book", "This manual"],
          ],
        },
      ],
    },
    {
      id: "ex-how",
      title: "How exporting works",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Open the More menu", text: "The '…' button in the module toolbar." },
            { title: "Choose Export", text: "The export dialog opens." },
            { title: "Pick the range", text: "Week-based modules ask for a fiscal year and one or more quarters, or Full Year. Date-based modules ask for a date range." },
            { title: "Pick the format", text: "Excel for analysis, PDF for circulation." },
            { title: "Download", text: "The file is generated on the server against the complete result set — not just the page you are looking at — and downloads directly." },
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Exports respect your permissions",
          text: "An export contains exactly the rows the corresponding list screen would show you. Someone with narrower access exporting the same module gets a smaller file — the export path shares its scoping with the list query precisely so it can never leak rows the screen hides." },
      ],
    },
  ],
};

export const cash: KBChapter = {
  id: "cash",
  title: "Cash",
  pillar: "Cash",
  summary: "The fourth pillar — currently a placeholder while the module is built.",
  route: "/cash",
  sections: [
    {
      id: "cash-status",
      title: "Status",
      blocks: [
        {
          type: "p",
          text: "Cash is the fourth Scaling Up pillar and the fourth section of the QuikScale sidebar. The module is on the roadmap and the section is present so the four-pillar model stays visible and complete; opening it today shows a placeholder rather than a working screen.",
        },
        {
          type: "p",
          text: "Until it ships, track the Cash pillar with the tools already in the product: create Currency KPIs for the cash measures that matter — cash on hand, days sales outstanding, cash conversion cycle, gross margin — and give them owners. They will behave exactly like every other KPI, including the weekly traffic light and the exports.",
        },
        {
          type: "callout",
          tone: "tip",
          title: "The Power of One",
          text: "Scaling Up's cash chapter argues that small improvements to price, volume, cost of goods, overheads and the three working-capital cycles compound dramatically. Each of those seven levers makes a good Currency or Number KPI today." },
      ],
    },
  ],
};

export const platformChapters: KBChapter[] = [orgSetup, settings, permissions, exports, cash];
