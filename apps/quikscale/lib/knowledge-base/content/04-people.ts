import type { KBChapter } from "../types";

/* ────────────────────────────────────────────────────────────────────────────
 * People pillar — the quarterly performance cycle, accountability charts and
 * engagement surveys.
 * ──────────────────────────────────────────────────────────────────────────── */

export const peopleCycle: KBChapter = {
  id: "people-cycle",
  title: "Goals & Pillars — the Performance Cycle",
  pillar: "People",
  summary: "Cycle, Self-Assessment, Reviews, 1:1s, Feedback and Talent — the quarterly people rhythm.",
  route: "/performance/cycle",
  sections: [
    {
      id: "pc-overview",
      title: "The six pages",
      blocks: [
        {
          type: "p",
          text: "Goals & Pillars is the People pillar's working area. Six pages cover a full quarterly performance cycle, from 'what phase are we in' through self-assessment, manager review, one-to-ones, continuous feedback and talent calibration.",
        },
        {
          type: "table",
          head: ["Page", "Who uses it", "Purpose"],
          widths: [1.1, 1.1, 2.2],
          rows: [
            ["Cycle", "Everyone", "The hub. Computes which phase of the quarterly cycle you are in and tells you what to do next."],
            ["Self-Assessment", "Individual contributors", "Your own view of your quarter, written before your manager writes theirs."],
            ["Reviews", "Managers", "The formal performance review: rating, strengths, improvements and notes."],
            ["1:1 Meetings", "Manager and report", "Recurring syncs with talking points, action items, notes and a mood check."],
            ["Feedback", "Everyone", "Continuous, lightweight feedback between colleagues, outside the review cycle."],
            ["Talent", "Leadership", "The nine-box grid: performance against potential, with flight risk and succession readiness."],
          ],
        },
        {
          type: "figure",
          file: "people-cycle-hub.png",
          caption: "The Cycle hub",
          hint: "Screenshot of /performance/cycle showing the current phase card, the week-in-quarter and weeks-remaining figures, and the next-action links to Self-Assessment or Reviews.",
        },
      ],
    },
    {
      id: "pc-phases",
      title: "The cycle phases",
      blocks: [
        {
          type: "p",
          text: "The Cycle page reads your quarter settings, your review records and your goals, then works out which phase the organisation is in. It is read-only — it writes nothing — but it is the fastest way to know what is expected of you right now.",
        },
        {
          type: "table",
          caption: "Phases of a quarter",
          head: ["Phase", "When", "What you do"],
          widths: [1.2, 1.1, 2.1],
          rows: [
            ["Quarter kickoff", "First weeks", "Agree goals and priorities for the quarter."],
            ["Execution", "The bulk of the quarter", "Deliver. KPI, Priority and WWW carry the load."],
            ["Self-assessment", "Near quarter end", "Individual contributors write their own view of the quarter."],
            ["Manager review", "Quarter end", "Managers write the formal review and rating."],
            ["Calibration", "After reviews", "Leadership compares ratings across teams and updates the Talent grid."],
            ["Closed", "Cycle complete", "The quarter is scored; the next kickoff begins."],
          ],
        },
      ],
    },
    {
      id: "pc-self",
      title: "Self-Assessment",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Open Self-Assessment", text: "It defaults to the current fiscal quarter." },
            { title: "Write your strengths", text: "What went well and what you want to keep doing. Be specific — reference actual KPIs and priorities." },
            { title: "Write your improvements", text: "What you would do differently. This is the section managers read most carefully." },
            { title: "Add notes and a rating", text: "Any context that the two sections above miss, plus your own star rating." },
            { title: "Save", text: "Your self-assessment is stored against the quarter and is visible to your reviewer when they write the formal review." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Write it before the review, not during",
          text: "The point of a self-assessment is to change what the manager writes. Submitting it after the review has been written turns it into paperwork." },
      ],
    },
    {
      id: "pc-reviews",
      title: "Performance Reviews",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Open Reviews and create one", text: "Choose the person and the quarter." },
            { title: "Read their self-assessment first", text: "It is attached to the same person and quarter." },
            { title: "Score with the star rating", text: "The rating and the computed overall score are shown as a coloured badge — green at 80% and above, amber from 60%, red below." },
            { title: "Write strengths and improvements", text: "Two short paragraphs beat a page of prose. Cite evidence from KPI and Priority data." },
            { title: "Save", text: "The review appears on the person's Analytics → Individual detail page and in the cycle history." },
          ],
        },
        {
          type: "figure",
          file: "people-review-panel.png",
          caption: "Writing a review",
          hint: "Screenshot of the Reviews right-panel with the star rating control, the strengths and improvements text areas, and the score pill.",
        },
      ],
    },
    {
      id: "pc-oneonone",
      title: "1:1 Meetings",
      blocks: [
        {
          type: "p",
          text: "The 1:1 page lists every session where you are either the manager or the report, so both sides work from the same record. Sessions carry a scheduled time and duration, talking points, action items, notes and an optional mood marker.",
        },
        {
          type: "bullets",
          items: [
            "Create a session, pick the other participant, and set the date and duration.",
            "Both participants can add talking points before the meeting — an agenda that neither side has to email.",
            "Action items agreed in a 1:1 belong in WWW if they are commitments to the wider team; keep the 1:1's own action list for personal follow-ups.",
            "The mood marker is a quick temperature check over time; a run of low moods is worth a conversation on its own.",
            "Mark a session complete when it has happened, so the list stays a genuine record.",
          ],
        },
      ],
    },
    {
      id: "pc-feedback",
      title: "Feedback",
      blocks: [
        {
          type: "p",
          text: "Feedback is continuous and lightweight — a note from one colleague to another, captured at the moment it is relevant rather than saved for the quarterly review. Over a quarter it becomes the evidence base that makes reviews specific instead of impressionistic.",
        },
        {
          type: "callout",
          tone: "tip",
          title: "Feed it into the Start / Stop / Keep habit",
          text: "Rockefeller Habit five asks every leader to have a Start/Stop/Keep conversation with at least one employee each week. Recording the outcome as feedback is what turns that habit from an intention into something you can score." },
      ],
    },
    {
      id: "pc-talent",
      title: "Talent — the nine-box grid",
      blocks: [
        {
          type: "p",
          text: "Talent plots each person on performance against potential, producing the classic nine-box grid. Alongside the grid position, each person carries a set of judgements that leadership calibrates together.",
        },
        {
          type: "table",
          head: ["Attribute", "Values", "Question it answers"],
          widths: [1.1, 1.5, 2],
          rows: [
            ["Performance band", "Low / Medium / High", "How are they doing in the current role?"],
            ["Potential band", "Low / Medium / High", "How much further could they go?"],
            ["Classification", "A / B / C", "The overall calibration call."],
            ["Right seat", "Yes / No", "Are they in the role that fits them?"],
            ["Capacity", "Under / At / Over", "Is their workload sustainable?"],
            ["Flight risk", "Low / Medium / High", "How likely are we to lose them?"],
            ["Succession", "Not ready / Developing / Ready now", "Could they step up if needed?"],
            ["Rehire decision", "Would / Would not", "The Topgrading question: knowing what you know now, would you hire them again?"],
          ],
        },
        {
          type: "figure",
          file: "people-talent-grid.png",
          caption: "The nine-box talent grid",
          hint: "Screenshot of /performance/talent showing the 3×3 grid with people plotted in quadrants, and the side panel with the per-person attributes.",
        },
        {
          type: "callout",
          tone: "warn",
          title: "Talent data is sensitive",
          text: "Flight risk, rehire decisions and classifications are leadership calibration data, not feedback for the individual. Grant access to the Talent module deliberately and narrowly." },
        {
          type: "faq",
          items: [
            { q: "Do people see their own talent classification?", a: "Only if they have been granted access to the module. It is normally restricted to leadership." },
            { q: "How often should the grid be updated?", a: "Once a quarter, in the calibration phase, as a leadership conversation. Updating it individually and privately defeats the purpose." },
            { q: "What is the benchmark setting for?", a: "It sets the distribution leadership expects across the classifications, so calibration has a reference point instead of drifting towards everyone being an A." },
          ],
        },
      ],
    },
  ],
};

export const facePace: KBChapter = {
  id: "face-pace",
  title: "FACe & PACe — Accountability Charts",
  pillar: "People",
  summary: "One name against every function and every process — Rockefeller Habit four, made concrete.",
  route: "/performance/face",
  sections: [
    {
      id: "fp-concept",
      title: "The idea",
      blocks: [
        {
          type: "p",
          text: "Rockefeller Habit four says every facet of the organisation has a person accountable for it. FACe and PACe are the two charts that make that testable. They share one editor and one export; only the axis differs.",
        },
        {
          type: "kv",
          items: [
            { k: "FACe — Function Accountability Chart", v: "Every function in the business (sales, marketing, operations, finance, people, technology) with one named owner and the two or three measures that tell you whether that function is healthy." },
            { k: "PACe — Process Accountability Chart", v: "Every process that crosses functions (lead to sale, order to delivery, hire to productive, concept to launch) with one named owner and the measures for the process end to end." },
          ],
        },
        {
          type: "figure",
          file: "face-chart.png",
          caption: "The FACe chart",
          hint: "Screenshot of /performance/face showing the function rows with their accountable person, the measures per function, and the preview / export controls.",
        },
      ],
    },
    {
      id: "fp-building",
      title: "Building a chart",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "List the functions or processes", text: "Start from how the business actually runs, not from the org chart. FACe follows the functions; PACe follows the flow of work across them." },
            { title: "Assign exactly one name", text: "One accountable person per row. Two names means nobody is accountable — this is the single rule that makes the chart useful." },
            { title: "Add the measures", text: "Two or three numbers per row that would tell an outsider whether the function or process is healthy." },
            { title: "Look for the pattern", text: "One person's name against six functions is a capacity problem. A row with no name is a gap. Both are findings worth acting on." },
            { title: "Connect to KPI", text: "The measures you list here should mostly exist as tracked KPIs. Where they do not, that is your KPI backlog." },
            { title: "Export", text: "Preview and export the chart as a PDF for the strategy offsite." },
          ],
        },
        {
          type: "callout",
          tone: "rule",
          title: "One name per row",
          text: "Accountability does not divide. If a function genuinely needs two people, it is two rows or it is one owner with a deputy — never one row with two names." },
        {
          type: "faq",
          items: [
            { q: "Is FACe the same as an org chart?", a: "No, and the difference matters. An org chart shows reporting lines; FACe shows accountability for outcomes. One person can own several functions, and a junior person can own a function their manager does not." },
            { q: "How often should we rebuild them?", a: "Annually, or whenever the shape of the business changes. They are not weekly artefacts." },
            { q: "Do FACe and PACe feed the Habits checklist?", a: "Not automatically, but habit four asks explicitly whether both charts are complete — so keeping them current is what lets you score that habit honestly." },
          ],
        },
      ],
    },
  ],
};

export const survey: KBChapter = {
  id: "survey",
  title: "Survey",
  pillar: "People",
  summary: "Employee and customer pulse surveys with public links, multiple question types and built-in analytics.",
  route: "/performance/survey",
  sections: [
    {
      id: "sv-concept",
      title: "What it does",
      blocks: [
        {
          type: "p",
          text: "The Survey module runs the recurring feedback loops Scaling Up asks for — employee pulse (eNPS) and customer pulse (cNPS) — plus any other structured question set you want to send. Each survey gets a public link that respondents can open without a QuikScale account, and responses feed straight into the module's analytics.",
        },
        {
          type: "figure",
          file: "survey-list.png",
          caption: "The Survey module",
          hint: "Screenshot of /performance/survey showing the Analytics / Surveys / Responses tabs, the survey list with type, status and the copy-public-link control.",
        },
      ],
    },
    {
      id: "sv-using",
      title: "Running a survey",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Create the survey", text: "Give it a title, pick a type, and set the fiscal year and quarter it belongs to." },
            { title: "Write the questions", text: "Add questions in order, choosing an answer type for each. Mark questions required where an empty answer would make the response useless, and allow a free-text comment where the 'why' matters more than the score." },
            { title: "Publish", text: "Set the survey to active. Publishing generates the public token." },
            { title: "Share the link", text: "Copy the public link and send it out. Respondents do not need an account, which is what makes it usable for customers." },
            { title: "Watch the responses", text: "The Responses tab lists submissions as they arrive." },
            { title: "Read the analytics", text: "The Analytics tab summarises scores per question and across the survey." },
            { title: "Close it", text: "Set the survey inactive when the window ends so late responses do not skew a period you have already reported." },
          ],
        },
        {
          type: "callout",
          tone: "warn",
          title: "The public link is genuinely public",
          text: "Anyone holding the link can submit a response — that is what allows customers to answer. Share it through the channel you intend, and close the survey when the window ends." },
        {
          type: "bullets",
          items: [
            "Surveys are scoped to a fiscal year and quarter, so quarter-over-quarter comparison is built in.",
            "Actions arising from survey results belong in WWW, categorised as eNPS or cNPS — that is exactly what those WWW categories are for.",
            "Running the same short survey every quarter beats running a long one once a year; the trend is the finding.",
          ],
        },
      ],
    },
  ],
};

export const peopleChapters: KBChapter[] = [peopleCycle, facePace, survey];
