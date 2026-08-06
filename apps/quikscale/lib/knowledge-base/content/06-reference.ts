import type { KBChapter } from "../types";

/* ────────────────────────────────────────────────────────────────────────────
 * Reference — troubleshooting, colour legend, keyboard/interaction reference,
 * a worked weekly routine, and the glossary.
 * ──────────────────────────────────────────────────────────────────────────── */

export const routines: KBChapter = {
  id: "routines",
  title: "Worked Routines",
  pillar: "Foundations",
  summary: "Exactly what to click, in order, for the daily, weekly, quarterly and annual rhythms.",
  sections: [
    {
      id: "rt-weekly",
      title: "The weekly routine",
      blocks: [
        {
          type: "p",
          text: "This is the routine that makes QuikScale work. It takes each contributor about ten minutes and each team lead about twenty-five. Run it on the same day every week.",
        },
        {
          type: "steps",
          items: [
            { title: "Contributor — open your dashboard", text: "Confirm the period, then read the KPI Overview strip." },
            { title: "Contributor — enter KPI actuals", text: "Open Individual KPI, find the current week column named in the blue pill, and enter this week's number for every KPI you own. Add a note where the number moved unexpectedly." },
            { title: "Contributor — update priority statuses", text: "Open Priority and set this week's status for each of your rocks. Be honest — 'behind schedule' recorded early is worth more than 'on track' recorded until the last week." },
            { title: "Contributor — close out WWW", text: "Open WWW, mark completed items complete, and revise any due dates that have genuinely moved." },
            { title: "Lead — review before the meeting", text: "Open the dashboard's Team tab and scan for red and amber. That list is your agenda." },
            { title: "Lead — run the weekly meeting", text: "Good news, KPI review, priority review, WWW review, one topic in depth, close with new commitments." },
            { title: "Lead — capture commitments live", text: "Add every new commitment to WWW during the meeting, with one owner and a date." },
            { title: "Lead — record the meeting", text: "Meeting Rhythm → Weekly Meeting → Add, scoring the metrics for the session that just happened." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Enter numbers before the meeting, not during",
          text: "A weekly meeting spent typing numbers into a grid is a status meeting. A weekly meeting where the numbers are already in and the discussion is about the red cells is a management meeting." },
      ],
    },
    {
      id: "rt-daily",
      title: "The daily routine",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Huddle for under fifteen minutes", text: "Standing up, same time every day." },
            { title: "Three rounds", text: "What's up in the next 24 hours; the daily metric; where are you stuck." },
            { title: "Do not solve in the huddle", text: "Stuck items become WWW commitments or a separate conversation, not a twenty-minute detour." },
            { title: "Record it", text: "Meeting Rhythm → Daily Huddle → Add. Attendance, punctuality, duration, stuck items. Thirty seconds." },
          ],
        },
      ],
    },
    {
      id: "rt-quarterly",
      title: "The quarterly routine",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Review the quarter that is ending", text: "OPSP → OPSP Review. Score each planned item against what actually happened, and submit. Next quarter's OPSP stays locked until you do." },
            { title: "Refresh the SWT worksheet", text: "Strengths, weaknesses and the trends that have changed since last quarter." },
            { title: "Score the Rockefeller Habits", text: "Administrators launch a round; everyone fills it in; read the aggregate together." },
            { title: "Confirm the calendar", text: "Org Setup → Quarter Settings. Make sure the coming quarter exists with the right week count." },
            { title: "Write the new OPSP", text: "Targets, Goals, Actions, Rocks and the Critical Number. Finalize when the team agrees." },
            { title: "Export the plan into execution", text: "Push the quarterly priorities into Priority and the KPI accountability rows into KPI." },
            { title: "Run the people calibration", text: "Self-assessments, then manager reviews, then the Talent grid as a leadership conversation." },
            { title: "Announce the theme", text: "The critical number, the theme and the celebration, communicated to everyone." },
          ],
        },
      ],
    },
    {
      id: "rt-annual",
      title: "The annual routine",
      blocks: [
        {
          type: "bullets",
          items: [
            "Generate the new fiscal year in Org Setup → Quarter Settings before it starts.",
            "Rewrite the 3–5 year Targets and the 1-year Goals in the OPSP.",
            "Rebuild the FACe and PACe charts against how the business now runs.",
            "Run the full engagement survey and turn the findings into WWW items.",
            "Review Core Values and Purpose — confirm rather than rewrite, unless something has genuinely changed.",
          ],
        },
      ],
    },
  ],
};

export const troubleshooting: KBChapter = {
  id: "troubleshooting",
  title: "Troubleshooting",
  pillar: "Platform",
  summary: "The problems people actually hit, and what to check first.",
  sections: [
    {
      id: "ts-empty",
      title: "I can't see my data",
      blocks: [
        {
          type: "table",
          head: ["Symptom", "Check first", "Then"],
          widths: [1.3, 1.4, 1.6],
          rows: [
            ["A grid is empty", "The fiscal year and quarter in the module header", "Clear the search box and reset the filter panel"],
            ["A module is missing from the sidebar", "Whether it is enabled in Settings → Configurations", "Whether your role grants view on it"],
            ["My dashboard shows nothing", "The period picker", "Whether anything is actually assigned to you in that quarter"],
            ["A colleague sees rows I don't", "Your filter and period", "Your role's scope — team-level versus org-level view"],
            ["Week columns look like the wrong count", "Quarter Settings for that fiscal year", "Reload the browser tab — calendar changes need a fresh page"],
          ],
        },
      ],
    },
    {
      id: "ts-edit",
      title: "I can't edit something",
      blocks: [
        {
          type: "table",
          head: ["Symptom", "Most likely cause"],
          widths: [1.4, 2.4],
          rows: [
            ["A KPI week cell is read-only", "The week has closed. Past weeks lock by design."],
            ["Every cell in a quarter is read-only", "You are viewing a past quarter. All of its weeks are closed, including the last one."],
            ["The OPSP is read-only", "It has been finalized. Unlocking needs a specific permission that is not granted by default."],
            ["Next quarter's OPSP won't open", "The previous quarter's review has not been submitted."],
            ["The Add button is missing", "Your role lacks create permission on that module."],
            ["A KPI's cells won't accept input", "Its status is Paused or Completed."],
          ],
        },
      ],
    },
    {
      id: "ts-numbers",
      title: "The numbers look wrong",
      blocks: [
        {
          type: "faq",
          items: [
            { q: "QTD Achieved is lower than the sum of my weekly values.", a: "QTD excludes the week currently in progress. In week 5, QTD covers weeks 1 to 4 — the value you entered for week 5 is on screen but not yet in QTD." },
            { q: "Progress is above 100%.", a: "That is correct and intentional. Progress is uncapped so genuine over-performance stays visible." },
            { q: "A KPI shows achievement but 0% progress.", a: "Its quarterly goal is zero. Open the KPI and set a Target Value." },
            { q: "A cell is red but I hit the number.", a: "Check whether Reverse colour is on. In reverse mode, exceeding the target is the failure case." },
            { q: "A team KPI does not match the sum of its owners.", a: "Team targets are split by contribution percentage. Confirm the contributions still total 100 after any owner change." },
            { q: "Analytics scores someone lower than their grid suggests.", a: "Unentered weeks are scored as no data and depress attainment. Grey cells are the cause far more often than genuine underperformance." },
          ],
        },
      ],
    },
    {
      id: "ts-colours",
      title: "Complete colour legend",
      blocks: [
        {
          type: "table",
          caption: "Every colour in QuikScale and what it means",
          head: ["Where", "Colour", "Meaning"],
          widths: [1.3, 0.8, 2.1],
          rows: [
            ["KPI weekly cell (forward)", "Blue", "120%+ of target — significantly exceeded"],
            ["KPI weekly cell (forward)", "Green", "100–119% — achieved"],
            ["KPI weekly cell (forward)", "Yellow", "80–99% — near target"],
            ["KPI weekly cell (forward)", "Red", "Below 80%, value entered"],
            ["KPI weekly cell (reverse)", "Blue", "80% of target or less — significantly better"],
            ["KPI weekly cell (reverse)", "Red", "Above 120% — poor"],
            ["KPI weekly cell", "Grey", "No value entered yet"],
            ["Priority / WWW status", "Blue", "Completed"],
            ["Priority / WWW status", "Green", "On track"],
            ["Priority / WWW status", "Amber", "Behind schedule"],
            ["Priority / WWW status", "Red", "Not yet started"],
            ["Priority / WWW status", "Grey", "Not applicable"],
            ["Meeting Rhythm score", "Blue / Green / Yellow / Red", "98%+ / 90–97% / 80–89% / below 80%"],
            ["Analytics score", "Green / Amber / Red", "80%+ / 60–79% / below 60%"],
            ["Sidebar pillar dots", "Green / Amber / Red / Blue", "People / Strategy / Execution / Cash"],
            ["Interface accent", "Your theme", "Buttons, active states, table header bands — never data"],
          ],
        },
        {
          type: "callout",
          tone: "rule",
          title: "Data colours are the same in every organisation",
          text: "The KPI traffic light and the five item statuses are fixed. Only interface chrome follows your accent colour, so a screenshot from one tenant reads correctly in another." },
      ],
    },
  ],
};

export const glossary: KBChapter = {
  id: "glossary",
  title: "Glossary",
  pillar: "Foundations",
  summary: "Every term used in QuikScale and in Scaling Up, defined once.",
  sections: [
    {
      id: "gl-a-m",
      title: "A – M",
      blocks: [
        {
          type: "kv",
          items: [
            { k: "Accent colour", v: "The organisation's theme colour, applied to interface chrome only — never to data colours." },
            { k: "Actions (Quarterly)", v: "The OPSP tier below Goals: what has to happen in the next ninety days for each category." },
            { k: "cNPS", v: "Customer Net Promoter Score. A WWW category and a survey type." },
            { k: "Core Values", v: "The three to five rules that do not change. Used for hiring, firing and praising." },
            { k: "Critical Number", v: "The single number that, if it moves this quarter, means the quarter succeeded." },
            { k: "Cumulative", v: "A KPI division type where each week's value adds to a running total." },
            { k: "Division Type", v: "Cumulative or Standalone — how a KPI's weekly values roll up." },
            { k: "eNPS", v: "Employee Net Promoter Score. A WWW category and a survey type." },
            { k: "FACe", v: "Function Accountability Chart. One named owner per business function." },
            { k: "Finalize", v: "Locking an OPSP so the quarter is executed against a fixed plan." },
            { k: "Fiscal week", v: "A numbered week inside a quarter, from 1 to the quarter's week count. Not an ISO calendar week." },
            { k: "Fiscal year", v: "The organisation's financial year, written as a span such as 2026–2027." },
            { k: "Goals (1 year)", v: "The OPSP tier between Targets and Actions: this year's step towards each long-horizon target." },
            { k: "Habits", v: "The ten Rockefeller Habits, scored quarterly as a self-diagnostic." },
            { k: "Impersonation", v: "An authorised administrator viewing the application as another user, with a visible banner and exit action." },
            { k: "Imported from OPSP", v: "A marker on KPIs and Priorities created by the OPSP export flow." },
            { k: "KPI", v: "Key Performance Indicator — a number with an owner, a quarterly target and one value per week." },
            { k: "Leading / Lagging", v: "A KPI classification. Leading is a predictive input you can act on; lagging is an outcome." },
            { k: "Log", v: "A row's notes and full change history, opened from the clock icon in the grid rail." },
            { k: "Manual mode", v: "A grid showing the organisation's hand-arranged row order, active only when no column sort is applied." },
          ],
        },
      ],
    },
    {
      id: "gl-n-z",
      title: "N – Z",
      blocks: [
        {
          type: "kv",
          items: [
            { k: "Nine-box", v: "The Talent grid: performance against potential, in three bands each." },
            { k: "OPSP", v: "One-Page Strategic Plan. The central strategy document in Scaling Up." },
            { k: "Org / Organisation", v: "A tenant. Every record belongs to exactly one." },
            { k: "PACe", v: "Process Accountability Chart. One named owner per cross-functional process." },
            { k: "Partial week", v: "A shorter week created at a quarter boundary when a weekly meeting day is configured." },
            { k: "Priority", v: "A quarterly rock — a discrete piece of work with an owner, a week window and a weekly status." },
            { k: "Progress %", v: "QTD Achieved against the quarterly goal. Uncapped, so over-performance stays visible." },
            { k: "QTD", v: "Quarter-to-date. Covers completed weeks only; the week in progress is excluded." },
            { k: "Reverse colour", v: "A KPI setting that inverts the traffic light for lower-is-better metrics." },
            { k: "Rock", v: "The Scaling Up term for a quarterly priority." },
            { k: "Rockefeller Habits", v: "The ten disciplines behind Scaling Up, scored in the Habits module." },
            { k: "Scaling Up", v: "Verne Harnish's operating framework — People, Strategy, Execution, Cash — that QuikScale implements." },
            { k: "Standalone", v: "A KPI division type where each week is independent and the latest value is reported." },
            { k: "SWT", v: "Strengths, Weaknesses, Trends. Scaling Up's replacement for SWOT." },
            { k: "Targets (3–5 year)", v: "The OPSP's long-horizon tier, expressed per category with a measurable figure." },
            { k: "Team head", v: "The person accountable for a team; drives team scope in dashboards and analytics." },
            { k: "Theme (quarterly)", v: "The name and celebration wrapped around the quarter's critical number." },
            { k: "To be decided", v: "A WWW due-date state for commitments whose date genuinely is not known yet." },
            { k: "Traffic light", v: "The four-colour KPI weekly scoring: blue, green, yellow, red — plus grey for no data." },
            { k: "Unit Master", v: "The curated list of display labels available to Number KPIs." },
            { k: "Weekly meeting day", v: "The configurable day on which the fiscal week turns over." },
            { k: "WWW", v: "Who, What, When — the commitment register." },
          ],
        },
      ],
    },
  ],
};

export const referenceChapters: KBChapter[] = [routines, troubleshooting, glossary];
