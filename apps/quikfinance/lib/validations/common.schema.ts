import { z } from "zod";
import { optionalStateCodeSchema } from "@/lib/india";

export const idSchema = z.string().uuid();

export const moneySchema = z.coerce.number().finite().min(0).max(999_999_999_999.99);

export const addressSchema = z
  .object({
    line1: z.string().max(120).optional(),
    line2: z.string().max(120).optional(),
    city: z.string().max(80).optional(),
    state: z.string().max(80).optional(),
    state_code: optionalStateCodeSchema,
    zip: z.string().max(24).optional(),
    country: z.string().max(80).optional()
  })
  .partial()
  .default({});

export const currencyCodeSchema = z.string().trim().length(3).transform((value) => value.toUpperCase());

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().positive().max(100).default(25)
});
