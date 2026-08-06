import type { KBChapter } from "../types";

/* ────────────────────────────────────────────────────────────────────────────
 * The framework chapter (why the product is shaped the way it is) and the
 * lookup appendices — routes, permissions and field indexes.
 * ──────────────────────────────────────────────────────────────────────────── */

export const concepts: KBChapter = {
  id: "concepts",
  title: "The Scaling Up Framework",
  pillar: "Foundations",
  summary: "The ideas behind the product — four pillars, one page, ten habits, and a rhythm that closes the loop.",
  sections: [
    {
      id: "cn-why",
      title: "Why the product is shaped this way",
      blocks: [
        {
          type: "p",
          text: "QuikScale is not a general-purpose project tracker with a strategy add-on. It is an implementation of a specific operating framework — Verne Harnish's Scaling Up, and the Rockefeller Habits that preceded it. Almost every design decision in the product traces back to a claim in that framework, and knowing the claims makes the software obvious rather than arbitrary.",
        },
        {
          type: "p",
          text: "The core argument is that growing organisations fail in four predictable places, and that each has a discipline that prevents it. Get the right people doing the right things (People), decide what makes you different and stick to it (Strategy), do what you said you would do (Execution), and have enough cash to survive doing it (Cash). QuikScale gives each of those four a home, and the sidebar is that model.",
        },
      ],
    },
    {
      id: "cn-onepage",
      title: "One page, four horizons",
      blocks: [
        {
          type: "p",
          text: "The One-Page Strategic Plan compresses four time horizons onto a single sheet so the connection between them is impossible to lose. The discipline is not the writing — it is the fact that a quarterly action has to be visibly a slice of an annual goal, which has to be visibly a slice of a long-horizon target.",
        },
        {
          type: "table",
          caption: "The four horizons",
          head: ["Horizon", "Question", "Where it lives"],
          widths: [1, 1.8, 1.4],
          rows: [
            ["Timeless", "Who are we and why do we exist?", "Core Values, Purpose"],
            ["3–5 years", "Where are we going?", "Targets, Key Thrusts"],
            ["1 year", "What has to be true this year?", "Goals, Key Initiatives"],
            ["This quarter", "What are we doing in the next 90 days?", "Actions, Rocks, Critical Number"],
          ],
        },
        {
          type: "callout",
          tone: "rule",
          title: "The quarter is the unit of execution",
          text: "Ninety days is long enough to finish something meaningful and short enough that nobody can hide. That is why QuikScale scopes KPIs, priorities, plans and reviews to a quarter rather than to an open-ended date range.",
        },
      ],
    },
    {
      id: "cn-priorities",
      title: "Priorities, metrics and the rule of three to five",
      blocks: [
        {
          type: "p",
          text: "The framework insists on three to five priorities — no more — at every level: the company for the quarter, the team, the individual. The reasoning is blunt: a list of twenty priorities is a list of zero priorities, because nothing on it can be traded off against anything else.",
        },
        {
          type: "p",
          text: "Alongside the priorities sit metrics. Scaling Up distinguishes leading measures — inputs you can act on this week, like calls made or demos booked — from lagging measures, which are outcomes like revenue that tell you what already happened. A scoreboard of only lagging metrics is a rear-view mirror. QuikScale's KPI Type field exists so you can check the balance.",
        },
        {
          type: "kv",
          items: [
            { k: "Critical Number", v: "The single measure that matters most this quarter. Everything else is subordinate to it." },
            { k: "Rock", v: "A quarterly priority. Named after the parable about fitting rocks, pebbles and sand into a jar — the rocks have to go in first." },
            { k: "Theme", v: "The story and celebration wrapped around the critical number, so the quarter has a name people remember." },
            { k: "Who / What / When", v: "The commitment format. Every action item has exactly one owner, a concrete deliverable and a date." },
          ],
        },
      ],
    },
    {
      id: "cn-rhythm",
      title: "The meeting rhythm",
      blocks: [
        {
          type: "p",
          text: "The framework's most practical claim is that a fixed communication rhythm beats better planning. Daily huddles surface blockers within a day; weekly meetings work on one thing in depth; monthly sessions develop managers; quarterly and annual offsites reset the plan. The rhythm is what turns a plan into a system.",
        },
        {
          type: "table",
          caption: "The rhythm and its job",
          head: ["Meeting", "Length", "Job"],
          widths: [1, 0.8, 2.2],
          rows: [
            ["Daily huddle", "Under 15 min", "What's up in the next 24 hours, the daily metric, where are you stuck. Never solve in the huddle."],
            ["Weekly meeting", "60–90 min", "Good news, KPI and priority review, WWW review, one topic in depth, new commitments."],
            ["Monthly management", "Half day", "Develop managers, resolve the issues too big for a week."],
            ["Quarterly planning", "1–2 days", "Review the quarter, reset the OPSP, agree the new rocks and critical number."],
            ["Annual planning", "2–3 days", "Targets, goals, values, the shape of the business."],
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "The loop has to close",
          text: "The reason QuikScale locks the next quarter's OPSP until the last one has been reviewed is this principle. A rhythm that only ever plans forward, and never scores what was planned, degrades into a wish list within a year.",
        },
      ],
    },
    {
      id: "cn-mapping",
      title: "Framework to module map",
      blocks: [
        {
          type: "table",
          caption: "Where each idea lives in QuikScale",
          head: ["Scaling Up concept", "QuikScale module"],
          widths: [1.4, 2.2],
          rows: [
            ["One-Page Strategic Plan", "OPSP → Create OPSP"],
            ["Rockefeller Habits checklist", "Habits"],
            ["SWT analysis", "SWT"],
            ["Function Accountability Chart", "FACe"],
            ["Process Accountability Chart", "PACe"],
            ["Quarterly rocks", "Priority"],
            ["Leading and lagging metrics", "KPI (Individual and Teams)"],
            ["Who-What-When action items", "WWW"],
            ["Daily huddle and weekly meeting", "Meeting Rhythm"],
            ["Topgrading and the A/B/C player question", "People → Talent"],
            ["Start / Stop / Keep and the 4Q conversation", "People → Feedback, Survey"],
            ["The Power of One cash levers", "Cash (roadmap) — track as Currency KPIs today"],
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Further reading",
          text: "This chapter is a summary, not a substitute. Scaling Up (Verne Harnish) and Mastering the Rockefeller Habits are the source texts, and the one-page tools in QuikScale are the ones described there.",
        },
      ],
    },
  ],
};

export const appendixRoutes: KBChapter = {
  id: "appendix-routes",
  title: "Appendix A — Module Map",
  pillar: "Platform",
  summary: "Every screen in QuikScale, its route, its pillar and the chapter that documents it.",
  sections: [
    {
      id: "ap-routes-core",
      title: "Foundations and Execution",
      blocks: [
        {
          type: "table",
          head: ["Screen", "Route", "Chapter"],
          widths: [1.3, 1.5, 1.4],
          rows: [
            ["Dashboard", "/dashboard", "Dashboard"],
            ["Knowledge Base", "/help", "Navigating QuikScale"],
            ["Individual KPI", "/kpi", "Individual KPI"],
            ["Teams KPI", "/kpi/teams", "Teams KPI"],
            ["Priority", "/priority", "Priority"],
            ["WWW", "/www", "WWW"],
            ["Meeting Rhythm dashboard", "/client-meetings", "Meeting Rhythm"],
            ["Client Master", "/client-meetings/clients", "Meeting Rhythm"],
            ["Client Members", "/client-meetings/members", "Meeting Rhythm"],
            ["Daily Huddle", "/client-meetings/daily-huddle", "Meeting Rhythm"],
            ["Weekly Meeting", "/client-meetings/weekly-meeting", "Meeting Rhythm"],
            ["Analytics — Scorecard", "/performance/scorecard", "Analytics"],
            ["Analytics — Individual", "/performance/individual", "Analytics"],
            ["Analytics — Teams", "/performance/teams", "Analytics"],
            ["Analytics — Trends", "/performance/trends", "Analytics"],
          ],
        },
      ],
    },
    {
      id: "ap-routes-strategy-people",
      title: "Strategy, People and Cash",
      blocks: [
        {
          type: "table",
          head: ["Screen", "Route", "Chapter"],
          widths: [1.3, 1.5, 1.4],
          rows: [
            ["Create OPSP", "/opsp", "OPSP"],
            ["OPSP History", "/opsp/history", "OPSP"],
            ["OPSP Review / Critical Review", "/opsp/review", "OPSP"],
            ["Category Management", "/opsp/categories", "OPSP"],
            ["Rockefeller Habits", "/performance/habits", "Rockefeller Habits Checklist"],
            ["SWT", "/performance/swt", "SWT"],
            ["Cycle hub", "/performance/cycle", "Goals & Pillars"],
            ["Self-Assessment", "/performance/self", "Goals & Pillars"],
            ["Reviews", "/performance/reviews", "Goals & Pillars"],
            ["1:1 Meetings", "/performance/one-on-one", "Goals & Pillars"],
            ["Talent", "/performance/talent", "Goals & Pillars"],
            ["FACe", "/performance/face", "FACe & PACe"],
            ["PACe", "/performance/pace", "FACe & PACe"],
            ["Survey", "/performance/survey", "Survey"],
            ["Cash", "/cash", "Cash"],
          ],
        },
      ],
    },
    {
      id: "ap-routes-admin",
      title: "Administration",
      blocks: [
        {
          type: "table",
          head: ["Screen", "Route", "Chapter"],
          widths: [1.3, 1.5, 1.4],
          rows: [
            ["Teams", "/org-setup/teams", "Org Setup"],
            ["Users", "/org-setup/users", "Org Setup"],
            ["Quarter Settings", "/org-setup/quarters", "Org Setup"],
            ["Unit Master", "/org-setup/units", "Org Setup"],
            ["Settings — Profile / Company / Configurations", "/settings", "Settings"],
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Not every route is visible to everyone",
          text: "A screen appears in your sidebar only when the module is enabled for your organisation and your role grants view on it. Navigating directly to a route you are not permitted to see will not bypass that.",
        },
        {
          type: "h3",
          text: "Keeping this guide current",
        },
        {
          type: "p",
          text: "This appendix is not maintained by hand alone. An automated check compares every route the application actually serves against the routes this guide mentions, and fails the build when a module ships undocumented — so a new feature cannot quietly appear in the product without appearing here too.",
        },
        {
          type: "steps",
          items: [
            { title: "Build the feature", text: "Add the module as normal." },
            { title: "Write it up", text: "Add a chapter under lib/knowledge-base/content/, or a section in the closest existing chapter, and list it in a contents group." },
            { title: "Add it to this appendix", text: "One row: screen name, route, chapter." },
            { title: "Add a screenshot slot if it helps", text: "Add a figure block, then a matching capture recipe. A separate check makes sure the two never drift apart." },
            { title: "Run the checks", text: "The coverage, structure and capture-recipe tests all run with the normal test suite. Green means the guide is complete." },
          ],
        },
        {
          type: "callout",
          tone: "rule",
          title: "Undocumented modules fail the build",
          text: "If a route genuinely needs no write-up — a redirect hub, a sub-view of a documented module, an unbuilt placeholder — it must be exempted explicitly, with a stated reason. Exemptions are themselves checked, so one left behind for a deleted route is caught rather than quietly handing the next module a free pass.",
        },
        {
          type: "h3",
          text: "Sidebar entries with no page yet",
        },
        {
          type: "table",
          caption: "Listed in the sidebar, not yet implemented",
          head: ["Sidebar entry", "Route", "Status"],
          widths: [1.3, 1.5, 1.4],
          rows: [
            ["Goals & Pillars → Feedback", "/performance/feedback", "No page — the link leads nowhere"],
            ["Cash", "/cash", "Placeholder page — module on the roadmap"],
          ],
        },
      ],
    },
  ],
};

export const appendixPermissions: KBChapter = {
  id: "appendix-permissions",
  title: "Appendix B — Permission Reference",
  pillar: "Platform",
  summary: "The permission resources you can grant, and what each one opens.",
  sections: [
    {
      id: "ap-perm-exec",
      title: "Execution resources",
      blocks: [
        {
          type: "p",
          text: "Each resource below can be granted with any combination of the four actions — view, create, update and delete. View controls whether the module appears at all; the other three control what can be done inside it.",
        },
        {
          type: "table",
          head: ["Resource", "Opens"],
          widths: [1.2, 2.4],
          rows: [
            ["Dashboard", "The dashboard home page."],
            ["KPI", "Individual KPI: the grid, the add form, weekly value entry and the log."],
            ["TeamKPI", "Teams KPI: team-level rows, owners and contributions."],
            ["Priority", "The Priority grid and weekly statuses."],
            ["WWW", "The commitment register."],
            ["ClientMeetings.Dashboard", "The Meeting Rhythm six-month dashboard."],
            ["ClientMaster", "Client Master."],
            ["ClientMember", "Client Members and rosters."],
            ["DailyHuddle", "Daily huddle records."],
            ["WeeklyMeeting", "Weekly meeting records."],
            ["Analytics.*", "The four analytics views — Scorecard, Individual, Teams and Trends — grantable separately."],
          ],
        },
      ],
    },
    {
      id: "ap-perm-strategy",
      title: "Strategy and People resources",
      blocks: [
        {
          type: "table",
          head: ["Resource", "Opens"],
          widths: [1.4, 2.2],
          rows: [
            ["OPSP.Create", "Writing and editing the current quarter's plan."],
            ["OPSP.History", "Reading past quarters' plans."],
            ["OPSP.History.EditFinalize", "Unlocking a finalized OPSP for editing. Deliberately NOT granted to the seeded administrator role — must be turned on for a named person."],
            ["OPSP.Review", "Full quarter-end review."],
            ["OPSP.Review.Critical", "Critical-items-only review. Shows in the sidebar as 'Critical Review'."],
            ["OPSP.Categories", "Category management."],
            ["Habits", "The Rockefeller Habits fill form. Aggregate and history remain administrator-only regardless of this grant."],
            ["SWT", "The SWT worksheet."],
            ["People.*", "Cycle, self-assessment, reviews, 1:1s, feedback and talent — grantable separately."],
            ["FACe", "The Function Accountability Chart."],
            ["PACe", "The Process Accountability Chart."],
            ["Survey", "Creating and managing surveys."],
            ["Survey.Responses", "Reading individual survey responses."],
          ],
        },
      ],
    },
    {
      id: "ap-perm-admin",
      title: "Administration resources",
      blocks: [
        {
          type: "table",
          head: ["Resource", "Opens"],
          widths: [1.2, 2.4],
          rows: [
            ["Team", "Org Setup → Teams."],
            ["User", "Org Setup → Users."],
            ["User.AddUser", "Inviting new users specifically."],
            ["User.Management", "Editing existing users, their teams and their roles."],
            ["Quarter", "Org Setup → Quarter Settings."],
          ],
        },
        {
          type: "callout",
          tone: "rule",
          title: "Grants only ever add",
          text: "A user's access is the union of every role they hold plus any per-user extras. Nothing subtracts. To reduce access, remove a role or an extra — there is no negative grant." },
        {
          type: "faq",
          items: [
            { q: "What should a typical contributor have?", a: "The seeded Member role: Dashboard view plus full rights on KPI, Team KPI, Priority and WWW. That covers the whole weekly loop." },
            { q: "What should a team head add?", a: "Analytics.Teams and Analytics.Individual for their reporting, plus DailyHuddle and WeeklyMeeting if they run the rhythm." },
            { q: "What should a strategy owner add?", a: "OPSP.Create, OPSP.History, OPSP.Review, OPSP.Categories, SWT and Habits." },
          ],
        },
      ],
    },
  ],
};

export const appendixFields: KBChapter = {
  id: "appendix-fields",
  title: "Appendix C — Field Index",
  pillar: "Platform",
  summary: "Every enumerated value in the product, in one place.",
  sections: [
    {
      id: "ap-fields-enums",
      title: "Enumerated values",
      blocks: [
        {
          type: "table",
          caption: "KPI",
          head: ["Field", "Allowed values"],
          widths: [1, 2.6],
          rows: [
            ["Measurement Unit", "Number · Percentage · Currency · Ratio"],
            ["Division Type", "Cumulative · Standalone"],
            ["KPI Type", "NA · Leading · Lagging"],
            ["Frequency", "Daily · Weekly · Monthly · Yearly"],
            ["Status", "Active · Paused · Completed"],
            ["KPI Level", "Individual · Team"],
            ["Target Value", "Any number ≥ 0 (zero is valid)"],
          ],
        },
        {
          type: "table",
          caption: "Priority and WWW status",
          head: ["Field", "Allowed values"],
          widths: [1, 2.6],
          rows: [
            ["Status (both modules)", "Not Applicable · Not Yet Started · Behind Schedule · On Track · Completed"],
            ["Priority start / end week", "1 to the quarter's week count"],
            ["WWW due date", "A date, or the To Be Decided flag"],
            ["WWW category", "eNPS · cNPS · Others"],
          ],
        },
        {
          type: "table",
          caption: "Meeting Rhythm",
          head: ["Field", "Allowed values"],
          widths: [1, 2.6],
          rows: [
            ["Mode", "Daily · Weekly"],
            ["Call status", "Held · Not Held · Call cancelled by Client · Holiday for Client · Holiday for Success Alchemist · Other (free text)"],
          ],
        },
        {
          type: "table",
          caption: "People",
          head: ["Field", "Allowed values"],
          widths: [1, 2.6],
          rows: [
            ["Performance / Potential band", "Low · Medium · High"],
            ["Classification", "A · B · C"],
            ["Right seat", "Yes · No"],
            ["Capacity", "Under · At · Over"],
            ["Flight risk", "Low · Medium · High"],
            ["Succession readiness", "Not ready · Developing · Ready now"],
            ["Cycle phase", "Quarter kickoff · Execution · Self-assessment · Manager review · Calibration · Closed"],
          ],
        },
        {
          type: "table",
          caption: "SWT",
          head: ["Field", "Allowed values"],
          widths: [1, 2.6],
          rows: [
            ["Entry type", "Strength · Weakness · Trend"],
            ["Trend category", "Technology · Distribution · Product Innovation · Markets · Consumer · Social · Regulatory"],
            ["Trend direction", "Opportunity · Threat · Neutral"],
          ],
        },
        {
          type: "table",
          caption: "Calendar and organisation",
          head: ["Field", "Allowed values"],
          widths: [1, 2.6],
          rows: [
            ["Quarter", "Q1 · Q2 · Q3 · Q4"],
            ["Weeks per quarter", "1 to 26. Default 13; 14 occurs with a configured weekly meeting day"],
            ["Accent colour", "Blue · Purple · Amber · Green · Orange · Indigo · Slate · Emerald · Teal · Cyan"],
            ["Permission action", "view · create · update · delete"],
          ],
        },
      ],
    },
    {
      id: "ap-fields-defaults",
      title: "Defaults worth knowing",
      blocks: [
        {
          type: "kv",
          items: [
            { k: "New KPI", v: "Individual level, Cumulative, Weekly frequency, KPI Type NA, forward colours, Active status." },
            { k: "New Priority", v: "Not Yet Started, with weeks outside the start/end window treated as Not Applicable." },
            { k: "New WWW item", v: "Not Yet Started, no category." },
            { k: "New quarter", v: "13 weeks, calendar three-month boundaries anchored on the Q1 start date." },
            { k: "New user", v: "The Member role — dashboard plus full rights on KPI, Team KPI, Priority and WWW." },
            { k: "Grid order", v: "Manual mode, showing the organisation's arranged row order, until a column sort is applied." },
            { k: "Dashboard preview tables", v: "A rolling five-week window centred on the current week." },
          ],
        },
      ],
    },
  ],
};

export const appendixChapters: KBChapter[] = [
  concepts, appendixRoutes, appendixPermissions, appendixFields,
];
