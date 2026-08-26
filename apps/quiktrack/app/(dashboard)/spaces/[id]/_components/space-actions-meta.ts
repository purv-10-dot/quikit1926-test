import type { SpaceBackground } from "@/lib/spaceBackgrounds";

/**
 * Shared types + display labels for the project header's "..." (space actions)
 * menu. Static config only — kept out of the menu component so that file stays
 * under the 300-line ceiling in `apps/quiktrack/CLAUDE.md`.
 */

/** The slice of the project the "..." menu and its dialogs need. */
export interface SpaceSummary {
  id: string;
  name: string;
  projectKey: string;
  icon?: string | null;
  color?: string | null;
  templateKey?: string | null;
  projectType?: string | null;
  managementStyle?: string | null;
  background?: SpaceBackground | null;
  /** Per-user star (QtProjectStar). */
  starred?: boolean;
  /** Global admin — may move the space to trash. */
  isAdmin?: boolean;
  /** Global admin OR this space's Space Admin — may archive. */
  canArchive?: boolean;
}

/**
 * Human labels for `QtProject.projectType`. Shown in the menu's read-only
 * information footer, mirroring Jira's "Software space" line.
 */
const PROJECT_TYPE_LABELS: Record<string, string> = {
  software: "Software space",
  discovery: "Product discovery space",
  service: "Service management space",
  business: "Business space",
  marketing: "Marketing space",
};

/** Human labels for `QtProject.managementStyle`. */
const MANAGEMENT_STYLE_LABELS: Record<string, string> = {
  "team-managed": "Team-managed",
  "company-managed": "Company-managed",
};

export function projectTypeLabel(projectType?: string | null): string {
  if (!projectType) return "Space";
  return PROJECT_TYPE_LABELS[projectType] ?? `${titleCase(projectType)} space`;
}

export function managementStyleLabel(style?: string | null): string {
  if (!style) return "Team-managed";
  return MANAGEMENT_STYLE_LABELS[style] ?? titleCase(style);
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
