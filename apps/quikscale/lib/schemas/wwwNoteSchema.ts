import { z } from "zod";

/** Add/edit a single WWW note (thread entry). No length cap — the column is
 *  `text`; only emptiness/whitespace is rejected. */
export const wwwNoteSchema = z.object({
  content: z.string().trim().min(1, "Note content is required"),
});

export type WWWNoteInput = z.infer<typeof wwwNoteSchema>;
