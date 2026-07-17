/**
 * Column-header hover descriptions (JPD). Keyed by column `key`. Text mirrors
 * the real-JPD field tooltips shown when you hover a column header. For custom
 * fields not listed here we fall back to the field's own helpText / name.
 */
export const COLUMN_DESCRIPTIONS: Record<string, string> = {
  summary: "A one-liner explaining what the idea is",
  theme: "Strategic theme or product focus area this idea aligns to",
  insights: "Add snippets from customer interviews, link user research to support cases, and capture sales opportunities or messages from stakeholders.",
  impact: "Rated manually, represents how each idea contributes to the theme",
  effort: "A high level estimate of the effort required to deliver this idea",
  roadmap: "When the team plans to work on the idea",
  delivery: "An estimation of delivery work items from Jira such as epics that are linked to the idea. For more details open each idea and the “Delivery” section",
  delivery_status: "The status of delivery work items from Jira that are linked to the idea. For more details open each idea and the “Delivery” section",
  atlassian_project: "The Jira project this idea is connected to",
  product_area: "The product area or category the idea belongs to",
  confidence: "Level of confidence related to the success of an idea",
  customer_segments: "Type of customers that would be interested by this idea. The segments are weighted based on their strategic importance",
  idea_short_description: "Short description that shows up in cards",
  assignee: "Which user the idea is assigned to",
  category: "Categories of ideas",
  comments: "The number of comments added to the idea",
  created: "When the idea was created",
  creator: "The user who created the idea",
  designs_ready: "Indicates whether or not the design required for the idea is ready",
  documents: "Supporting documents for this idea",
  labels: "Data used to tag or classify ideas",
  linked_items: "Number of Jira work items linked to an idea",
  project_start: "Once an idea has been selected and prioritized you can plan its delivery. This field represents when delivery work starts",
  project_target: "Once an idea has been selected and prioritized you can plan its delivery. This field represents when delivery work aims to complete.",
  reach: "The number of people impacted by the project or feature over a specific time period.",
  reporter: "If the idea was suggested by someone other than the creator, you can specify this user as the reporter",
  spec_ready: "Indicates whether or not the feature specs are ready",
  updated: "When the idea was last updated",
  value: "A user value that an idea will deliver",
  goals: "Goals this idea contributes to",
  key: "The idea's unique key",
  type: "The work item type",
};

/** The RICE score has a richer explainer than a one-liner. */
export const RICE_DESCRIPTION = {
  paragraphs: [
    "RICE scores product ideas based on 4 factors: Reach, impact, confidence, and effort.",
    "Once everything is scored, calculate the RIC / E for your score, and prioritize ideas with the highest RICE score.",
    "This scoring system can be tailored to your preferred prioritization method.",
  ],
  expression: "{Reach} * {Impact} * {Confidence} / {Effort}",
};
