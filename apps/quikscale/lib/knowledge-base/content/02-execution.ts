import type { KBChapter } from "../types";

/* ────────────────────────────────────────────────────────────────────────────
 * Execution pillar — the weekly cadence. Dashboard, KPI (individual + team),
 * Priority, WWW, Meeting Rhythm and Analytics.
 * ──────────────────────────────────────────────────────────────────────────── */

export const dashboard: KBChapter = {
  id: "dashboard",
  title: "Dashboard",
  pillar: "Execution",
  summary: "Your personal command centre — the KPIs, Priorities and commitments you own this quarter.",
  route: "/dashboard",
  sections: [
    {
      id: "dash-purpose",
      title: "What the dashboard is for",
      blocks: [
        {
          type: "p",
          text: "The dashboard answers one question: what needs my attention this week? It is deliberately personal — by default it shows only what you own, not everything in the organisation. It is the first screen after sign-in and the right place to start a weekly one-to-one or a personal Monday review.",
        },
        {
          type: "figure",
          file: "dashboard-overview.png",
          caption: "The dashboard",
          hint: "Full screenshot of /dashboard showing the My Dashboard / Team tabs, the KPI Overview strip with the average-KPI donut and the on-track / at-risk / behind / ahead / idle counts, and the KPI, Priority and WWW preview tables below.",
        },
      ],
    },
    {
      id: "dash-layout",
      title: "Layout",
      blocks: [
        {
          type: "table",
          caption: "Dashboard regions",
          head: ["Region", "What it shows"],
          widths: [1, 2.6],
          rows: [
            ["Header strip", "The period pill ('Q2 · Week 5 · 3 Aug – 9 Aug'), a Reload button, the More menu and the fiscal year / quarter picker."],
            ["My Dashboard / Team tabs", "'My Dashboard' is what you own. 'Team' widens the view to the teams you lead or belong to."],
            ["KPI Overview", "A collapsible summary card: your average KPI attainment as a percentage plus counts for on track, at risk, behind, ahead and idle. Click it to expand into per-KPI cards."],
            ["KPI table", "A preview of your KPIs with quarterly goal, QTD goal, colour-coded QTD achieved, this week's value and the latest note."],
            ["Priority table", "Your quarterly priorities with start and end week, the latest note and a rolling window of week columns."],
            ["WWW table", "Your Who-What-When commitments — what, when, status, category and notes."],
          ],
        },
        {
          type: "p",
          text: "The preview tables show a rolling five-week window centred on the current week rather than the whole quarter, so the most relevant columns are visible without horizontal scrolling. Scroll sideways inside a table to see the rest.",
        },
      ],
    },
    {
      id: "dash-using",
      title: "Using it",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Confirm the period", text: "Check the year and quarter in the top right. The dashboard is scoped to it like every other module." },
            { title: "Read the overview strip", text: "The average-KPI figure and the five counters give you the shape of your quarter in one glance. Anything in the 'behind' or 'at risk' buckets is your agenda." },
            { title: "Scan for colour", text: "Red and amber cells in the KPI table are the KPIs missing target. In the Priority and WWW tables, red means not yet started and amber means behind schedule." },
            { title: "Search within a card", text: "Each preview table has its own search box — 'Search KPIs', 'Search priorities', 'Search WWW' — for when you own a lot of rows." },
            { title: "Show hidden rows", text: "The '4 hidden' style chip on the KPI card reveals rows hidden by the card's own filter, for example paused or completed KPIs." },
            { title: "Jump to the module", text: "The dashboard is a read-and-navigate surface. To edit in bulk, open the module itself from the sidebar." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Start the weekly meeting here",
          text: "Open the Team tab, expand KPI Overview and work down the red rows. It is a faster agenda than a slide deck and it is guaranteed to be current — the numbers are the live ones, not last night's export.",
        },
        {
          type: "faq",
          items: [
            { q: "I updated a KPI but the dashboard still shows the old number.", a: "Use the Reload button in the dashboard header. Edits made inside a module invalidate the dashboard's cache automatically, but Reload forces a fresh fetch if you have had the tab open for a long time." },
            { q: "Why does the Priority card say 'No priorities found for this period'?", a: "Either you own no priorities in the selected quarter, or the quarter picker is on a quarter you were not active in. Check the period first, then open the Priority module to confirm ownership." },
            { q: "Can I see someone else's dashboard?", a: "Not directly. Use Analytics → Individual to review another person's KPI and priority performance, subject to permission." },
          ],
        },
      ],
    },
  ],
};

export const kpiIndividual: KBChapter = {
  id: "kpi-individual",
  title: "Individual KPI",
  pillar: "Execution",
  summary: "Weekly numeric tracking with a four-colour traffic light — the heartbeat of the Execution pillar.",
  route: "/kpi",
  sections: [
    {
      id: "kpi-concept",
      title: "The idea",
      blocks: [
        {
          type: "p",
          text: "A KPI in QuikScale is a number with an owner, a quarterly target and one value per week. Each weekly cell is compared with that week's target and painted blue, green, yellow or red. Read left to right, a KPI row is a story: where the number was, where it is, and whether the trend is going to land on target.",
        },
        {
          type: "p",
          text: "Individual KPIs have exactly one owner. Team KPIs — covered in the next chapter — have several owners with weighted contributions and automatically create a linked individual KPI for each of them.",
        },
        {
          type: "figure",
          file: "kpi-table.png",
          caption: "The Individual KPI grid",
          hint: "Full-width screenshot of /kpi showing the toolbar (item count, week pill, Search, Filter, period picker, More, Add KPI), the Progress bar column, owner, unit, KPI name, type, division type, target, quarterly goal, QTD goal and the coloured weekly cells.",
        },
      ],
    },
    {
      id: "kpi-create",
      title: "Creating a KPI",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Click Add KPI", text: "The blue button at the top right of the KPI page opens the create form." },
            { title: "Name it as a measurement", text: "Good KPI names state what is counted: 'Qualified pipeline', 'Onboard 10 customers on product', 'Gross profit'. Avoid project names — those belong in Priority." },
            { title: "Choose the owner", text: "One person. The owner is accountable for entering the weekly value, not necessarily for doing all the work." },
            { title: "Set the measurement unit", text: "Number, Percentage, Currency or Ratio. Currency KPIs use your organisation's currency and support scaled display (K / L / Cr / M); Number KPIs can carry a label from Unit Master such as 'Leads'." },
            { title: "Pick the division type", text: "Cumulative adds each week's value to the running total. Standalone treats each week independently and reports the latest value. Choose Cumulative for volumes like revenue or leads, Standalone for levels like satisfaction or headcount." },
            { title: "Enter the target", text: "Target Value is the quarterly figure. QuikScale splits it evenly into weekly targets; you can override individual weeks afterwards from the KPI's detail view." },
            { title: "Set the period", text: "Fiscal year and quarter. The KPI appears only when that quarter is selected." },
            { title: "Optionally classify it", text: "KPI Type marks a KPI as Leading (a predictive input you can act on) or Lagging (an outcome). Leave it as NA if you are not using the distinction yet." },
            { title: "Optionally reverse the colours", text: "Turn on Reverse colour for KPIs where lower is better — defects, delays, complaints, churn. See the traffic-light section below." },
            { title: "Save", text: "The KPI appears in the grid immediately, with an empty weekly row ready for actuals." },
          ],
        },
        {
          type: "figure",
          file: "kpi-add-form.png",
          caption: "The Add KPI form",
          hint: "Screenshot of the Add KPI drawer/modal showing the KPI name, owner picker, measurement unit, division type, target value, quarter and year fields, and the Leading/Lagging and Reverse-colour toggles.",
        },
        {
          type: "table",
          caption: "KPI field reference",
          head: ["Field", "Values", "Notes"],
          widths: [1, 1.3, 2.1],
          rows: [
            ["KPI Name", "Free text", "Required. No length limit."],
            ["Description", "Free text", "Optional. Shown in the detail drawer and exports."],
            ["Owner", "One user", "Required for individual KPIs."],
            ["Measurement Unit", "Number / Percentage / Currency / Ratio", "Drives formatting throughout the app and in exports."],
            ["Unit", "From Unit Master", "Display label for Number KPIs, e.g. 'Leads', 'Calls'."],
            ["Currency & Scale", "Org currency; K / L / Cr / M", "Currency KPIs only. Scaled display shortens large figures."],
            ["Division Type", "Cumulative / Standalone", "Cumulative sums weeks; Standalone reports the latest week."],
            ["KPI Type", "NA / Leading / Lagging", "Classification only — it does not change any calculation."],
            ["Target Value", "Number ≥ 0", "Zero is allowed — used for 'zero defects' style reverse KPIs."],
            ["Quarterly Goal / QTD Goal", "Number ≥ 0", "Derived from the target; QTD Goal is recomputed as weeks close."],
            ["Weekly targets", "Number per week", "Optional per-week override of the even split."],
            ["Frequency", "Daily / Weekly / Monthly / Yearly", "Reporting cadence. Weekly is the default and the norm."],
            ["Reverse colour", "On / Off", "Inverts the traffic light for lower-is-better metrics."],
            ["Status", "Active / Paused / Completed", "Paused and completed KPIs drop out of the default view."],
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "A target of zero is valid",
          text: "'Zero defects this week' is a legitimate KPI. Set the target to 0 and turn on Reverse colour: the week stays editable, any positive value is scored red, and only a zero is scored blue.",
        },
      ],
    },
    {
      id: "kpi-weekly",
      title: "Entering weekly values",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Find the current week", text: "The blue pill in the toolbar names the current week and its dates. That is the column to fill." },
            { title: "Click the cell", text: "Type the actual value for the week and press Enter or click away. It saves immediately and the cell recolours." },
            { title: "Add a note", text: "Open the row's log with the clock icon in the rail to record why the number moved. Notes appear on the dashboard as 'Last Notes' and in the weekly meeting." },
            { title: "Review the row", text: "The Progress column recalculates as you go, and QTD Achieved updates once the week closes." },
          ],
        },
        {
          type: "callout",
          tone: "warn",
          title: "Past weeks are locked",
          text: "Once a week has closed, its cell becomes read-only so the record stays trustworthy. The lock is quarter-aware: viewing a past quarter locks all of its weeks, including the last one. If you genuinely need to correct history, ask an administrator.",
        },
        {
          type: "figure",
          file: "kpi-log-modal.png",
          caption: "The KPI log",
          hint: "Screenshot of the KPI log modal opened from the clock icon: the week-by-week list with values and targets, the notes field per week, and the change-history entries with author and timestamp.",
        },
      ],
    },
    {
      id: "kpi-colours",
      title: "The traffic light",
      blocks: [
        {
          type: "p",
          text: "Every weekly cell is scored as a percentage of that week's target, then coloured. This is the visual language of the whole product, and it is intentionally identical in every organisation — it does not follow your accent colour.",
        },
        {
          type: "table",
          caption: "Forward mode — higher is better (default)",
          head: ["Colour", "Condition", "Meaning"],
          widths: [1, 1.2, 2],
          rows: [
            ["Blue", "120% or more of target", "Target significantly exceeded"],
            ["Green", "100% – 119%", "Target achieved"],
            ["Yellow", "80% – 99%", "Near target"],
            ["Red", "Below 80%, value entered", "Below target"],
            ["Grey", "No value entered", "Not updated yet — not a failure"],
          ],
        },
        {
          type: "table",
          caption: "Reverse mode — lower is better",
          head: ["Colour", "Condition", "Meaning"],
          widths: [1, 1.2, 2],
          rows: [
            ["Blue", "80% of target or less", "Significantly better than target"],
            ["Green", "81% – 100%", "Within target"],
            ["Yellow", "101% – 120%", "Slightly worse than target"],
            ["Red", "Above 120%", "Poor performance"],
            ["Grey", "No value entered", "Not updated yet"],
          ],
        },
        {
          type: "callout",
          tone: "rule",
          title: "Grey is not red",
          text: "An empty cell is always neutral grey, never red. QuikScale deliberately distinguishes 'we missed the target' from 'nobody has told us yet'. If your grid is full of grey, the problem is the update habit, not performance.",
        },
        {
          type: "figure",
          file: "kpi-traffic-light.png",
          caption: "Weekly cells colour-coded",
          hint: "Close-up screenshot of a few KPI rows' week columns showing blue, green, yellow, red and grey cells side by side.",
        },
      ],
    },
    {
      id: "kpi-manage",
      title: "Managing the grid",
      blocks: [
        {
          type: "bullets",
          items: [
            "Progress (Quarterly Goal) — the percentage bar in the first data column, computed from QTD achieved against the quarterly goal.",
            "Filter by owner, team, status or KPI level to narrow a large grid.",
            "Hide the columns you never read; the KPI page ships with several already hidden to keep the default view calm.",
            "Freeze up to the KPI Name column so names stay visible while you scroll through thirteen or fourteen weeks.",
            "Drag rows to group related KPIs together — row order is shared with everyone in the organisation.",
            "Rows imported from a finalised OPSP carry an 'Imported from OPSP' marker so you can tell planned KPIs from ad-hoc ones.",
          ],
        },
        {
          type: "faq",
          items: [
            { q: "My weekly cells are not editable.", a: "Check three things: the week is in the past (locked by design), the KPI's status is Paused or Completed, or your role lacks KPI update permission." },
            { q: "Why did my Progress percentage jump above 100?", a: "Progress is uncapped so over-performance stays visible. A KPI at 169% has genuinely delivered 1.69 times its quarterly goal to date." },
            { q: "The KPI shows QTD Achieved but Progress is 0%.", a: "That combination points at a quarterly goal of zero. Open the KPI and set a Target Value." },
            { q: "How do I stop tracking a KPI without deleting its history?", a: "Set its status to Paused or Completed. It leaves the default grid but keeps every weekly value, and it remains available in exports and past-quarter views." },
          ],
        },
      ],
    },
  ],
};

export const kpiTeams: KBChapter = {
  id: "kpi-teams",
  title: "Teams KPI",
  pillar: "Execution",
  summary: "Shared KPIs with multiple owners, weighted contributions and automatic per-owner child KPIs.",
  route: "/kpi/teams",
  sections: [
    {
      id: "tkpi-concept",
      title: "How team KPIs differ",
      blocks: [
        {
          type: "p",
          text: "A Team KPI belongs to a team and has several owners. Each owner carries a percentage contribution, and the contributions must total 100%. When you save a Team KPI, QuikScale creates a linked individual KPI for every owner, sized to their share. Owners then work in their own Individual KPI grid exactly as usual, and their numbers roll up automatically.",
        },
        {
          type: "figure",
          file: "team-kpi-grid.png",
          caption: "The Teams KPI page",
          hint: "Screenshot of /kpi/teams showing teams as collapsible sections, each containing its KPI rows with owners, targets and coloured week cells.",
        },
      ],
    },
    {
      id: "tkpi-create",
      title: "Creating a team KPI",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Open Teams KPI and click Add", text: "The form is the Individual KPI form with the level set to Team." },
            { title: "Pick the team", text: "Required. It determines which section of the page the KPI appears in and who can be selected as an owner." },
            { title: "Select the owners", text: "Choose two or more people from the team. A team KPI with one owner should just be an individual KPI." },
            { title: "Set the contributions", text: "Give each owner a percentage. The form will not save until they add up to 100 (a half-point of rounding slack is allowed)." },
            { title: "Optionally rename the child KPIs", text: "By default each owner's individual KPI takes the team KPI's name. Override it per owner where a more specific name helps — for example 'Pipeline — North' and 'Pipeline — South'." },
            { title: "Set target, unit, division type and period", text: "Exactly as for an individual KPI. Each owner's child target is their contribution share of the team target." },
            { title: "Save", text: "The team KPI appears under its team, and each owner's child KPI appears in their own Individual KPI grid and on their dashboard." },
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Per-owner weekly targets",
          text: "Beyond the even split by contribution, weekly targets can be set for each owner individually. Use this when owners ramp at different rates — for example a new joiner carrying a smaller share in the first weeks of the quarter.",
        },
      ],
    },
    {
      id: "tkpi-running",
      title: "Running a team KPI",
      blocks: [
        {
          type: "bullets",
          items: [
            "Owners enter their own weekly numbers in Individual KPI; the team row aggregates them.",
            "The team row's colour reflects the team's combined position against the team target.",
            "Changing the team KPI's name or target cascades to the child KPIs, so the two can never drift apart.",
            "Removing an owner removes their child KPI — redistribute the remaining contributions so they still total 100.",
            "Team sections are collapsible, so a page covering many teams stays readable.",
          ],
        },
        {
          type: "faq",
          items: [
            { q: "Can one person own team KPIs in two different teams?", a: "Yes. Each team KPI creates its own child KPI, so the person will see one row per team in their individual grid." },
            { q: "An owner's contribution changed mid-quarter. What happens to past weeks?", a: "Past weekly values are preserved. Future weekly targets are recalculated from the new contribution split." },
            { q: "Why can't I save — the form says contributions must sum to 100%?", a: "Exactly that. Adjust the percentages until they total 100; QuikScale allows only half a point of rounding tolerance." },
          ],
        },
      ],
    },
  ],
};

export const priority: KBChapter = {
  id: "priority",
  title: "Priority",
  pillar: "Execution",
  summary: "Quarterly rocks — the three-to-five things that must move this quarter, tracked week by week.",
  route: "/priority",
  sections: [
    {
      id: "pri-concept",
      title: "The idea",
      blocks: [
        {
          type: "p",
          text: "Where a KPI is a number, a Priority is a piece of work — the quarterly 'rocks' from Scaling Up. Each priority has an owner, a start week and an end week, and a status for every week in between. The grid shows a band of coloured cells running across the quarter, so you can see at a glance whether a rock has started, is on track or has stalled.",
        },
        {
          type: "p",
          text: "Discipline matters more here than anywhere else in the product. Three to five priorities per person per quarter is the intent. Twenty priorities is a to-do list, and it will not produce a useful picture.",
        },
        {
          type: "figure",
          file: "priority-table.png",
          caption: "The Priority grid",
          hint: "Screenshot of /priority showing priority name, owner, start week, end week, overall status and the coloured weekly status cells across the quarter.",
        },
      ],
    },
    {
      id: "pri-statuses",
      title: "The five statuses",
      blocks: [
        {
          type: "table",
          caption: "Status meanings and colours",
          head: ["Status", "Colour", "Use when"],
          widths: [1.1, 0.8, 2.3],
          rows: [
            ["Not Applicable", "Grey", "The priority is not expected to move in this week — outside its planned window."],
            ["Not Yet Started", "Red", "Work should have begun and has not. This is the default for a new priority."],
            ["Behind Schedule", "Amber", "Started, but will not finish on the current plan without intervention."],
            ["On Track", "Green", "Progressing as planned."],
            ["Completed", "Blue", "Finished. Completing a week cascades the status forward through the remaining weeks."],
          ],
        },
        {
          type: "callout",
          tone: "rule",
          title: "Completed is blue on purpose",
          text: "Blue — not green — marks completion in Priority and WWW, so a finished item is visually distinct from one that is merely on track. It is the same blue in every organisation, and it is not affected by your accent colour.",
        },
      ],
    },
    {
      id: "pri-using",
      title: "Creating and updating priorities",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Click Add Priority", text: "Name the outcome, not the activity: 'Launch self-serve onboarding', not 'Work on onboarding'." },
            { title: "Assign an owner", text: "One accountable person. You can select several people at once and QuikScale will create one priority per owner." },
            { title: "Set the start and end week", text: "The planned window inside the quarter. Weeks outside it default to Not Applicable so the grid stays quiet." },
            { title: "Choose the initial status", text: "New priorities start as Not Yet Started." },
            { title: "Update weekly", text: "Each week, click that week's cell and pick a status. Add a note in the same place to explain a change." },
            { title: "Close it out", text: "Set Completed in the week the work finished. The remaining weeks fill forward automatically." },
          ],
        },
        {
          type: "figure",
          file: "priority-week-cell.png",
          caption: "Setting a weekly status",
          hint: "Screenshot of a Priority week cell with its status dropdown open, showing the five options in canonical order with their colour dots.",
        },
        {
          type: "bullets",
          items: [
            "The Log (clock icon) holds each week's note and the full change history, including bulk updates.",
            "Priorities exported from a finalised OPSP are marked 'Imported from OPSP'.",
            "Export by fiscal year and quarter; the spreadsheet keeps the weekly status colours.",
            "Sorting by overall status is the quickest way to build a 'what is stuck' list for the weekly meeting.",
          ],
        },
        {
          type: "faq",
          items: [
            { q: "Why is every week grey?", a: "The priority's start and end weeks fall outside the weeks shown, so every visible week is Not Applicable. Open the priority and check its window." },
            { q: "Can a priority span two quarters?", a: "No. Priorities are quarterly by design. If work continues, create a new priority in the next quarter — that is the point of the rhythm." },
            { q: "I marked week 6 Completed and weeks 7–13 changed too.", a: "That is the completion cascade. A completed rock stays completed for the rest of the quarter rather than needing thirteen identical clicks." },
          ],
        },
      ],
    },
  ],
};

export const www: KBChapter = {
  id: "www",
  title: "WWW — Who, What, When",
  pillar: "Execution",
  summary: "The commitment register: who agreed to do what, by when — with a full revision history.",
  route: "/www",
  sections: [
    {
      id: "www-concept",
      title: "The idea",
      blocks: [
        {
          type: "p",
          text: "WWW is the smallest and most-used module in QuikScale. Every meeting produces commitments; WWW is where they live so they cannot be forgotten. Three fields carry the weight: Who is accountable, What they will do, and When it is due. Everything else is supporting detail.",
        },
        {
          type: "p",
          text: "Unlike KPI and Priority, WWW is date-based rather than week-based. Items are filtered and exported by due date, not by fiscal week, so a commitment can sit wherever it needs to.",
        },
        {
          type: "figure",
          file: "www-table.png",
          caption: "The WWW grid",
          hint: "Screenshot of /www showing the Who, What, When, Revised Date, Status, Category and Notes columns with a mix of statuses.",
        },
      ],
    },
    {
      id: "www-fields",
      title: "Field reference",
      blocks: [
        {
          type: "table",
          head: ["Field", "Values", "Notes"],
          widths: [1, 1.3, 2],
          rows: [
            ["Who", "One or more users", "Selecting several people creates one commitment each, so accountability stays singular."],
            ["What", "Free text", "Required. State a finished outcome, not an activity."],
            ["When", "Date, or 'To be decided'", "Required, but you may mark the date To Be Decided when it genuinely is not known yet."],
            ["Revised Date", "Date list", "Every time the due date moves, the previous date is kept. The column shows the revision trail."],
            ["Status", "Not Applicable / Not Yet Started / Behind Schedule / On Track / Completed", "Same five statuses and colours as Priority."],
            ["Category", "eNPS / cNPS / Others", "Optional grouping, used mainly to separate employee and customer feedback actions."],
            ["Notes", "Free text", "Context, blockers, links."],
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "'To be decided' beats a fake date",
          text: "Putting an invented date on a commitment that has no date pollutes every report that follows. Mark it To Be Decided instead — the item still appears in the register and reads honestly as undated.",
        },
      ],
    },
    {
      id: "www-using",
      title: "Running the commitment register",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Capture during the meeting", text: "Add items as they are agreed. Editing the register live is far more reliable than reconstructing it afterwards." },
            { title: "Assign one owner each", text: "If two people are named, create two items. 'The team' is not an owner." },
            { title: "Review at the start of the next meeting", text: "Filter to items due before today and walk them. It usually takes three minutes and it is the single most effective meeting habit in the product." },
            { title: "Revise dates openly", text: "Moving a due date is fine; hiding it is not. QuikScale keeps the original date and every revision, so a repeatedly-slipping commitment is visible." },
            { title: "Close completed items", text: "Set the status to Completed. It turns blue and drops out of your overdue view." },
          ],
        },
        {
          type: "faq",
          items: [
            { q: "How do I see everything overdue?", a: "Sort by When ascending and filter the status to exclude Completed. Anything with a past date at the top of the list is overdue." },
            { q: "Does WWW have week columns like KPI and Priority?", a: "No. WWW is date-driven, so it has no weekly grid and no fiscal-week maths." },
            { q: "Where do WWW items appear outside this module?", a: "On the dashboard's Individual tab, and inside the weekly meeting record where WWW completion is one of the scored metrics." },
          ],
        },
      ],
    },
  ],
};

export const meetingRhythm: KBChapter = {
  id: "meeting-rhythm",
  title: "Meeting Rhythm",
  pillar: "Execution",
  summary: "Daily huddles and weekly meetings, scored per client and tracked over a rolling six months.",
  route: "/client-meetings",
  sections: [
    {
      id: "mr-concept",
      title: "What it does",
      blocks: [
        {
          type: "p",
          text: "Meeting Rhythm records whether meetings actually happen and whether they are any good. Each recorded meeting is scored across a set of metrics — was it held, did it start on time, did it follow the format, who attended, were stuck items surfaced, were KPIs and WWW reviewed — and the module rolls those scores into a six-month per-client grid.",
        },
        {
          type: "p",
          text: "The module ships with five pages: a Dashboard, Client Master, Client Members, Daily Huddle and Weekly Meeting.",
        },
        {
          type: "figure",
          file: "meeting-rhythm-dashboard.png",
          caption: "Meeting Rhythm dashboard",
          hint: "Screenshot of /client-meetings showing the client selector, the daily/weekly mode toggle, the six-month colour-coded metrics grid and the 'Total Calls Assessed' chip.",
        },
      ],
    },
    {
      id: "mr-pages",
      title: "The five pages",
      blocks: [
        {
          type: "table",
          head: ["Page", "Purpose"],
          widths: [1, 2.6],
          rows: [
            ["Dashboard", "Six-month rolling performance per client, in Daily or Weekly mode, with a colour-coded score per metric per month and an overall column. Weekly mode adds a Member Punch-In tab."],
            ["Client Master", "The list of clients or internal groups whose meetings you track. Create one row per recurring meeting group."],
            ["Client Members", "Who belongs to each client's meeting roster. Drives the attendance and punch-in metrics."],
            ["Daily Huddle", "One record per daily huddle: date, who attended, punctuality, duration, stuck items."],
            ["Weekly Meeting", "One record per weekly meeting, with the fuller metric set including KPI review, WWW review and meeting quality."],
          ],
        },
      ],
    },
    {
      id: "mr-metrics",
      title: "The scored metrics",
      blocks: [
        {
          type: "p",
          text: "Daily huddles and weekly meetings are scored against different metric sets, because they are different meetings with different jobs. Each metric is expressed as a percentage across the meetings recorded in a month, and the Total column averages them.",
        },
        {
          type: "table",
          caption: "Daily huddle metrics",
          head: ["Metric", "What it measures"],
          widths: [1.6, 2.2],
          rows: [
            ["Avg. % of calls happened", "Did the huddle take place at all? The rhythm metric — everything else is conditional on this."],
            ["Avg. % of calls where call punctuality was followed", "Did it start on time?"],
            ["Avg. % of calls where call duration and time per member was followed", "Did it stay inside its time box, and did each person keep to their share?"],
            ["Avg. % of format being followed", "Did it run the three rounds — what's up, the daily metric, where are you stuck — rather than drifting into problem-solving?"],
            ["Avg. % of people attending the calls", "Attendance against the client's roster in Client Members."],
            ["Avg. % of stucks called out", "Were blockers actually surfaced? A huddle where nobody is ever stuck is a huddle nobody trusts."],
          ],
        },
        {
          type: "table",
          caption: "Weekly meeting metrics",
          head: ["Metric", "What it measures"],
          widths: [1.6, 2.2],
          rows: [
            ["Avg. % of calls happened", "Did the weekly meeting take place?"],
            ["Avg. % of calls where call punctuality was followed", "Did it start on time?"],
            ["Average % of call end-time adherence", "Did it finish on time? Weekly meetings overrun far more often than they start late."],
            ["Quality of the dashboards", "Were the numbers ready and readable before the meeting, or assembled during it?"],
            ["Active discussion on KPI and Priority achievement gaps and action plan", "Was the gap between plan and actual actually discussed, with an action agreed?"],
            ["WWW review and follow up", "Were the previous week's commitments walked and closed?"],
            ["Customer and employee feedback segment done", "Was the feedback loop — Rockefeller Habits five and six — run this week?"],
            ["Collective intelligence discussion done", "Was there a real discussion of one topic in depth, rather than a round of status updates?"],
            ["Avg. % of people attending the calls", "Attendance against the roster."],
          ],
        },
        {
          type: "h3",
          text: "Call status",
        },
        {
          type: "p",
          text: "A meeting that did not happen is recorded rather than left blank, so the reason is visible in the score. The available statuses are Held, Not Held, Call cancelled by Client, Holiday for Client, Holiday for Success Alchemist, and Other — which takes a free-text reason.",
        },
        {
          type: "callout",
          tone: "tip",
          title: "Distinguish 'not held' from 'holiday'",
          text: "A month of cancelled calls and a month of public holidays produce very different conversations. Recording the reason takes two seconds and is what makes the six-month grid interpretable later.",
        },
      ],
    },
    {
      id: "mr-colours",
      title: "Reading the score grid",
      blocks: [
        {
          type: "table",
          caption: "Meeting Rhythm colour legend",
          head: ["Colour", "Score", "Reading"],
          widths: [1, 1, 2],
          rows: [
            ["Blue", "98% and above", "Excellent — the rhythm is holding"],
            ["Green", "90% – 97%", "Good"],
            ["Yellow", "80% – 89%", "Slipping — worth a conversation"],
            ["Red", "Below 80%", "The rhythm has broken down"],
            ["Grey", "No data", "No meetings recorded for that month"],
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Grey months are a finding",
          text: "A run of grey cells does not mean the meetings went badly — it means nobody recorded them. In a rhythm module that is itself the most important signal on the page.",
        },
      ],
    },
    {
      id: "mr-using",
      title: "Setting it up and running it",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Create your clients", text: "Client Master → Add. One row per recurring meeting group. Internal teams count — 'client' here just means 'the group that meets'." },
            { title: "Build the rosters", text: "Client Members → add each participant to their client. Attendance and punch-in are scored against this roster." },
            { title: "Record daily huddles", text: "Daily Huddle → Add for each huddle: date, attendance, punctuality, duration and stuck items." },
            { title: "Record weekly meetings", text: "Weekly Meeting → Add, completing the fuller metric set including whether KPIs and WWW were reviewed." },
            { title: "Review monthly", text: "Open the Dashboard, switch between Daily and Weekly mode, and read the six-month trend per client." },
            { title: "Export", text: "The More menu exports the meeting records by date range, and additionally offers the aggregated monthly Metrics Report." },
          ],
        },
        {
          type: "faq",
          items: [
            { q: "What is Member Punch-In?", a: "A weekly-mode tab showing, per roster member, whether they were present in the weekly meeting. It turns attendance from an aggregate percentage into a named list." },
            { q: "Should internal team meetings go in here?", a: "Yes. Create a client row named after the team. The module is about meeting discipline, not about customers specifically." },
            { q: "Why does the dashboard only show six months?", a: "It is a deliberately rolling window — long enough to show a trend, short enough to stay readable. Use the exports for longer-range analysis." },
          ],
        },
      ],
    },
  ],
};

export const analytics: KBChapter = {
  id: "analytics",
  title: "Analytics",
  pillar: "Execution",
  summary: "Scorecard, per-person and per-team performance, and quarter-over-quarter trends.",
  route: "/performance/scorecard",
  sections: [
    {
      id: "an-overview",
      title: "The four analytics views",
      blocks: [
        {
          type: "table",
          head: ["View", "Answers"],
          widths: [1, 2.6],
          rows: [
            ["Scorecard", "How is the organisation doing right now? A single page of headline tiles — KPI attainment, priority completion, WWW closure, meeting rhythm and risk flags."],
            ["Individual", "How is each person doing? A searchable, paginated list of everyone with their score, plus a per-person detail page."],
            ["Teams", "How is each team doing? The same scoring rolled up to team level, ranked."],
            ["Trends", "Is it getting better or worse? Quarter-over-quarter bars for KPI attainment and priority completion rate."],
          ],
        },
        {
          type: "figure",
          file: "analytics-scorecard.png",
          caption: "The Scorecard",
          hint: "Screenshot of /performance/scorecard showing the row of headline metric tiles with their coloured score badges and the breakdown table beneath.",
        },
      ],
    },
    {
      id: "an-scoring",
      title: "How scores are coloured",
      blocks: [
        {
          type: "p",
          text: "Analytics uses a simpler three-band scale than the KPI traffic light, because these are aggregate scores rather than single measurements against a target.",
        },
        {
          type: "table",
          head: ["Band", "Score", "Colour"],
          widths: [1, 1, 1],
          rows: [
            ["Strong", "80% and above", "Green"],
            ["Watch", "60% – 79%", "Amber"],
            ["At risk", "Below 60%", "Red"],
            ["No data", "—", "Grey"],
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Use Trends before you use Scorecard",
          text: "A single quarter's score says less than its direction. Open Trends first: a team at 72% and climbing needs a different conversation from a team at 72% and falling.",
        },
      ],
    },
    {
      id: "an-using",
      title: "Using analytics well",
      blocks: [
        {
          type: "bullets",
          items: [
            "Individual → click a person to open their detail page with their KPIs, priorities and review history.",
            "Teams is ranked, so the top and bottom of the list are the two conversations worth having.",
            "Trends plots KPI attainment and priority completion side by side per quarter — a gap between the two bars usually means numbers are being hit while rocks are slipping, or the reverse.",
            "Analytics is read-only. Every figure traces back to data entered in KPI, Priority, WWW and Meeting Rhythm, so fix problems at the source.",
          ],
        },
        {
          type: "faq",
          items: [
            { q: "Someone's score looks unfairly low.", a: "Check whether their weekly KPI cells are grey. Unentered weeks depress the attainment figure because there is nothing to score — the fix is the update habit." },
            { q: "Can I export analytics?", a: "The analytics pages are on-screen views. To analyse externally, export the underlying KPI, Priority and WWW data from those modules and pivot it yourself." },
            { q: "Why do I only see some people?", a: "Analytics respects permissions and team scope. Team heads see their own teams; organisation-wide visibility needs the corresponding Analytics grant." },
          ],
        },
      ],
    },
  ],
};

export const executionChapters: KBChapter[] = [
  dashboard, kpiIndividual, kpiTeams, priority, www, meetingRhythm, analytics,
];
