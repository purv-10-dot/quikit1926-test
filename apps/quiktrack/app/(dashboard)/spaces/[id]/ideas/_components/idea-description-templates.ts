/**
 * Description templates for the idea drawer (JPD "start from a template" flow).
 *
 * Each template is a blueprint the user can insert into the idea's description
 * rich-text editor. `body` is HTML consumed by RichTextEditor / sanitizeRichText
 * — keep it to the tags the sanitizer allows (h/p/ul/li/strong/em/blockquote).
 * Placeholder guidance is rendered as muted italic text (<em>) so users know
 * what to fill in, mirroring the real-JPD blueprints.
 */

export interface DescriptionTemplate {
  key: string;
  /** Emoji shown as the template's icon in the library + preview. */
  emoji: string;
  name: string;
  /** One-line summary shown under the name in the library list. */
  blurb: string;
  /** Rich-text HTML inserted into the description editor. */
  body: string;
}

const P = (t: string) => `<p>${t}</p>`;
const HINT = (t: string) => `<p><em>${t}</em></p>`;
const H = (t: string) => `<h2>${t}</h2>`;

export const DESCRIPTION_TEMPLATES: DescriptionTemplate[] = [
  {
    key: "opportunity-statement",
    emoji: "🚀",
    name: "Opportunity Statement",
    blurb: "Transform customer problems into opportunities to improve people's experiences.",
    body: [
      `<blockquote>Transform problems into opportunities to improve people's experiences</blockquote>`,
      H("Problem context"),
      HINT("Describe the background or current situation that reveals the problem or unmet need."),
      HINT("Example: Users are unable to provide feedback quickly and easily, leading to dissatisfaction and reduced engagement"),
      H("Impact"),
      HINT("Describe how the problem affects the customer experience. Highlight how it impacts the business objectives."),
      HINT("Example: This issue results in fewer feedback submissions, making it difficult to gather user insights for improvement. This results in slower iterations, affecting overall customer retention"),
      H("Desired outcome"),
      HINT("Define what success looks like if this problem is solved, using measurable metrics where possible."),
      HINT("Example: A streamlined feedback submission process would increase the feedback submission rate by 30% and lead to faster product iterations"),
      `<p><strong>Resources (add your own):</strong></p>`,
      `<ul><li>📝 PRD/spec</li><li>🎥 Loom Video</li><li>🎨 Design file</li></ul>`,
    ].join(""),
  },
  {
    key: "experiment",
    emoji: "🧪",
    name: "Experiment",
    blurb: "This blueprint helps you capture and prioritise growth experiment ideas.",
    body: [
      `<blockquote>This blueprint helps you capture and prioritise growth experiment ideas</blockquote>`,
      H("Problem"),
      HINT("What problem are we solving? Why are we solving this problem?"),
      H("Hypothesis"),
      HINT("If… then… because…"),
      H("Success criteria"),
      HINT("How will we know if this experiment succeeded? What metric will move?"),
      H("Experiment design"),
      HINT("Describe the setup: audience, variants, duration, and how you'll measure the result."),
    ].join(""),
  },
  {
    key: "idea-evaluation",
    emoji: "🧐",
    name: "Idea Evaluation",
    blurb: "Use this to evaluate ideas, assess MVP features, and ensure the product meets customer needs.",
    body: [
      `<blockquote>Use this to evaluate ideas, assess MVP features, and ensure the product meets customer needs</blockquote>`,
      H("Problem"),
      HINT("What is the problem? Why is this a problem worth solving?"),
      H("Solution"),
      HINT("Summarize the solution in one or two sentences"),
      H("Desirability"),
      HINT("Do customers want this? What evidence do we have?"),
      H("Viability"),
      HINT("Does this make sense for the business?"),
      H("Feasibility"),
      HINT("Can we build this with the resources we have?"),
    ].join(""),
  },
  {
    key: "hypothesis-testing",
    emoji: "📊",
    name: "Hypothesis testing",
    blurb: "Define product hypothesis, validate them and capture key decisions.",
    body: [
      `<blockquote>Use this template to quantify the value delivered by new solutions while bringing focus to the most valuable changes, and delivering incremental iterations.</blockquote>`,
      H("Hypothesis"),
      `<p><strong>We believe that</strong> [describe the change we are making]</p>`,
      `<p><strong>For</strong> [user group] <strong>in</strong> [product/feature/conditions where the change is happening]</p>`,
      `<p><strong>Will result in</strong> [outcome you expect]</p>`,
      `<p><strong>We'll know we're right when</strong> [signal/metric we expect to move]</p>`,
      H("Decisions"),
      HINT("Capture the key decisions made while validating this hypothesis."),
    ].join(""),
  },
  {
    key: "problem-definition",
    emoji: "☁️",
    name: "Problem definition",
    blurb: "Define what problem you're solving and for whom.",
    body: [
      `<blockquote>Use this template to understand what problem you're solving, as well as why it matters to the business and to customers, and to share information with project sponsors and others who can help guide your thinking.</blockquote>`,
      H("Strategic alignment"),
      HINT("How does this fit into the broader strategy?"),
      H("Problem statement"),
      HINT("What problem are you trying to solve, and for whom?"),
      H("Evidence"),
      HINT("What data or research supports that this is a real problem?"),
      H("Success metrics"),
      HINT("How will you measure that the problem is solved?"),
    ].join(""),
  },
  {
    key: "solution-definition",
    emoji: "📓",
    name: "Solution definition",
    blurb: "Define potential solutions and how to validate them.",
    body: [
      `<blockquote>After you've used the problem definition template to clearly define the problem you're going after, use this template to define potential solutions and validate them.</blockquote>`,
      H("Problem definition"),
      HINT("Recap what's the problem you're trying to solve."),
      H("Proposed solution"),
      HINT("Describe the solution you're proposing."),
      H("Alternatives considered"),
      HINT("What other solutions did you consider, and why did you rule them out?"),
      H("Validation plan"),
      HINT("How will you validate this solution before committing to it?"),
    ].join(""),
  },
  {
    key: "solution-retrospective",
    emoji: "❓",
    name: "Solution retrospective",
    blurb: "Review the outcomes of a particular solution exploration.",
    body: [
      `<blockquote>Shipping is just the beginning: use this template to review the outcomes of a particular solution exploration. Remember: the first version of anything is generally bad, and it will take many iterations to get it right!</blockquote>`,
      H("Problem definition"),
      HINT("Recap the problem you're trying to solve."),
      H("What we shipped"),
      HINT("Describe what was delivered."),
      H("Results"),
      HINT("What happened? Did the metrics move the way we expected?"),
      H("Learnings"),
      HINT("What did we learn? What would we do differently next time?"),
      H("Next steps"),
      HINT("What are the follow-up actions or iterations?"),
    ].join(""),
  },
];
