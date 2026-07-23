import { z } from "zod";
import {
  ACTIVITY_KINDS,
  STANDALONE_KIND,
  STANDALONE_RELATED_ID,
} from "@/lib/services/activities/target-existence";

const emailAddr = z.string().trim().toLowerCase().email();

const attachmentSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(150),
  /** base64-encoded file bytes. ~7MB base64 ≈ 5MB raw — provider limit guard. */
  contentBase64: z.string().min(1).max(10_000_000),
});

export const sendEmailSchema = z
  .object({
    // Accepts the 4 record kinds PLUS "None" (standalone) — a standalone email
    // (e.g. from Log Activity with Link-to-Record = None) still sends through the
    // one engine and is stored, it just isn't attached to a CRM record.
    relatedKind: z.enum(ACTIVITY_KINDS),
    // Optional for standalone; required for a linked kind (refinement below).
    relatedObjectId: z.string().trim().min(1).optional(),
    to: z.array(emailAddr).min(1).max(50),
    cc: z.array(emailAddr).max(50).optional().default([]),
    bcc: z.array(emailAddr).max(50).optional().default([]),
    subject: z.string().trim().min(1).max(500),
    bodyHtml: z.string().max(500_000),
    /** CrmEmailMessage.id being replied to (for correct threading). */
    inReplyToMessageId: z.string().trim().min(1).optional(),
    attachments: z.array(attachmentSchema).max(10).optional().default([]),
  })
  // A linked kind must carry a record id; standalone gets the sentinel.
  .refine((v) => v.relatedKind === STANDALONE_KIND || !!v.relatedObjectId, {
    message: "relatedObjectId is required for a linked record.",
    path: ["relatedObjectId"],
  })
  .transform((v) => ({
    ...v,
    relatedObjectId:
      v.relatedKind === STANDALONE_KIND
        ? STANDALONE_RELATED_ID
        : (v.relatedObjectId as string),
  }));

export type SendEmailInput = z.infer<typeof sendEmailSchema>;
