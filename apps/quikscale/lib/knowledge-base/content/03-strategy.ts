import type { KBChapter } from "../types";

/* ────────────────────────────────────────────────────────────────────────────
 * Strategy pillar — OPSP, the Rockefeller Habits checklist and SWT.
 * ──────────────────────────────────────────────────────────────────────────── */

export const opsp: KBChapter = {
  id: "opsp",
  title: "OPSP — One-Page Strategic Plan",
  pillar: "Strategy",
  summary: "The whole strategy on one page: values, purpose, targets, goals, actions and this quarter's priorities.",
  route: "/opsp",
  sections: [
    {
      id: "opsp-concept",
      title: "What the OPSP is",
      blocks: [
        {
          type: "p",
          text: "The One-Page Strategic Plan is the centrepiece of Scaling Up and the most substantial module in QuikScale. It holds everything from the timeless — Core Values and Purpose — through the long horizon (3–5 year Targets), the annual horizon (1-year Goals), down to what has to happen in the next ninety days (Quarterly Actions and Priorities). One page, one source of truth, refreshed every quarter.",
        },
        {
          type: "p",
          text: "The critical idea is the cascade. A category that appears in your 3–5 year Targets should reappear in your 1-year Goals and again in your Quarterly Actions, so the ninety-day plan is visibly a slice of the long-term plan. QuikScale enforces that link mechanically: change a category in Targets and it reflects down into Goals and Actions.",
        },
        {
          type: "figure",
          file: "opsp-editor.png",
          caption: "The OPSP editor",
          hint: "Screenshot of /opsp showing the multi-section strategic form: Core Values, Purpose, Targets (3-5 yr), Goals (1 yr), Actions (quarter) and Quarterly Priorities, with the toolbar carrying Save/Finalize/Export.",
        },
      ],
    },
    {
      id: "opsp-sections",
      title: "The sections",
      blocks: [
        {
          type: "table",
          caption: "OPSP structure",
          head: ["Section", "Horizon", "What goes in it"],
          widths: [1.2, 0.9, 2.2],
          rows: [
            ["Core Values", "Timeless", "The three to five rules that do not change — used for hiring, firing and praising."],
            ["Purpose", "Timeless", "Why the organisation exists beyond making money."],
            ["Targets", "3–5 years", "The long-horizon destination, expressed per category with a measurable figure."],
            ["Goals", "1 year", "This year's step towards each target, in the same categories."],
            ["Actions", "This quarter", "The ninety-day slice of each goal."],
            ["Rocks / Quarterly Priorities", "This quarter", "The three to five discrete pieces of work with owners, ready to export into the Priority module."],
            ["Key Thrusts / Capabilities", "3–5 years", "The capabilities that have to be built to reach the targets."],
            ["Key Initiatives", "1 year", "The named programmes delivering this year's goals."],
            ["KPI Accountability", "Ongoing", "Which KPIs are owned by whom, ready to export into the KPI module."],
            ["Critical Number & Theme", "This quarter", "The single number that matters most this quarter, plus the theme and celebration around it."],
          ],
        },
      ],
    },
    {
      id: "opsp-writing",
      title: "Writing an OPSP",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Select the period", text: "Open OPSP → Create OPSP and confirm the fiscal year and quarter at the top. Each quarter has its own OPSP." },
            { title: "Start at the top", text: "Fill Core Values and Purpose first. If they already exist from last quarter they carry forward — review rather than retype." },
            { title: "Write the 3–5 year Targets", text: "One row per category. Name the category, then give the target figure and date. Keep the category names short and stable — they are the spine of the cascade." },
            { title: "Cascade into 1-year Goals", text: "As you name a category in Targets, QuikScale offers to reflect it into the matching Goals row. Accept it and add this year's number." },
            { title: "Cascade into Quarterly Actions", text: "The same reflection runs from Goals into Actions. Add what has to be true ninety days from now." },
            { title: "Agree the Rocks", text: "Three to five quarterly priorities with a named owner each. This is where the plan becomes work." },
            { title: "Set the Critical Number", text: "One number that, if it moves, means the quarter succeeded." },
            { title: "Fill the supporting sections", text: "Key Thrusts, Key Initiatives and KPI Accountability. These take longer the first time and are largely review thereafter." },
            { title: "Finalize", text: "When the leadership team agrees, finalize the OPSP. It becomes read-only and is ready to export." },
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Autosave",
          text: "The editor saves as you type, with a short debounce. There is no Save button to forget — but do wait for the save indicator before closing the tab on a long session.",
        },
      ],
    },
    {
      id: "opsp-cascade",
      title: "The category cascade, in detail",
      blocks: [
        {
          type: "p",
          text: "The cascade links each Targets row to the Goals row in the same position, and each Goals row to the Actions row in the same position. Most of it is silent and automatic; only the cases where you would lose work ask for confirmation.",
        },
        {
          type: "table",
          caption: "What happens when you change a category",
          head: ["Situation", "Behaviour"],
          widths: [1.4, 2.4],
          rows: [
            ["The matching downstream row is empty", "Filled automatically. No prompt."],
            ["The matching downstream row already holds the same name", "Nothing happens."],
            ["The new name already exists in a different downstream row", "Blocked, with a 'Category Already Exists' notice. QuikScale never creates a duplicate category."],
            ["The matching downstream row holds a different name", "A Replace confirmation appears, naming exactly what would be overwritten."],
            ["You cancel the Replace", "The name is added to the first empty downstream row instead, or a new row is grown (up to ten). If neither is possible you are told there are no empty slots."],
            ["You clear a category upstream", "The matching downstream entries are cleared too."],
          ],
        },
        {
          type: "callout",
          tone: "warn",
          title: "Confirming happens once per tier",
          text: "A change made in Targets prompts twice — once for the Goals tier, then again for the Actions tier — because each tier is confirmed on its own. A change made in Goals prompts once. This is deliberate: it lets you accept a change at one level and decline it at the next.",
        },
        {
          type: "figure",
          file: "opsp-cascade-modal.png",
          caption: "A cascade confirmation",
          hint: "Screenshot of the Replace confirmation modal in the OPSP editor, showing the old downstream value, the new value, and the Replace / Cancel buttons.",
        },
      ],
    },
    {
      id: "opsp-finalize",
      title: "Finalizing, deadlines and review",
      blocks: [
        {
          type: "p",
          text: "An OPSP has three states: draft, finalized and reviewed. Draft is editable. Finalized locks the plan so the quarter is executed against a fixed target. Reviewed means the quarter has been closed out and scored after the fact.",
        },
        {
          type: "steps",
          items: [
            { title: "Finalize the plan", text: "Once the leadership team agrees, finalize. The editor becomes read-only and Export unlocks." },
            { title: "Watch the finalize banner", text: "If your organisation has set a finalize threshold, a countdown banner appears at the top of the app. The countdown runs from the date the OPSP was created, not from the quarter end." },
            { title: "Execute the quarter", text: "Work happens in Priority, KPI and WWW. The OPSP stays fixed as the reference." },
            { title: "Review at quarter end", text: "OPSP → OPSP Review scores each planned item against what actually happened. If a review threshold is configured, an unreviewed finalized quarter surfaces a reminder banner — and stays overdue until it is reviewed." },
            { title: "Keep the history", text: "OPSP → OPSP History lists every past quarter's plan, read-only, with its review outcome." },
          ],
        },
        {
          type: "callout",
          tone: "warn",
          title: "Quarters unlock in order",
          text: "A new quarter's OPSP stays locked until the previous quarter's review has been submitted. This is intentional — it makes closing the loop a prerequisite for planning the next ninety days rather than an optional extra.",
        },
        {
          type: "p",
          text: "Critical Review is a narrower variant of OPSP Review. A user granted only critical-review rights sees the module in the sidebar labelled 'Critical Review' and can score only the critical items, without full review access.",
        },
      ],
    },
    {
      id: "opsp-export",
      title: "Exporting the plan into execution",
      blocks: [
        {
          type: "p",
          text: "This is the payoff of writing the plan in QuikScale rather than in a document. A finalized OPSP can push its Quarterly Priorities into the Priority module and its KPI Accountability rows into the KPI module, so the plan becomes tracked work without anyone re-typing it.",
        },
        {
          type: "steps",
          items: [
            { title: "Open Export on a finalized OPSP", text: "Choose Create Priorities or Create KPIs." },
            { title: "Review the mapping", text: "QuikScale shows each planned row with its owner and target, and flags any that look like duplicates of something that already exists." },
            { title: "Choose create or replace", text: "For rows that already exist you can replace them. Replacing offers a Reset option that clears the existing weekly actuals and notes so the item starts fresh; leaving it off carries the previous data forward." },
            { title: "Optionally notify owners", text: "When replacing, you can email the owner that their KPI or priority was replaced." },
            { title: "Confirm", text: "The created rows appear in Priority and KPI marked 'Imported from OPSP', so planned items are distinguishable from ad-hoc ones." },
          ],
        },
        {
          type: "p",
          text: "The OPSP itself also exports as a formatted PDF or Word document — the traditional one-page plan, ready to print or circulate.",
        },
        {
          type: "figure",
          file: "opsp-export.png",
          caption: "Exporting an OPSP",
          hint: "Screenshot of the OPSP export flow showing the Create Priorities / Create KPIs options and the duplicate-detection list with Create / Replace choices per row.",
        },
      ],
    },
    {
      id: "opsp-categories",
      title: "Category management",
      blocks: [
        {
          type: "p",
          text: "OPSP → Category Mgmt holds the list of category names available in the Targets, Goals and Actions pickers. Curating it is what keeps the cascade tidy across quarters — free-typed categories drift ('Revenue', 'revenue', 'Rev'), and the cascade matches on the name.",
        },
        {
          type: "bullets",
          items: [
            "Add the categories your strategy is organised around: Revenue, Margin, People, Product, Customer, and so on.",
            "Keep the list short. Five to eight categories covers most organisations.",
            "Rename rather than delete-and-recreate, so existing plans keep their link.",
            "Deleted master-data rows go to a trash view rather than disappearing outright.",
          ],
        },
        {
          type: "faq",
          items: [
            { q: "I finalized by mistake. Can I unlock it?", a: "Yes, but it needs a specific permission that is deliberately not granted to administrators by default — it must be turned on explicitly. Ask whoever manages roles in your organisation." },
            { q: "The Replace modal keeps coming back.", a: "That is by design when the change has not been resolved. Either confirm the replace or clear the upstream category; a dismissed prompt re-surfaces so the cascade is never left silently out of sync." },
            { q: "Can two people edit the OPSP at the same time?", a: "It is technically possible, but the editor autosaves per field and the last write wins. Treat the OPSP as a single-driver document during a planning session." },
            { q: "Why can't I open next quarter's OPSP?", a: "The previous quarter's review has not been submitted. Complete OPSP Review for that quarter and the next one unlocks." },
          ],
        },
      ],
    },
  ],
};

export const habits: KBChapter = {
  id: "habits",
  title: "Rockefeller Habits Checklist",
  pillar: "Strategy",
  summary: "The ten habits, scored by the team, aggregated by the administrator, tracked quarter after quarter.",
  route: "/performance/habits",
  sections: [
    {
      id: "habits-concept",
      title: "What it is",
      blocks: [
        {
          type: "p",
          text: "The Rockefeller Habits Checklist is Scaling Up's self-diagnostic: ten habits, each with four supporting statements, that describe a well-run organisation. Scoring it honestly every quarter tells you which disciplines are actually in place and which are aspirational.",
        },
        {
          type: "p",
          text: "In QuikScale the module has two faces. Everyone in the organisation sees a one-page fill form and scores the habits from their own vantage point. Administrators additionally get the history panel, the aggregate view across all respondents and the flow that launches a new round.",
        },
        {
          type: "figure",
          file: "habits-fill-form.png",
          caption: "The habits fill form",
          hint: "Screenshot of /performance/habits as a non-admin: the ten habits listed with their four sub-items each and the scoring controls.",
        },
      ],
    },
    {
      id: "habits-ten",
      title: "The ten habits",
      blocks: [
        {
          type: "bullets",
          ordered: true,
          items: [
            "The executive team is healthy and aligned.",
            "Everyone is aligned with the #1 thing that needs to be accomplished this quarter.",
            "Communication rhythm is established and information moves through the organisation accurately and quickly.",
            "Every facet of the organisation has a person assigned with accountability for ensuring goals are met.",
            "Ongoing employee input is collected to identify obstacles and opportunities.",
            "Reporting and analysis of customer feedback data is as frequent and accurate as financial data.",
            "Core Values and Purpose are 'alive' in the organisation.",
            "Employees can articulate the key components of the company's strategy accurately.",
            "All employees can answer quantitatively whether they had a good day or week.",
            "The company's plans and performance are visible to everyone.",
          ],
        },
        {
          type: "p",
          text: "Each habit expands into four concrete sub-items — for example, habit three breaks down into a daily huddle under fifteen minutes, a weekly meeting for every team, monthly management learning sessions, and quarterly and annual offsites. You score the sub-items, and the habit's score follows from them.",
        },
      ],
    },
    {
      id: "habits-running",
      title: "Running a round",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Administrator launches a round", text: "From the admin view, start a round for the current quarter. Participants are notified that a checklist is waiting." },
            { title: "Everyone fills it in", text: "Each participant opens Habits and scores the sub-items honestly from their own position. It takes about ten minutes." },
            { title: "Watch the deadline", text: "Rounds have a completion window, and reminders go out as it approaches." },
            { title: "Administrator reads the aggregate", text: "The aggregate view shows the organisation's score per habit and per sub-item, with the spread across respondents." },
            { title: "Pick two habits", text: "Do not try to fix ten. Choose the two lowest-scoring habits, turn them into quarterly Priorities, and re-score next quarter." },
            { title: "Compare over time", text: "The history panel shows previous rounds so you can see whether the disciplines are actually improving." },
          ],
        },
        {
          type: "callout",
          tone: "rule",
          title: "Aggregate results are administrator-only",
          text: "Only system administrators can see the history and aggregate views. A per-user permission grant does not open them. This is deliberate — the checklist only produces honest answers if respondents know their individual scores are not being circulated.",
        },
        {
          type: "figure",
          file: "habits-aggregate.png",
          caption: "The aggregate view",
          hint: "Screenshot of the admin AggregateView: per-habit scores across all respondents with colour coding and the spread/count per sub-item.",
        },
        {
          type: "bullets",
          items: [
            "The checklist exports to Excel for offsite discussion.",
            "Scores are stored per quarter, so a round belongs to a specific point in your rhythm.",
            "A habit that scores well four quarters running is a discipline you can stop worrying about; the point of the tool is to find the ones that do not.",
          ],
        },
      ],
    },
  ],
};

export const swt: KBChapter = {
  id: "swt",
  title: "SWT — Strengths, Weaknesses, Trends",
  pillar: "Strategy",
  summary: "The Scaling Up alternative to SWOT: inherent strengths, inherent weaknesses and the outside trends that will hit you.",
  route: "/performance/swt",
  sections: [
    {
      id: "swt-concept",
      title: "Why SWT, not SWOT",
      blocks: [
        {
          type: "p",
          text: "Scaling Up replaces SWOT with SWT for a specific reason: opportunities and threats are usually the same external trend viewed from two angles, and separating them produces two lists that say the same thing. SWT asks three sharper questions instead.",
        },
        {
          type: "kv",
          items: [
            { k: "Strengths", v: "What are the inherent strengths of the organisation that have been the source of your success? Inherent means structural — not this quarter's good news." },
            { k: "Weaknesses", v: "What are the inherent weaknesses that are not likely to change? Naming them honestly is more useful than pretending they are fixable." },
            { k: "Trends", v: "What significant changes in technology, distribution, product innovation, markets, consumers, social attitudes and regulation might affect your industry?" },
          ],
        },
        {
          type: "figure",
          file: "swt-page.png",
          caption: "The SWT worksheet",
          hint: "Screenshot of /performance/swt showing the three colour-coded sections — blue Trends, green Strengths, red Weaknesses — with entries listed and the Export PDF control.",
        },
      ],
    },
    {
      id: "swt-using",
      title: "Building the worksheet",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Select the quarter", text: "SWT entries belong to a fiscal year and quarter, so the worksheet is a point-in-time snapshot you can compare against later." },
            { title: "Add entries", text: "Click Add and choose the type — Strength, Weakness or Trend — then write the entry as a full statement rather than a keyword." },
            { title: "Categorise trends", text: "Trends carry a category: Technology, Distribution, Product Innovation, Markets, Consumer, Social or Regulatory. Categorising them shows where the pressure is concentrated." },
            { title: "Set a direction", text: "Each trend is marked as an Opportunity, a Threat or Neutral. This is the SWOT information, captured on the trend itself rather than as separate lists." },
            { title: "Note the impact", text: "Record why the entry matters. This is what makes the worksheet re-readable next quarter." },
            { title: "Reorder", text: "Drag entries so the most significant sit at the top of each section." },
            { title: "Export", text: "Export the worksheet as a formatted PDF for the strategy offsite. What you see in the preview is exactly what downloads." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Run SWT before writing the OPSP",
          text: "The SWT worksheet is the input to the strategy conversation, not a record of it. Fill it first, discuss it, then write the Targets and Goals in the OPSP with the trends in front of you." },
        {
          type: "faq",
          items: [
            { q: "Should a weakness we plan to fix go in the Weaknesses list?", a: "Only if it is inherent. A fixable problem is a quarterly Priority, not a structural weakness. Mixing the two is the most common misuse of the worksheet." },
            { q: "How many entries is right?", a: "Roughly three to five per section. A worksheet with thirty trends has not been prioritised and will not change any decision." },
            { q: "Does SWT feed anything else automatically?", a: "No. It is a thinking tool that informs the OPSP by hand. That is intentional — strategy should be a decision, not a data flow." },
          ],
        },
      ],
    },
  ],
};

export const strategyChapters: KBChapter[] = [opsp, habits, swt];
