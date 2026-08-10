import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/services/audit";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { serverlessTransaction } from "@/lib/db/transaction-options";
import { createOpportunity } from "@/lib/services/opportunities/opportunity-service";
import { STAGE_DEFAULT_PROBABILITY } from "@/lib/services/opportunities/stage-labels";

export const runtime = "nodejs";

const STAGE = z.enum([
  "Prospecting",
  "Qualification",
  "Proposal",
  "Negotiation",
  "ClosedWon",
  "ClosedLost",
]);

const bodySchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    amount: z.number().positive().max(1e12).optional(),
    closeDate: z.string().datetime().optional(),
    stage: STAGE.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.closeDate) {
      const d = new Date(val.closeDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (d.getTime() < today.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["closeDate"],
          message: "closeDate must be today or in the future",
        });
      }
    }
  });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "opportunities", "create");

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const dto = parsed.data;

    const contact = await prisma.qcfContact.findFirst({
      // QcfContact isn't middleware-protected — a trashed contact has no live opportunities view.
      where: { id, orgId: user.orgId, deletedAt: null },
      select: { id: true, accountId: true },
    });
    if (!contact) {
      return NextResponse.json(
        { success: false, error: "Contact not found" },
        { status: 404 },
      );
    }
    if (!contact.accountId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Contact must be linked to an Account before creating an Opportunity. Link the contact to an account first.",
        },
        { status: 400 },
      );
    }
    await assertAccountAccess(user, contact.accountId);

    const accountId: string = contact.accountId;
    const stage = dto.stage ?? "Prospecting";
    const probability = STAGE_DEFAULT_PROBABILITY[stage];

    const created = await serverlessTransaction(
      prisma,
      async (tx) => {
        const opp = await createOpportunity({
          orgId: user.orgId,
          userId: user.userId,
          input: {
            name: dto.title,
            accountId,
            leadId: null,
            stage,
            probability,
            amount: dto.amount ?? null,
            closeDate: dto.closeDate ?? null,
          },
          tx,
        });

        await audit(
          {
            orgId: user.orgId,
            userId: user.userId,
            module: "opportunities",
            action: "create_from_contact",
            resourceId: opp.id,
            metadata: {
              fromContactId: contact.id,
              title: opp.name,
              amount: opp.amount != null ? Number(opp.amount) : null,
              stage: opp.stage,
            },
          },
          tx,
        );

        return opp;
      },
    );

    return NextResponse.json(
      { success: true, data: { opportunityId: created.id } },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
