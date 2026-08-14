import { FileText, Link2, BarChart3 } from "lucide-react";

export interface RelatedWorkTemplate {
  name: string;
  category: string;
  Icon: typeof FileText;
  iconClassName: string;
}

/** The fixed category set offered in the Category dropdown (edit form) —
 * matches Jira's own list, a superset of the categories the templates below
 * pre-fill. */
export const RELATED_WORK_CATEGORIES = [
  "Analytics",
  "Communication",
  "Development",
  "Rollout",
  "Support",
  "Testing",
] as const;

/** Fixed template list mirroring Jira's "Related work" picker. Purely a
 * naming/icon convenience for the freeform title field — none of these tie
 * into a real QuikTrack feature (no security-report or business-calendar
 * integration exists), so choosing one just pre-fills the title/category of
 * a placeholder row. */
export const RELATED_WORK_TEMPLATES: RelatedWorkTemplate[] = [
  { name: "Security report", category: "Testing", Icon: FileText, iconClassName: "text-blue-500" },
  { name: "Test report", category: "Testing", Icon: FileText, iconClassName: "text-blue-500" },
  { name: "Change request", category: "Rollout", Icon: Link2, iconClassName: "text-gray-500" },
  { name: "Delivery ticket", category: "Rollout", Icon: Link2, iconClassName: "text-gray-500" },
  { name: "Blog post", category: "Communication", Icon: FileText, iconClassName: "text-blue-500" },
  { name: "Support documentation", category: "Communication", Icon: FileText, iconClassName: "text-blue-500" },
  { name: "Analytics dashboard", category: "Analytics", Icon: BarChart3, iconClassName: "text-purple-500" },
  { name: "Monitoring dashboard", category: "Analytics", Icon: BarChart3, iconClassName: "text-purple-500" },
];
