import { NextResponse } from "next/server";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { forbidden, userCanInProject } from "@/lib/api/permissions";
import { getSpaceBackground, setSpaceBackground } from "@/lib/services/spaceBackground";
import {
  MAX_BACKGROUND_IMAGE_BYTES,
  isValidBackground,
  type SpaceBackground,
} from "@/lib/spaceBackgrounds";

/**
 * GET /api/projects/:id/background — the space's current background.
 * Readable by any project member; everyone in the space sees the same chrome.
 */
export const GET = withProjectAccess<{ id: string }>(
  async ({ orgId, projectId }) => {
    try {
      const background = await getSpaceBackground(orgId, projectId);
      return NextResponse.json({ success: true, data: { background } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load background";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { paramKey: "id" },
);

/**
 * PUT /api/projects/:id/background — set (or clear, with `{ background: null }`)
 * the space background. Gated on Project:update, like every other piece of space
 * configuration.
 *
 * The payload is validated against the preset registry rather than trusted:
 * `background` ends up interpolated into a style attribute for every viewer of
 * the space, so presets are stored as KEYS and a custom image must be an https
 * or data URL with no characters that could break out of the CSS `url()` token.
 */
export const PUT = withProjectAccess<{ id: string }>(
  async ({ orgId, userId, projectId, isTenantAdmin }, req) => {
    try {
      if (
        !isTenantAdmin &&
        !(await userCanInProject(userId, orgId, projectId, "Project", "update"))
      ) {
        return forbidden("You don't have permission to change this space's background.");
      }

      const body = (await req.json()) as { background?: unknown };
      const raw = body?.background ?? null;

      let background: SpaceBackground | null = null;
      if (raw !== null) {
        if (!isValidBackground(raw)) {
          return NextResponse.json(
            {
              success: false,
              error:
                "background must be null, a known color/gradient preset, or an https/data image URL.",
            },
            { status: 400 },
          );
        }
        // Data URLs are stored inline in a jsonb column — cap them so one space
        // can't bloat every read of the project row.
        if (raw.type === "image" && raw.value.length > MAX_BACKGROUND_IMAGE_BYTES) {
          return NextResponse.json(
            { success: false, error: "That image is too large. Choose one under 1.5 MB." },
            { status: 400 },
          );
        }
        background = raw;
      }

      const ok = await setSpaceBackground(orgId, userId, projectId, background);
      if (!ok) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: { background } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to save background";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { paramKey: "id" },
);
