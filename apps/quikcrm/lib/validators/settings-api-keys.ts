import { z } from "zod";

/**
 * Zod schemas for Settings → API Keys.
 *
 * Only a friendly `name` is client-supplied — the secret itself is generated
 * server-side (never accepted from the client). Mirrors the shape of the other
 * settings validators (see settings-teams.ts).
 */
export const createApiKeySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
});

/** PATCH body for a single key: activate or revoke. */
export const updateApiKeySchema = z.object({
  action: z.enum(["revoke", "activate"]),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;
