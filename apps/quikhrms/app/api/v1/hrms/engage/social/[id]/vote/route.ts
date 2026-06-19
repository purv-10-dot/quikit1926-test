import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";

interface PollOption { id: string; text: string; votes: string[] }
interface PollData { question: string; options: PollOption[]; allowMultiple?: boolean; closesAt?: string | null }

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const body = await req.json().catch(() => ({}));
    const optionId = typeof body.optionId === "string" ? body.optionId : null;
    if (!optionId) return validationError("optionId required");

    const post = await prisma.socialPost.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!post) return notFound("Post not found");
    if (!post.pollData) return validationError("Post has no poll");

    const poll = post.pollData as unknown as PollData;
    if (!poll.options || !Array.isArray(poll.options)) return validationError("Invalid poll");

    if (poll.closesAt && new Date(poll.closesAt).getTime() < Date.now()) {
      return validationError("Poll is closed");
    }

    const target = poll.options.find((o) => o.id === optionId);
    if (!target) return validationError("Option not found");

    const allowMultiple = !!poll.allowMultiple;
    const updated: PollData = {
      ...poll,
      options: poll.options.map((o) => {
        const votes = Array.isArray(o.votes) ? o.votes : [];
        if (o.id === optionId) {
          // toggle
          return { ...o, votes: votes.includes(userId) ? votes.filter((u) => u !== userId) : [...votes, userId] };
        }
        // single-choice: remove user vote from other options
        if (!allowMultiple && votes.includes(userId)) {
          return { ...o, votes: votes.filter((u) => u !== userId) };
        }
        return { ...o, votes };
      }),
    };

    const saved = await prisma.socialPost.update({
      where: { id: params.id },
      data: { pollData: JSON.parse(JSON.stringify(updated)) },
    });

    return successResponse({ pollData: saved.pollData });
  } catch (e) {
    console.error("POST /engage/social/:id/vote error:", e);
    return internalError();
  }
});
