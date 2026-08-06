import type { KBChapter } from "../types";

/* ────────────────────────────────────────────────────────────────────────────
 * Foundations — what QuikScale is, how to move around it, and the two
 * mechanics (the fiscal calendar and the data grid) that every single module
 * inherits. Read once; it makes every later chapter shorter.
 * ──────────────────────────────────────────────────────────────────────────── */

export const gettingStarted: KBChapter = {
  id: "getting-started",
  title: "Getting Started",
  pillar: "Foundations",
  summary: "What QuikScale is, the operating rhythm it runs, and what to do in your first hour.",
  route: "/dashboard",
  sections: [
    {
      id: "gs-about",
      title: "About QuikScale",
      blocks: [
        {
          type: "p",
          text: "QuikScale is a Performance Operating System. It takes the Scaling Up / Rockefeller Habits operating rhythm — the one most leadership teams try to run in spreadsheets and slide decks — and turns it into a single, always-current system of record. Strategy is written once in the One-Page Strategic Plan, cascaded into quarterly Priorities and weekly KPIs, executed through Who-What-When commitments, and reviewed in a fixed meeting rhythm. Very little needs to live in a private spreadsheet, and very little has to be re-typed to be reported.",
        },
        {
          type: "p",
          text: "The application is organised around the four Scaling Up pillars — People, Strategy, Execution and Cash. The left sidebar closely mirrors that structure, so the software you are looking at and the framework your leadership team already uses are the same shape. If you know where something belongs in the book, you know where to find it in the product.",
        },
        {
          type: "figure",
          file: "app-shell-overview.png",
          caption: "The QuikScale application shell",
          hint: "Full-window screenshot of /dashboard: left sidebar with the four pillar sections visible, the header with the org chip and the help / app-switcher / user-menu cluster on the right, and the dashboard content area.",
        },
        {
          type: "kv",
          items: [
            { k: "Execution", v: "KPI (Individual + Teams), Priority, WWW, Meeting Rhythm, Analytics — the weekly cadence that turns plans into results." },
            { k: "Strategy", v: "OPSP (One-Page Strategic Plan), Rockefeller Habits checklist, SWT (Strengths / Weaknesses / Trends) — the thinking layer, reviewed quarterly and annually." },
            { k: "People", v: "Goals & Pillars (cycle, self-assessment, reviews, 1:1s, feedback, talent), FACe, PACe, Survey — who is accountable for what, and how they are doing." },
            { k: "Cash", v: "Cash-flow tracking is on the roadmap. The section is currently visible to maintain the complete four-pillar model." },
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Multi-tenant by design",
          text: "Every record in QuikScale belongs to exactly one organisation. The org you are currently viewing is always shown as a chip next to the welcome message in the header. If you belong to more than one organisation, check that chip before you enter data — it is the single fastest way to avoid putting a KPI in the wrong tenant.",
        },
      ],
    },
    {
      id: "gs-rhythm",
      title: "The operating rhythm QuikScale runs",
      blocks: [
        {
          type: "p",
          text: "QuikScale is opinionated: it expects a rhythm, not ad-hoc usage. The modules are most valuable when they are touched on a schedule. The table below is the cadence the product is built around — if your team adopts it, almost every screen stays green without anyone chasing updates.",
        },
        {
          type: "table",
          caption: "The QuikScale cadence",
          head: ["Cadence", "What happens", "Where in QuikScale"],
          widths: [1, 2.4, 1.6],
          rows: [
            ["Daily", "15-minute huddle — what's up, daily metric, where are you stuck", "Meeting Rhythm → Daily Huddle"],
            ["Weekly", "Enter this week's KPI actuals, move Priority week statuses, close out WWW items, run the weekly team meeting", "KPI, Priority, WWW, Meeting Rhythm → Weekly Meeting"],
            ["Monthly", "Review Analytics trends, check Meeting Rhythm scores, refresh Talent and Feedback", "Analytics, Meeting Rhythm dashboard, People"],
            ["Quarterly", "Set the OPSP for the new quarter, agree Priorities and KPIs, review last quarter, score the Rockefeller Habits, refresh SWT", "OPSP, Habits, SWT, Org Setup → Quarter Settings"],
            ["Annually", "Set the 1-year Goals and 3–5 year Targets, rebuild FACe / PACe, run the engagement Survey", "OPSP, FACe, PACe, Survey"],
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "The one habit that matters most",
          text: "Enter KPI actuals on the same day every week — right before or right inside the weekly meeting. Everything downstream (dashboard health, Analytics trends, Scorecard, exports, the OPSP review) is computed from those numbers. A team that updates weekly gets a working system for free; a team that batches a month of updates gets a reporting chore.",
        },
      ],
    },
    {
      id: "gs-first-hour",
      title: "Your first hour",
      blocks: [
        {
          type: "p",
          text: "Follow these steps in order the first time you sign in. Steps 1–4 are for everyone; steps 5–8 are for whoever is setting the organisation up.",
        },
        {
          type: "steps",
          items: [
            { title: "Sign in and confirm your organisation", text: "Sign in at /login. When the dashboard paints, check the organisation chip beside 'Welcome, <name>!' in the header. If it is not the org you expect, use the app switcher (the nine-dot grid) to move, or contact your administrator." },
            { title: "Set the period you are working in", text: "Every module header carries a fiscal-year and quarter picker (for example '2026–2027 · Q2'). It is shared across modules and remembered for your session, so setting it once on the dashboard carries into KPI, Priority, WWW and OPSP." },
            { title: "Read your dashboard", text: "The dashboard is your personal view: the KPIs you own, your Priorities and your WWW commitments for the selected quarter, plus a KPI Overview strip that scores you at a glance. Focus on the red and amber items, as they require your attention for the upcoming week." },
            { title: "Open the module you own", text: "Most contributors live in three screens: Individual KPI, Priority and WWW. Open each, confirm the rows assigned to you look right, and raise anything missing with your team head." },
            { title: "Create your fiscal quarters", text: "Administrators: go to Org Setup → Quarter Settings and generate the fiscal year before inviting users or configuring the organisation. Weeks, targets and every grid in the app are sized from this. QuikScale will keep prompting you until at least one quarter exists." },
            { title: "Add teams and users", text: "Org Setup → Teams, then Org Setup → Users. Create teams first so users can be assigned as you invite them, and nominate a team head for each team." },
            { title: "Set units and currency", text: "Org Setup → Unit Master defines the display labels for Number KPIs (Leads, Calls, Tickets…). Settings → Company sets the organisation's currency, timezone and accent colour." },
            { title: "Write the OPSP", text: "Strategy → OPSP → Create OPSP. Fill Core Values, Purpose, Targets, Goals, Actions and Quarterly Priorities. When it is finalised you can export the Priorities and KPIs straight into the Execution modules instead of re-typing them." },
          ],
        },
        {
          type: "figure",
          file: "first-run-quarter-settings.png",
          caption: "Generating the first fiscal year",
          hint: "Screenshot of Org Setup → Quarter Settings with the Initialize / Generate modal open, showing the Q1 start date field and the per-quarter week inputs.",
        },
        {
          type: "callout",
          tone: "warn",
          title: "Quarters come first",
          text: "KPI grids, Priority week columns, OPSP periods and every week-based export are sized from the quarters defined in Org Setup → Quarter Settings. If no quarter exists for the selected fiscal year, module pages will show a guard prompting you to create one. Set them up before inviting the wider team.",
        },
      ],
    },
    {
      id: "gs-who-does-what",
      title: "Who does what",
      blocks: [
        {
          type: "p",
          text: "QuikScale has no single 'admin does everything' shortcut — access is granted explicitly through roles (see the Roles & Permissions chapter). In practice, though, most organisations settle into four working personas.",
        },
        {
          type: "table",
          caption: "Typical personas",
          head: ["Persona", "Lives in", "Weekly job"],
          widths: [1, 1.6, 2.2],
          rows: [
            ["Contributor", "Dashboard, Individual KPI, Priority, WWW", "Enter weekly actuals, move statuses, close commitments"],
            ["Team head", "Teams KPI, Priority, Analytics → Teams", "Review the team grid, unblock red rows, agree next week's commitments"],
            ["Leader / Executive", "Dashboard, Analytics, OPSP, Meeting Rhythm", "Run the weekly meeting, watch trend direction, keep strategy current"],
            ["Administrator", "Org Setup, Settings, Roles", "Quarters, teams, users, permissions, feature configuration"],
          ],
        },
        {
          type: "faq",
          items: [
            { q: "I can't see a module in the sidebar. Why?", a: "Two possible reasons. Either the module is switched off for your organisation in Settings → Configurations, or your role does not carry view permission for it. The sidebar hides — rather than disables — anything you cannot open, so an empty section means no visible modules inside it." },
            { q: "Do I need to be an admin to enter my own numbers?", a: "No. The default 'Member' role grants full create/read/update/delete on KPI, Team KPI, Priority and WWW, plus the dashboard. Strategy, People, Org Setup, Analytics and Meeting Rhythm need to be granted explicitly." },
            { q: "Where does my data go when the quarter ends?", a: "Nowhere — it stays queryable. Change the quarter picker in any module header to look at a past quarter. Past weeks become read-only rather than editable, so history stays trustworthy." },
          ],
        },
      ],
    },
  ],
};

export const navigating: KBChapter = {
  id: "navigating",
  title: "Navigating QuikScale",
  pillar: "Foundations",
  summary: "The sidebar, header, period filters and the help system — the frame every module sits inside.",
  sections: [
    {
      id: "nav-sidebar",
      title: "The sidebar",
      blocks: [
        {
          type: "p",
          text: "The sidebar is the map of the product. Two items sit above the pillars — Dashboard and Org Setup — and everything else is grouped under a coloured pillar heading that matches the Scaling Up palette: Execution is red, Strategy is amber, People is green and Cash is blue.",
        },
        {
          type: "figure",
          file: "sidebar-expanded.png",
          caption: "The sidebar with a group expanded",
          hint: "Screenshot of the left sidebar only, with Org Setup and KPI both expanded so their child items (Teams / Users / Quarter Settings / Unit Master, and Individual KPI / Teams KPI) are visible, plus the coloured pillar headings.",
        },
        {
          type: "bullets",
          items: [
            "Items with a chevron are groups — click the label to open the group's first page, or the chevron to expand it in place without navigating.",
            "The group you are currently inside expands automatically, and the active page is highlighted in your organisation's accent colour.",
            "The collapse control sits next to the QuikScale logo. Collapsed, the sidebar becomes an icon rail; hover any icon for its name.",
            "A small coloured dot next to KPI means there are unread KPI notes or log entries waiting for you.",
            "On phones and small tablets the sidebar becomes a drawer — open it with the hamburger button at the far left of the header.",
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "The sidebar is personalised",
          text: "You only see modules that are both enabled for your organisation and permitted for your role, so two colleagues can legitimately see different sidebars. If a colleague references a screen you cannot find, it is a permission question, not a bug.",
        },
      ],
    },
    {
      id: "nav-header",
      title: "The header",
      blocks: [
        {
          type: "p",
          text: "The header is fixed at the top of every page. On the left it greets you and shows the organisation chip. On the right it carries three controls.",
        },
        {
          type: "figure",
          file: "header-controls.png",
          caption: "Header controls",
          hint: "Close-up screenshot of the right-hand side of the header showing, left to right: the question-mark Help icon, the nine-dot app switcher, and the user avatar with name and email.",
        },
        {
          type: "kv",
          items: [
            { k: "Help (?)", v: "Opens this Knowledge Base at /help. It is available from every screen, and each module chapter can be deep-linked — for example /help#kpi-individual." },
            { k: "App switcher (⣿)", v: "The nine-dot grid. Moves you between the QuikIT applications you have been granted, and between organisations you belong to." },
            { k: "User menu", v: "Your name and email. Contains Settings and Sign out, and — if an administrator is impersonating you — an Exit impersonation action." },
          ],
        },
      ],
    },
    {
      id: "nav-period",
      title: "The period filter",
      blocks: [
        {
          type: "p",
          text: "Almost every module is scoped to a fiscal year and quarter. The picker in the module header (for example '2026–2027 · Q2') sets that scope, and the choice is shared: change it in KPI and Priority follows. The selection is remembered for the rest of your browser session, so you do not have to reset it on every navigation.",
        },
        {
          type: "p",
          text: "Next to the picker, week-based modules show a blue 'you are here' pill — for example 'Q2 · Week 5 · 3 Aug – 9 Aug'. That pill always reflects today's real position in the fiscal calendar, independently of which quarter you have selected, so you can browse a past quarter without losing track of the current week. It hides when the selected fiscal year is not the current one.",
        },
        {
          type: "figure",
          file: "period-filter.png",
          caption: "Period filter and the current-week pill",
          hint: "Screenshot of a module header strip showing the page title, the item count chip, the blue 'Q2 · Week 5 · 3 Aug – 9 Aug' pill, and the year/quarter dropdown on the right.",
        },
        {
          type: "callout",
          tone: "tip",
          title: "Nothing is showing?",
          text: "Nine times out of ten an unexpectedly empty grid is the period filter. Check the year and quarter in the header before assuming data is missing — records are created against a specific quarter and only appear when that quarter is selected.",
        },
      ],
    },
    {
      id: "nav-help",
      title: "Using this Knowledge Base",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Open it", text: "Click the question-mark icon in the header from anywhere in the app." },
            { title: "Find your chapter", text: "The left-hand contents list is grouped by pillar and mirrors the sidebar. Click any chapter to jump to it." },
            { title: "Search", text: "The search box above the contents filters chapters by their full text, including tables and FAQs — searching 'reverse colour' or 'QTD' takes you straight to the right place." },
            { title: "Share a link", text: "Every chapter and section has an anchor. Copy the address bar after clicking a chapter to send a colleague straight to it, e.g. /help#opsp." },
            { title: "Download the manual", text: "Use Download PDF at the top right to generate the complete printable manual — cover, contents and every chapter, including the screenshots that have been added to your installation." },
          ],
        },
      ],
    },
  ],
};

export const gridBasics: KBChapter = {
  id: "grid-basics",
  title: "Working with Data Grids",
  pillar: "Foundations",
  summary: "Search, filter, sort, freeze, hide, resize, reorder, page and export — learned once, used in every module.",
  sections: [
    {
      id: "grid-anatomy",
      title: "Anatomy of a QuikScale grid",
      blocks: [
        {
          type: "p",
          text: "KPI, Teams KPI, Priority, WWW, Client Master, Client Members, Daily Huddle and Weekly Meeting all use the same grid component. Learn it once here and every one of those modules becomes familiar immediately.",
        },
        {
          type: "figure",
          file: "grid-anatomy.png",
          caption: "Grid anatomy",
          hint: "Annotated screenshot of the Individual KPI table: the rail columns (checkbox, log clock icon, ID), the data columns, the coloured weekly cells on the right, the horizontal scrollbar, and the pagination footer.",
        },
        {
          type: "table",
          caption: "Standard grid regions",
          head: ["Region", "What it does"],
          widths: [1, 2.6],
          rows: [
            ["Toolbar", "Page title, live item count, the current-week pill, Search, Filter, the period picker, the More menu and the primary Add button."],
            ["Rail columns", "Checkbox for bulk selection, a clock icon opening the row's log / notes history, and the row ID. These three never move and never reorder."],
            ["Data columns", "The module's fields. Sortable, resizable, hideable, freezable and re-orderable."],
            ["Week columns", "Only on week-based modules (KPI, Teams KPI, Priority). One column per week of the selected quarter, colour-coded by performance or status."],
            ["Footer", "'Showing 1–10 of 29', a rows-per-page selector and page navigation."],
          ],
        },
      ],
    },
    {
      id: "grid-find",
      title: "Finding rows: search, filter and sort",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Search", text: "Type in the Search box in the toolbar. It matches the row's main text fields (name, description, what/notes) and narrows the grid as you type. Clear it to restore the full set." },
            { title: "Filter", text: "The Filter button opens the module's filter panel — typically owner, team, status and level. Filters combine with the period picker, so 'Q2 + owner = me + status = behind schedule' is a single click away." },
            { title: "Sort", text: "Click any sortable column header to sort ascending, click again for descending, and use the header menu's Clear sort to return to manual order." },
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Sorting turns off manual row order",
          text: "Grids are in 'manual mode' — showing your organisation's hand-arranged row order — only when no column sort is active. Apply a sort and the drag-to-reorder handle switches off; use Clear sort to get it back.",
        },
      ],
    },
    {
      id: "grid-columns",
      title: "Shaping the grid: columns",
      blocks: [
        {
          type: "p",
          text: "Column layout is a personal preference. Your changes are saved to your user profile, apply only to you, and persist across devices and sessions.",
        },
        {
          type: "table",
          caption: "Column controls",
          head: ["Action", "How", "Scope"],
          widths: [1, 2.2, 0.9],
          rows: [
            ["Hide / show", "Column header menu → toggle a column off. Modules that ship with many columns hide the less-used ones by default.", "Per user"],
            ["Resize", "Drag the divider on the right edge of a header cell.", "Per user"],
            ["Freeze", "Column header menu → Freeze. Everything up to and including that column stays pinned while the rest scrolls. A small marker shows the freeze boundary.", "Per user"],
            ["Reorder", "Press and drag the column's label, then drop it where you want it. A blue indicator shows the landing position.", "Per user"],
            ["Reorder rows", "Press and drag anywhere on a row (not on a button or input) and drop it. Rows are shared, so this changes the order for everyone in the organisation.", "Whole org"],
          ],
        },
        {
          type: "callout",
          tone: "warn",
          title: "Dragging a frozen column",
          text: "Moving a frozen column past the freeze boundary asks you to confirm 'Unfreeze column?' before it commits, because the drop would otherwise silently change what stays pinned. Other drops apply immediately.",
        },
        {
          type: "figure",
          file: "grid-column-menu.png",
          caption: "The column header menu",
          hint: "Screenshot of a table column header with its dropdown menu open, showing Sort ascending / descending, Clear sort, Freeze, Hide column and the column-visibility list.",
        },
      ],
    },
    {
      id: "grid-rows",
      title: "Working on rows",
      blocks: [
        {
          type: "bullets",
          items: [
            "Click the row ID (the '#' column) to open that record's detail drawer, where every field can be edited.",
            "Click the clock icon in the rail to open the row's log — its notes, weekly comments and full change history. A red badge on the icon counts unread entries.",
            "Tick checkboxes to select rows; the toolbar switches to bulk actions such as delete.",
            "Week cells are edited in place on week-based modules: click a cell, type a value or pick a status, and it saves immediately.",
            "Past weeks are locked. A cell in a week that has already closed is read-only, so history cannot be quietly rewritten.",
          ],
        },
        {
          type: "callout",
          tone: "rule",
          title: "Colour in the four core tables is meaning, not decoration",
          text: "In Individual KPI, Teams KPI, Priority and WWW the cell colours encode data state — the KPI traffic-light and the five item statuses. They are deliberately fixed and are NOT affected by your organisation's accent colour, so a red cell means the same thing in every tenant. Only the table header band follows your theme.",
        },
      ],
    },
    {
      id: "grid-export",
      title: "Exporting",
      blocks: [
        {
          type: "p",
          text: "The More menu ('…') in the toolbar contains Export. It opens the export dialog, where you pick a range and a format. Exports are generated on the server against the full result set — they are not limited to the rows currently on screen.",
        },
        {
          type: "table",
          caption: "Export ranges by module",
          head: ["Module", "Range you choose", "Result"],
          widths: [1.1, 1.5, 1.8],
          rows: [
            ["Individual KPI, Teams KPI, Priority", "Fiscal year + one or more quarters (or Full Year)", "One sheet or section per quarter, each with that quarter's own week columns"],
            ["WWW", "Date range on the due date", "A single sheet of matching commitments"],
            ["Daily Huddle, Weekly Meeting", "Date range on the meeting date", "One row per recorded meeting"],
            ["Client Master, Client Members", "No range", "The full list"],
          ],
        },
        {
          type: "bullets",
          items: [
            "Excel (.xlsx) exports keep the colour coding — KPI traffic-light cells, Priority weekly statuses and WWW status cells are painted to match the screen.",
            "PDF exports are laid out landscape and split wide week grids across columns so nothing is clipped.",
            "The Meeting Rhythm module additionally offers a separate aggregated 'Metrics Report' export alongside the standard one.",
          ],
        },
      ],
    },
  ],
};

export const fiscalCalendar: KBChapter = {
  id: "fiscal-calendar",
  title: "The Fiscal Calendar",
  pillar: "Foundations",
  summary: "Fiscal years, quarters, week numbering, custom week counts and what 'quarter-to-date' actually means.",
  route: "/org-setup/quarters",
  sections: [
    {
      id: "fc-model",
      title: "Fiscal years and quarters",
      blocks: [
        {
          type: "p",
          text: "QuikScale works in fiscal time, not calendar time. A fiscal year is written as a span — '2026–2027' — and is divided into four quarters. Out of the box the year starts in April: Q1 April–June, Q2 July–September, Q3 October–December, Q4 January–March. Your organisation defines its own start date in Org Setup → Quarter Settings, and everything else derives from it.",
        },
        {
          type: "p",
          text: "Each quarter is divided into numbered weeks — thirteen by default. Week 1 is the first week of the quarter, and every week-based grid in the product has exactly one column per week. This is why quarters must exist before anything else works: the width of the KPI and Priority grids is literally the quarter's week count.",
        },
        {
          type: "figure",
          file: "fiscal-year-model.png",
          caption: "Quarter Settings for a fiscal year",
          hint: "Screenshot of Org Setup → Quarter Settings listing a fiscal year with its four quarters, each showing start date, end date and week count.",
        },
      ],
    },
    {
      id: "fc-custom",
      title: "Custom quarter settings",
      blocks: [
        {
          type: "p",
          text: "Standard thirteen-week quarters suit most organisations. When they do not, an administrator can enable Custom Quarter Settings in Settings → Configurations, which unlocks two additional behaviours.",
        },
        {
          type: "kv",
          items: [
            { k: "Custom week counts", v: "Set the number of weeks per quarter individually. With all four left at 13 QuikScale uses clean calendar three-month quarters anchored on your Q1 start. Change any quarter away from 13 and the year is chained week-by-week instead, so the year length follows your week counts." },
            { k: "Weekly meeting day", v: "Choose the day your week turns over — for example Thursday. QuikScale then runs one continuous chain of meeting-day weeks across the whole fiscal year, and each quarter takes its slice. Days at a quarter boundary become a shorter partial week rather than being left unassigned, so a quarter can legitimately be 13 or 14 weeks." },
          ],
        },
        {
          type: "callout",
          tone: "warn",
          title: "Regenerate after changing the calendar",
          text: "Existing quarters keep the week counts they were created with. After changing the meeting day or the week counts, regenerate the affected fiscal year so grids pick up the new week structure. Changes to quarters are picked up on your next navigation; if a grid still looks the wrong width, reload the page.",
        },
      ],
    },
    {
      id: "fc-qtd",
      title: "Quarter-to-date, explained",
      blocks: [
        {
          type: "p",
          text: "'QTD' appears throughout the KPI module — QTD Goal, QTD Achieved, progress percentages. It means quarter-to-date: the portion of the quarter that has already closed.",
        },
        {
          type: "steps",
          items: [
            { title: "The in-progress week is excluded", text: "QTD counts completed weeks only. In week 5 of a quarter, QTD covers weeks 1 to 4. This keeps you from being scored on a week you are still living in." },
            { title: "A finished quarter counts fully", text: "When you look back at a quarter that has already ended, QTD covers every week including the last one — a completed quarter shows its full result, not thirteen-fourteenths of it." },
            { title: "A future quarter is zero", text: "Selecting a quarter that has not started yet shows a QTD of zero rather than a misleading partial figure." },
            { title: "Targets split evenly", text: "Unless you set weekly targets by hand, a quarterly goal is divided equally across the quarter's weeks. Partial weeks receive an equal share — QuikScale does not pro-rate them by day." },
          ],
        },
        {
          type: "table",
          caption: "Reading a KPI row's numbers",
          head: ["Field", "Meaning"],
          widths: [1, 3],
          rows: [
            ["Target Value", "The number this KPI is aiming at for the quarter."],
            ["Quarterly Goal", "The target expressed for the selected quarter. For most KPIs this equals the Target Value."],
            ["QTD Goal", "How much of the quarterly goal should have been achieved by the end of the last completed week."],
            ["QTD Achieved", "The sum (Cumulative) or latest value (Standalone) of the weekly actuals entered so far."],
            ["Progress %", "QTD Achieved against the quarterly goal — the bar in the Progress column."],
          ],
        },
        {
          type: "faq",
          items: [
            { q: "Why is my QTD Goal not exactly a third of my target in week 5?", a: "QTD Goal is the sum of the weekly targets for the weeks that have closed. With thirteen weeks, four closed weeks is 4/13 of the quarterly goal — roughly 31%, not a third." },
            { q: "The dashboard tile and the KPI grid disagree.", a: "They should not. If they do, confirm both are set to the same fiscal year and quarter — the dashboard and the module each carry their own visible period selector." },
            { q: "Can I set different targets for different weeks?", a: "Yes. Open the KPI's log / detail view and edit the weekly targets individually — useful for seasonal KPIs where an even split is misleading." },
          ],
        },
      ],
    },
  ],
};

export const foundationChapters: KBChapter[] = [gettingStarted, navigating, gridBasics, fiscalCalendar];
