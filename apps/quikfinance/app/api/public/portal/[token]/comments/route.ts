import { z } from "zod";
import { db } from "@/lib/db";
import { getPortalLinkByToken } from "@/lib/portals";
import { fail, ok } from "@/lib/api/responses";

const commentSchema = z.object({
  body: z.string().trim().min(2).max(4000)
});

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const portal = await getPortalLinkByToken(params.token);
  if (!portal) {
    return fail(404, { code: "PORTAL_NOT_FOUND", message: "Portal link is invalid or expired." });
  }

  const admin = db;
  const { data, error } = await admin
    .from("portal_comments")
    .select("id, author_name, author_email, body, created_at")
    .eq("org_id", portal.org_id)
    .eq("portal_link_id", portal.id)
    .order("created_at", { ascending: false });

  if (error) {
    return fail(400, { code: "COMMENTS_LIST_FAILED", message: error.message });
  }

  return ok(data ?? []);
}

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const portal = await getPortalLinkByToken(params.token);
  if (!portal) {
    return fail(404, { code: "PORTAL_NOT_FOUND", message: "Portal link is invalid or expired." });
  }

  const parsed = commentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The comment is invalid.", details: parsed.error.flatten() });
  }

  const admin = db;
  const { data, error } = await admin
    .from("portal_comments")
    .insert({
      org_id: portal.org_id,
      portal_link_id: portal.id,
      author_name: portal.display_name ?? portal.email ?? "Portal user",
      author_email: portal.email ?? null,
      body: parsed.data.body
    })
    .select("id, author_name, author_email, body, created_at")
    .single();

  if (error) {
    return fail(400, { code: "COMMENT_CREATE_FAILED", message: error.message });
  }

  return ok(data, undefined, { status: 201 });
}
