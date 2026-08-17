"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Search, ArrowLeft } from "lucide-react";
import { sanitizeRichText } from "@/lib/sanitize";

interface HelpArticle {
  id: string;
  title: string;
  excerpt: string;
  category: "DOCUMENTATION" | "GUIDE" | "TUTORIAL";
  lastModified: string; // ISO date — formatted for display by the panel
  views: number;
  likes: number;
  /** Tags help the search match across body keywords without storing the
   *  whole article inline. Keep them lowercase for cheap match. */
  tags: string[];
  /** Rich body rendered into the article detail view as HTML. Authored
   *  inline so the panel ships without an external CMS. */
  body: string;
}

/**
 * Seed list of help articles. We keep the catalog inline so the panel works
 * out of the box without an external CMS — when an editorial pipeline lands,
 * swap this for a fetch from `/api/help/articles`.
 */
const ARTICLES: HelpArticle[] = [
  {
    id: "board-overview",
    title: "What is the board?",
    excerpt:
      "Read more about how the board works in QuikTrack — drag cards between status columns, group cards by epic, and run a sprint to completion.",
    category: "DOCUMENTATION",
    lastModified: "2026-04-22",
    views: 25_505,
    likes: 30,
    tags: ["board", "kanban", "sprint", "drag", "column", "status"],
    body: `
      <p>The <strong>Board</strong> is your team's day-to-day Kanban view of the work currently in flight. Each column on the board maps to a workflow status — typically <em>To Do</em>, <em>In Progress</em>, <em>In Review</em>, <em>Done</em> — and each card represents a single work item (Task, Story, or Bug).</p>
      <h3>Where the cards come from</h3>
      <p>The board only renders work items that belong to the <strong>active sprint</strong> for the project. If no sprint is active, you'll see empty column shells with a prompt to start a sprint from the Backlog.</p>
      <p>Subtasks are not rendered as their own card — instead, expand a parent card with the hierarchy icon to see its subtasks underneath.</p>
      <h3>Moving work between columns</h3>
      <p>Drag any card by its body and drop it on a different column. QuikTrack updates the work item's status server-side, fires a history entry on the issue's Activity tab, and rebroadcasts the change to anyone else viewing the board.</p>
      <p>You can also reorder columns themselves by dragging the column header.</p>
      <h3>Filtering and grouping</h3>
      <p>Use the toolbar's <strong>Search</strong> and <strong>Filter</strong> controls to narrow the board by assignee, type, or priority. Avatars in the toolbar quickly toggle a single-assignee filter.</p>
      <p>Cards belonging to an Epic show a colored chip with the epic's name on the card itself, so you can see at a glance how a card fits into its larger goal without breaking the flat layout.</p>
    `,
  },
  {
    id: "create-task-from-board",
    title: "Create a task directly from the board",
    excerpt:
      "Hover any column to reveal the inline + Create button. New tasks land in the backlog and can be slotted into a sprint via the post-create notification.",
    category: "GUIDE",
    lastModified: "2026-05-01",
    views: 1_412,
    likes: 11,
    tags: ["board", "create", "task", "backlog", "inline"],
    body: `
      <p>You can spin up a new work item without leaving the board.</p>
      <h3>Open the inline creator</h3>
      <p>Hover any column. The <strong>+ Create</strong> link fades in at the bottom of that column. Click it and the column expands a small composer:</p>
      <ul>
        <li><strong>Title</strong> input on top — describe what needs to be done.</li>
        <li><strong>Type picker</strong> (default Task) — choose Task, Bug, Story, or Epic.</li>
        <li><strong>Due date</strong> calendar.</li>
        <li><strong>Assignee</strong> picker.</li>
        <li><strong>Return-key</strong> button (or just press Enter) to submit.</li>
      </ul>
      <h3>What happens after you submit</h3>
      <p>The work item is created in the <strong>backlog</strong> — not in the active sprint, even though you created it from the board. This is intentional so you can triage where it really belongs.</p>
      <p>Two notifications appear:</p>
      <ul>
        <li>A green <strong>"You've created &lt;KEY&gt;"</strong> toast at the bottom-left, with quick links to View and Copy link.</li>
        <li>A purple <strong>"Changes are saved, but work item isn't visible"</strong> card under the column with one-click <strong>Add to &lt;Sprint&gt;</strong> actions.</li>
      </ul>
      <p>Pick a sprint to immediately surface the new card on the board, or dismiss the notification to leave it in the backlog.</p>
    `,
  },
  {
    id: "linked-work-items",
    title: "Linking work items",
    excerpt:
      "Connect related issues with relationship types like 'relates to'. Open the issue, click + on the Linked work items panel, and pick a target — or create one inline.",
    category: "DOCUMENTATION",
    lastModified: "2026-05-02",
    views: 842,
    likes: 8,
    tags: ["link", "relates", "issue", "relationship"],
    body: `
      <p>Linked work items capture a relationship between two issues — for example, "this work item relates to SCRUM-39". Links surface on the issue detail panel and in the issue's history feed.</p>
      <h3>Add a link</h3>
      <p>Open any issue and find the <strong>Linked work items</strong> section. Click the <strong>+</strong> on the right of the section header to open the inline creator:</p>
      <ol>
        <li>Pick a relationship type (currently <em>relates to</em> — more types are coming).</li>
        <li>Click into the search box. The dropdown opens immediately and shows <strong>Recently viewed</strong> issues plus the rest of this project's work items.</li>
        <li>Type to filter — the search runs against issue key, title, and description.</li>
        <li>Click an item to select it and press <strong>Link</strong>.</li>
      </ol>
      <h3>Create a new linked work item inline</h3>
      <p>Use <strong>+ Create linked work item</strong> at the bottom of the inline creator. The standard Create modal opens with this project pre-selected; on save, the new work item is automatically linked back to the issue you started from.</p>
      <h3>Remove a link</h3>
      <p>Hover any linked row and click the <strong>×</strong> on the right. The link is removed and a "Link removed" entry is recorded in the issue's history.</p>
    `,
  },
  {
    id: "comments-and-reactions",
    title: "Add comments and reactions",
    excerpt:
      "Use the Activity tab on any issue to leave comments. The composer expands into a rich-text editor on focus, and quick-pills like 🎉 Looks good! post one-click reactions.",
    category: "GUIDE",
    lastModified: "2026-05-04",
    views: 612,
    likes: 5,
    tags: ["comment", "activity", "reaction", "discussion"],
    body: `
      <p>Discussions on a work item live in its <strong>Activity</strong> panel.</p>
      <h3>Leave a comment</h3>
      <p>Open the issue and scroll to <strong>Activity</strong>. The composer shows a placeholder "Add a comment…". Click into it and the box expands into a full rich-text editor — bold, italic, headings, lists, links, code, and the slash menu all work.</p>
      <p>Press <strong>Save</strong> to post. Press <strong>Cancel</strong> to discard.</p>
      <h3>Use a reaction quick-pill</h3>
      <p>Below the composer, a row of one-click reactions sends the matching message instantly:</p>
      <ul>
        <li>🎉 Looks good!</li>
        <li>👋 Need help?</li>
        <li>⛔ This is blocked…</li>
        <li>🔍 Can you clarify…?</li>
        <li>✅ This is done.</li>
      </ul>
      <p>The reaction posts as a normal comment with the emoji + label, so it appears in the same thread as longer-form messages.</p>
      <h3>Edit or delete</h3>
      <p>Hover one of your own comments and use the inline action icons. Edits stamp an <em>(edited)</em> marker next to the timestamp.</p>
    `,
  },
  {
    id: "issue-history",
    title: "Track issue history",
    excerpt:
      "The History tab on any issue shows a chronological diff of every change — status flips, assignee swaps, link adds, sprint moves, due-date edits, and more.",
    category: "DOCUMENTATION",
    lastModified: "2026-05-04",
    views: 305,
    likes: 4,
    tags: ["history", "audit", "change", "diff", "activity"],
    body: `
      <p>The <strong>History</strong> tab inside any issue's Activity panel is an append-only audit log of every tracked change.</p>
      <h3>What gets recorded</h3>
      <p>Every PATCH on the issue records a row when one of these fields changes:</p>
      <ul>
        <li>Status, Assignee, Reporter</li>
        <li>Parent, Epic, Sprint</li>
        <li>Priority, Type, Title</li>
        <li>Start date, Due date</li>
        <li>Story points, ETA</li>
        <li>Linked work items added or removed</li>
      </ul>
      <p>Drag-and-drop on the board, sprint moves, and inline edits all funnel through the same instrumentation, so the history reflects the full set of changes — not just what the user typed in a form.</p>
      <h3>Reading the timeline</h3>
      <p>Each row shows the actor's avatar, who they are, what they changed, and a before → after diff in chip form. Use the sort-order toggle in the top-right of the Activity panel to flip between newest-first and oldest-first.</p>
    `,
  },
  {
    id: "log-time",
    title: "Log time on a work item",
    excerpt:
      "Open the Activity → Work log tab and pick Log time. Use the format 2w 4d 6h 45m. Time logs roll up to the parent issue's estimate.",
    category: "GUIDE",
    lastModified: "2026-05-04",
    views: 1_120,
    likes: 14,
    tags: ["time", "log", "worklog", "duration", "tempo"],
    body: `
      <p>QuikTrack tracks effort with timesheet-style entries against any work item.</p>
      <h3>Log a single entry from the issue</h3>
      <p>Open the issue, switch to the <strong>Activity</strong> panel's <strong>Work log</strong> tab, and click <strong>Log time</strong>. The modal asks for:</p>
      <ul>
        <li><strong>Time spent</strong> — duration in <code>2w 4d 6h 45m</code> format. <code>w</code> = weeks (5d), <code>d</code> = days (8h), <code>h</code> = hours, <code>m</code> = minutes. A bare number is treated as hours.</li>
        <li><strong>Time remaining</strong> (optional) — informational only.</li>
      </ul>
      <p>Press <strong>Save</strong> and the entry is added to the work log immediately, with the total at the top of the tab.</p>
      <h3>Time-exceeded warning</h3>
      <p>If the total logged hours surpasses the work item's <em>Original estimate</em>, a red banner appears at the top of the issue: <em>"Time exceeded by 2h — logged 4h of 2h estimated"</em>. The banner uses the rolled-up estimate (see Subtask ETA roll-up) so parent tasks stay accurate.</p>
    `,
  },
  {
    id: "subtask-rollup",
    title: "Subtask ETA roll-up",
    excerpt:
      "When a task has subtasks, its ETA is the sum of subtask ETAs and its date range covers the union of subtask dates. Update a subtask and the parent stays in sync.",
    category: "DOCUMENTATION",
    lastModified: "2026-05-05",
    views: 224,
    likes: 3,
    tags: ["subtask", "rollup", "eta", "estimate", "parent"],
    body: `
      <p>QuikTrack treats a parent task with subtasks as a roll-up of its children — your manual estimate on the parent is overwritten with the sum of subtask estimates so reports always reflect what's actually planned.</p>
      <h3>What rolls up</h3>
      <ul>
        <li><strong>ETA</strong> — the parent's <code>eta</code> becomes the sum of subtask ETAs. If no subtask has set an ETA yet, the parent's manual estimate is left alone.</li>
        <li><strong>Start date</strong> — the parent inherits the earliest subtask <code>startDate</code>.</li>
        <li><strong>Due date</strong> — the parent inherits the latest subtask <code>dueDate</code>.</li>
      </ul>
      <h3>When the roll-up runs</h3>
      <p>Whenever a subtask is created, edited (eta, start date, due date, or reparent), or soft-deleted, the affected parent is recalculated in the background. If a subtask is moved to a new parent, both the old and new parents are refreshed so neither retains stale numbers.</p>
      <p>The same rolled-up totals power the <em>Logged ETA</em> column on the Task Table and the time-exceeded banner on the issue detail.</p>
    `,
  },
  {
    id: "timesheet-grid",
    title: "Use the project timesheet",
    excerpt:
      "The Timesheet tab shows logged hours by issue across a week, month, or quarter. Click a cell to edit your entry inline; export the grid to CSV with one click.",
    category: "GUIDE",
    lastModified: "2026-05-05",
    views: 198,
    likes: 2,
    tags: ["timesheet", "grid", "csv", "export", "log"],
    body: `
      <p>The <strong>Timesheet</strong> view is your project's effort grid — one row per issue, one column per day, with hours logged in each cell.</p>
      <h3>Open the timesheet</h3>
      <p>Inside any project click the <strong>Timesheet</strong> tab next to Task Table. For a tenant-wide view across every project, use the <strong>Timesheet</strong> entry in the global sidebar.</p>
      <h3>Move through time</h3>
      <p>Use the prev/next arrows in the toolbar to walk through the period, or <strong>Today</strong> to snap back. Switch the period itself with <strong>Display by: Week / Month / Quarter</strong>.</p>
      <h3>Inline editing</h3>
      <p>Click any cell on your own row to enter edit mode. Type a duration (e.g. <code>2h 30m</code>) and press <strong>Enter</strong> to save. The grid talks to the same API as the issue Log time modal — entries roll up into the issue's Work log.</p>
      <p>Cells that contain multiple entries (e.g. several short logs on the same day) are read-only inline; click <strong>Log time</strong> in the toolbar to add another row.</p>
      <h3>Export</h3>
      <p>The <strong>Export</strong> button in the toolbar produces a CSV of the current view — rows × days with totals — ready to drop into a payroll or invoicing flow.</p>
    `,
  },
  {
    id: "show-hide-statuses",
    title: "Show or hide statuses from the board and backlog",
    excerpt:
      "Unassign statuses from columns to hide associated work items from the board and backlog without deleting any data.",
    category: "DOCUMENTATION",
    lastModified: "2026-04-17",
    views: 3_745,
    likes: 7,
    tags: ["status", "column", "hide", "board", "backlog"],
    body: `
      <p>You can show or hide statuses to keep your board and backlog focused on the work items you need. This is handy when you use multiple statuses to track your work, but only want to see work items with a specific status at specific points in your workflow.</p>
      <p>All the action happens in <strong>Project settings</strong> then <strong>Board</strong> and then <strong>Columns and statuses</strong>.</p>
      <h3>Show a status and its associated work items</h3>
      <p>You can create new statuses in the workflow editor, or by adding a new column to your board.</p>
      <p>From <strong>Columns and statuses</strong>, select <strong>Manage workflow</strong> (found between the column's name and the column itself).</p>
      <p>If you've created a new status in the workflow editor, it'll be in the left panel for unassigned statuses. New statuses aren't assigned to a column by default.</p>
      <p>To show the status and its associated work items, assign the status by dragging and dropping it to a column. If a new status isn't assigned to a column, work items with that status won't be visible on the board and backlog.</p>
      <h3>Hide a status and its associated work items</h3>
      <p>If you'd like to hide a status and its associated work items, store it in the left panel. Work items can still have these statuses, but they won't be visible on the board and backlog. To make these work items visible, change the work items' status to one that's assigned to a column.</p>
    `,
  },
  {
    id: "custom-fields",
    title: "Create custom fields for your work items",
    excerpt:
      "Customize work items so you can capture the information your team needs to complete their tasks.",
    category: "DOCUMENTATION",
    lastModified: "2026-04-16",
    views: 668,
    likes: 1,
    tags: ["custom", "field", "details", "work item"],
    body: `
      <p>Custom fields let you capture information specific to your team's process — sprint commitment, customer name, severity, story points style, anything that doesn't fit the built-in set.</p>
      <h3>Add a custom field</h3>
      <p>Open <strong>Project settings</strong> → <strong>Custom fields</strong>. Click <strong>+ Add field</strong> and pick a type:</p>
      <ul>
        <li><strong>Text</strong> — single line of plain text.</li>
        <li><strong>Number</strong> — integer or decimal.</li>
        <li><strong>Date</strong> — single date with picker.</li>
        <li><strong>Select</strong> — single-choice dropdown with editable options.</li>
        <li><strong>Multi-select</strong> — checkboxes / tag-style picker.</li>
        <li><strong>User</strong> — picks any project member.</li>
      </ul>
      <p>Give the field a name and decide whether it's required.</p>
      <h3>Where custom fields appear</h3>
      <p>Custom fields render in the <strong>Details</strong> panel of every work item, right below the built-in fields, in the order you set in project settings. They are also available as columns on the Task Table and as filters in views that support them.</p>
    `,
  },
  {
    id: "slash-menu",
    title: "Use the / slash menu in the editor",
    excerpt:
      "Inside any rich-text field, type / to open the slash menu. Insert headings, lists, tables, code blocks, dividers, images, and emojis.",
    category: "TUTORIAL",
    lastModified: "2026-05-05",
    views: 410,
    likes: 6,
    tags: ["editor", "slash", "menu", "shortcut", "rich text"],
    body: `
      <p>Every rich-text editor in QuikTrack — issue descriptions, comments, docs, sprint goals — supports a Notion-style slash menu so you can compose without reaching for the toolbar.</p>
      <h3>Open the menu</h3>
      <p>Type <code>/</code> on a new line. A floating menu appears under the cursor with searchable blocks.</p>
      <h3>Available blocks</h3>
      <ul>
        <li>Text — plain paragraph</li>
        <li>Heading 1 / 2 / 3</li>
        <li>Bulleted list / Numbered list / Task list</li>
        <li>Quote</li>
        <li>Code block</li>
        <li>Divider</li>
        <li>Table — 3×3 default</li>
        <li>Image — opens the upload picker</li>
        <li>Emoji — opens the emoji-mart picker</li>
      </ul>
      <h3>Keyboard navigation</h3>
      <p>Use <kbd>↑</kbd> / <kbd>↓</kbd> to move the highlight, <kbd>Enter</kbd> to insert, <kbd>Esc</kbd> to close. Filter the list by typing after the slash.</p>
    `,
  },
  {
    id: "invite-people",
    title: "Invite people to a project",
    excerpt:
      "Click the user-plus icon next to a project name to open the invite modal. Add teammates by name or email, pick a role, and share the project link.",
    category: "GUIDE",
    lastModified: "2026-05-05",
    views: 95,
    likes: 0,
    tags: ["invite", "people", "member", "share", "role"],
    body: `
      <p>Adding a teammate to a project takes about ten seconds.</p>
      <h3>Open the invite dialog</h3>
      <p>From any project, click the <strong>user-plus</strong> icon next to the project's name in the header. The <strong>Add people to &lt;project&gt;</strong> dialog opens.</p>
      <h3>Add invitees</h3>
      <p>Type a name or email in the <strong>Names or emails</strong> field. Press <kbd>Enter</kbd> or comma to commit each entry as a chip; press <kbd>Backspace</kbd> on an empty field to remove the last chip.</p>
      <p>You can also link from external directories using the Google / Slack / Microsoft buttons under <em>or add from</em>.</p>
      <h3>Pick a role</h3>
      <p>The <strong>Role</strong> dropdown applies to every invitee in the dialog. Pick from <em>Administrator</em>, <em>Member</em>, or <em>Viewer</em>. You can change individual roles later from <em>Project settings → Members</em>.</p>
      <h3>Share by link</h3>
      <p>Use <strong>Copy link</strong> in the footer to grab the project URL for sharing in chat or email — useful when the recipient doesn't have an account yet but already has access via SSO.</p>
    `,
  },
];

const PAGE_SIZE = 5;

function relativeOrFormatted(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Slide-in Help panel triggered from the header. Lists feature articles with
 * search-as-you-type filtering across title / excerpt / tags. The catalog is
 * stored inline so the panel works without a separate help backend; swap the
 * `ARTICLES` array for a fetch when one becomes available.
 */
export function HelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Reset back to the first page each time the panel opens, so reopening
  // doesn't surface a giant pre-loaded list or a leftover article view.
  useEffect(() => {
    if (open) {
      setShown(PAGE_SIZE);
      setQuery("");
      setSelectedId(null);
    }
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ARTICLES;
    return ARTICLES.filter((a) => {
      if (a.title.toLowerCase().includes(q)) return true;
      if (a.excerpt.toLowerCase().includes(q)) return true;
      if (a.tags.some((t) => t.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [query]);

  const visible = filtered.slice(0, shown);
  const hasMore = filtered.length > shown;
  const selected = selectedId ? ARTICLES.find((a) => a.id === selectedId) ?? null : null;

  if (!open) return null;

  return (
    <>
      {/* Subtle backdrop — click anywhere to close. */}
      <div
        className="fixed inset-0 bg-black/20 z-[70]"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed right-0 top-0 bottom-0 w-[400px] max-w-full bg-white border-l border-gray-200 shadow-xl z-[71] flex flex-col"
        role="dialog"
        aria-label="Help"
      >
        <div className="grid grid-cols-3 items-center px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="justify-self-start">
            {selected ? (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            ) : null}
          </div>
          <h2 className="text-sm font-semibold text-gray-900 justify-self-center">
            Help
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-500 justify-self-end"
            aria-label="Close help"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!selected && (
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShown(PAGE_SIZE);
                }}
                placeholder="Search help articles"
                className="w-full h-9 pl-8 pr-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <ArticleView article={selected} />
          ) : (
            <>
              {filtered.length === 0 && (
                <div className="px-4 py-8 text-sm text-gray-500 text-center">
                  No articles match &ldquo;{query}&rdquo;.
                </div>
              )}
              <ul className="divide-y divide-gray-100">
                {visible.map((a) => (
                  <li
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className="px-4 py-3 hover:bg-gray-50 cursor-pointer"
                  >
                    <h3 className="text-sm font-semibold text-gray-900 leading-snug">
                      {a.title}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      Last modified: {relativeOrFormatted(a.lastModified)}
                    </p>
                    <p className="mt-1.5 text-xs text-gray-700 leading-snug">{a.excerpt}</p>
                    <div className="mt-2 text-[11px] text-gray-500">
                      <span className="font-semibold uppercase tracking-wider">
                        {a.category}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              {hasMore && (
                <div className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setShown((n) => n + PAGE_SIZE)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Show {Math.min(PAGE_SIZE, filtered.length - shown)} more articles
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

/**
 * Detail view for a single help article. Renders the article body as HTML
 * (the catalog is curated by us — no untrusted input).
 */
function ArticleView({ article }: { article: HelpArticle }) {
  return (
    <div className="px-5 py-4">
      <h1 className="text-xl font-bold text-gray-900 leading-snug">
        {article.title}
      </h1>
      <p className="mt-1 text-[11px] text-gray-500">
        Last modified: {relativeOrFormatted(article.lastModified)} ·{" "}
        <span className="font-semibold uppercase tracking-wider">
          {article.category}
        </span>
      </p>

      <div
        className="mt-4 text-sm text-gray-800 leading-relaxed
          [&_h3]:mt-5 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-gray-900
          [&_p]:mt-2
          [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1
          [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1
          [&_li]:leading-snug
          [&_strong]:font-semibold [&_strong]:text-gray-900
          [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-gray-100 [&_code]:text-[12px] [&_code]:font-mono
          [&_kbd]:px-1 [&_kbd]:py-px [&_kbd]:border [&_kbd]:border-gray-300 [&_kbd]:rounded [&_kbd]:text-[10px] [&_kbd]:font-mono [&_kbd]:bg-gray-50"
        dangerouslySetInnerHTML={{ __html: sanitizeRichText(article.body) }}
      />
    </div>
  );
}
