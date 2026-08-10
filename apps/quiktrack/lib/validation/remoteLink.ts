import { z } from "zod";

export const addRemoteLinkSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1).max(255),
  type: z.string().min(1).max(50),
});
