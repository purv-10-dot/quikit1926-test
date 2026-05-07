/**
 * Doc templates — seed HTML used as the initial body when a user creates a
 * document from a template. The strings are TipTap-flavoured HTML so they
 * round-trip cleanly through the rich-text editor.
 *
 * Adding a template: append a new entry to `DOC_TEMPLATES`, give it a stable
 * `key`, an icon emoji, a short description, and a `body` HTML string.
 */

export interface DocTemplate {
  key: string;
  name: string;
  description: string;
  icon: string;
  category?: "popular" | "design" | "support" | "engineering" | "general";
  body: string;
}

export const DOC_TEMPLATES: DocTemplate[] = [
  {
    key: "blank",
    name: "Blank page",
    description: "Start a page from scratch.",
    icon: "📄",
    category: "general",
    body: "<p></p>",
  },
  {
    key: "product-requirements",
    name: "Product requirements",
    description: "Document product requirements and specifications.",
    icon: "✅",
    category: "popular",
    body: `
<h1>Product requirements</h1>
<table>
  <tr><th>Author</th><td>@ mention</td></tr>
  <tr><th>Status</th><td>Draft</td></tr>
  <tr><th>Last updated</th><td>—</td></tr>
</table>
<h2>Problem</h2>
<p>What user problem are we solving and why now?</p>
<h2>Goals &amp; non-goals</h2>
<ul><li>Goal 1</li><li>Goal 2</li><li>Non-goal</li></ul>
<h2>Proposed solution</h2>
<p>Describe the proposal in 2–3 paragraphs. Link to designs.</p>
<h2>Scope &amp; milestones</h2>
<table>
  <tr><th>Milestone</th><th>Owner</th><th>Date</th></tr>
  <tr><td>M1</td><td>@</td><td></td></tr>
</table>
<h2>Open questions</h2>
<ul><li>Question 1</li></ul>
`.trim(),
  },
  {
    key: "decision",
    name: "Decision",
    description: "Record important decisions and their rationale.",
    icon: "🎯",
    category: "popular",
    body: `
<h1>Decision: ___</h1>
<table>
  <tr><th>Decision date</th><td>—</td></tr>
  <tr><th>Driver</th><td>@</td></tr>
  <tr><th>Approver(s)</th><td>@</td></tr>
</table>
<h2>Context</h2>
<p>What problem are we deciding on? What are the constraints?</p>
<h2>Options considered</h2>
<table>
  <tr><th>Option</th><th>Pros</th><th>Cons</th></tr>
  <tr><td>Option A</td><td></td><td></td></tr>
  <tr><td>Option B</td><td></td><td></td></tr>
</table>
<h2>Decision</h2>
<p>The team chose <strong>Option ___</strong> because…</p>
<h2>Consequences</h2>
<ul><li>Follow-ups</li></ul>
`.trim(),
  },
  {
    key: "meeting-notes",
    name: "Meeting notes",
    description: "Capture meeting discussions and action items.",
    icon: "👥",
    category: "popular",
    body: `
<h1>Meeting notes</h1>
<table>
  <tr><th>Date</th><td>—</td></tr>
  <tr><th>Attendees</th><td>@, @</td></tr>
</table>
<h2>Agenda</h2>
<ol><li>Topic 1</li><li>Topic 2</li></ol>
<h2>Discussion</h2>
<ul><li>Note…</li></ul>
<h2>Action items</h2>
<ul>
  <li>[ ] @owner — action — due</li>
</ul>
`.trim(),
  },
  {
    key: "retrospective",
    name: "Retrospective",
    description: "Reflect on what went well and what to improve.",
    icon: "🔁",
    category: "popular",
    body: `
<h1>Retrospective</h1>
<table>
  <tr><th>Sprint</th><td>—</td></tr>
  <tr><th>Facilitator</th><td>@</td></tr>
</table>
<h2>What went well</h2>
<ul><li></li></ul>
<h2>What didn't go well</h2>
<ul><li></li></ul>
<h2>Action items</h2>
<ul><li>[ ] @owner — action</li></ul>
`.trim(),
  },
  {
    key: "sprint-planning",
    name: "Sprint planning meeting",
    description: "Organize and run your sprint planning meetings with ease.",
    icon: "🏃",
    category: "engineering",
    body: `
<h1>Sprint planning meeting</h1>
<h2>✅ Sprint planning checklist</h2>
<p>Keep track of tasks you need to complete before, during, and after your sprint planning meeting. Follow up by updating and adding QuikTrack tickets to your template.</p>
<table>
  <tr><th>Preparation</th><th>Meeting</th><th>Follow up</th></tr>
  <tr>
    <td>[ ] Organize the backlog and close the last sprint</td>
    <td>[ ] Present velocity and confirm team capacity</td>
    <td>[ ] Update QuikTrack tickets</td>
  </tr>
</table>
<h2>👥 Sprint team members</h2>
<table>
  <tr><th>Name</th><th>Role</th></tr>
  <tr><td>@</td><td>e.g., Scrum Master</td></tr>
</table>
<h2>✏️ Sprint planning meeting items</h2>
<h3>Agenda</h3>
<ul><li>Topic</li></ul>
<h3>Previous sprint summary</h3>
<p>Summary…</p>
<h3>Velocity tracking</h3>
<p>Average velocity: ___</p>
<h3>Capacity planning</h3>
<table>
  <tr><th>Engineer</th><th>Capacity (h)</th></tr>
  <tr><td>@</td><td></td></tr>
</table>
<h3>Potential risks</h3>
<ul><li></li></ul>
`.trim(),
  },
  {
    key: "software-architecture-review",
    name: "Software architecture review",
    description:
      "Collect information, loop in stakeholders, and kick off your software architecture review.",
    icon: "🏛️",
    category: "engineering",
    body: `
<h1>Software architecture review</h1>
<table>
  <tr><th>Architecture review date</th><td>—</td></tr>
  <tr><th>Project lead</th><td>@</td></tr>
</table>
<h2>📋 Overview</h2>
<p>Add an image of an architectural diagram and explain how the structural components currently work together.</p>
<h2>🚩 Architecture issues</h2>
<table>
  <tr><th>Architecture issue</th><th>Business impact</th><th>Priority</th><th>Notes</th></tr>
  <tr><td></td><td></td><td>HIGH / MEDIUM / LOW</td><td></td></tr>
</table>
<h2>👥 Stakeholders</h2>
<table>
  <tr><th>Name</th><th>Role</th></tr>
  <tr><td>@</td><td>e.g., Lead Architect</td></tr>
</table>
<h2>✏️ Software quality attributes</h2>
<table>
  <tr><th>Attribute</th><th>Definition</th><th>Key success metrics</th><th>Notes</th></tr>
  <tr><td>Availability</td><td>How often the system is up and running</td><td></td><td></td></tr>
</table>
<h2>🎯 Goals</h2>
<ul><li></li></ul>
<h2>👣 Next steps</h2>
<ul><li>[ ] Action</li></ul>
`.trim(),
  },
  {
    key: "daci",
    name: "DACI: Decision documentation",
    description:
      "Record important project decisions and communicate them with your team using the DACI framework (Driver, Approver, Contributors, Informed).",
    icon: "🤝",
    category: "popular",
    body: `
<h1>DACI: Decision documentation</h1>
<table>
  <tr><th>Driver</th><td>@</td></tr>
  <tr><th>Approver</th><td>@</td></tr>
  <tr><th>Contributors</th><td>@, @</td></tr>
  <tr><th>Informed</th><td>@</td></tr>
</table>
<h2>Background</h2>
<p>What's the context?</p>
<h2>Options</h2>
<ul><li>A</li><li>B</li></ul>
<h2>Recommendation</h2>
<p>We recommend…</p>
`.trim(),
  },
];

export function getTemplate(key: string | null | undefined): DocTemplate | null {
  if (!key) return null;
  return DOC_TEMPLATES.find((t) => t.key === key) ?? null;
}
