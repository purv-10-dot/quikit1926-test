import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles, orgScope } from '@/lib/auth/context';
import { updateUser } from '@/lib/services/users-service';
import { applyTeacherPrivacy } from '@/lib/privacy';

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003).
 *
 * The field list is exactly `updateUser`'s own allow-list (`users-service.ts`)
 * — `allowed[]`, plus `role`, `availableSlots`, `email`, `parentIds` and
 * `childrenIds`, each of which the service handles in its own branch. Anything
 * the service does not read is stripped here rather than rejected, so no
 * existing caller's extra keys can start failing.
 *
 * Every field is optional: this is a PATCH, and the six admin screens that call
 * it (`students`, `teachers`, `parents`, `sub-admins`, `user-management`) each
 * send a different subset. `managerId` is explicitly `.nullish()` because
 * `user-management/page.tsx` sends `managerId: null` to CLEAR the assignment —
 * `.optional()` alone would have turned that working call into a 400.
 *
 * `role` and `email` stay loosely typed on purpose: `updateUser` validates both
 * itself (enum membership, then an address regex) and throws its own 400 with a
 * specific message. Re-declaring them here would replace those messages with a
 * generic zod one for no gain.
 */
const updateUserSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  role: z.string().optional(),
  phone: z.string().nullish(),
  grade: z.string().nullish(),
  section: z.string().nullish(),
  studentId: z.string().nullish(),
  employeeId: z.string().nullish(),
  subjects: z.array(z.string()).optional(),
  ratePerClass: z.number().nullish(),
  ratePerHour: z.number().nullish(),
  rateType: z.enum(['per_class', 'per_hour', 'monthly', 'hybrid']).nullish(),
  qualification: z.enum(['PGT', 'TGT', 'PRT', 'NTT', 'Other']).nullish(),
  monthlyPayout: z.number().nullish(),
  guardianContact: z.string().nullish(),
  guardianRelation: z.string().nullish(),
  maxSlotsPerWeek: z.number().int().nullish(),
  tutoringEnabled: z.boolean().optional(),
  tutoringCreditCost: z.number().nullish(),
  dateOfBirth: z.string().optional(),
  // Nullable — cleared by sending an explicit null (see note above).
  managerId: z.string().nullish(),
  // Replaced wholesale by the service; it coerces each field itself.
  availableSlots: z.array(z.record(z.unknown())).optional(),
  parentIds: z.array(z.string()).optional(),
  childrenIds: z.array(z.string()).optional(),
});

// PATCH /api/users/:id — ADMIN | TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const data = await parseBody(req, updateUserSchema);
  const orgId = orgScope(actor);
  const result = await updateUser(params!.id, orgId, data as Record<string, unknown>);
  return json({
    success: true,
    data: await applyTeacherPrivacy(actor, req, result.user),
    emailWelcomeSent: result.emailWelcomeSent,
    message: 'User updated successfully',
  });
});
