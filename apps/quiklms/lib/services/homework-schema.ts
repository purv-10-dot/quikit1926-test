/**
 * Field schemas shared by the four homework routes.
 *
 * WHY THIS IS A MODULE AND NOT COPIED PER ROUTE. `POST /api/homework`,
 * `PATCH /api/homework/:id` and `PATCH /api/homework/submissions/:id/grade` each
 * declared their own score bound, and they disagreed: create and update capped
 * `maxScore` at 100 while the teacher form's Total Points input carries `min={1}`
 * and no max at all, so a 150-point assignment was rejected as "Validation
 * failed" with no field named. Grading then capped `score` at 100 independently,
 * which would have made a >100-point assignment ungradable even once it could be
 * created. One declaration per concept is what keeps those three in step.
 *
 * Deliberately NOT in `lib/validation.ts`: `resourceLink` is a homework shape, and
 * that module is the app-wide field vocabulary (`emailField`, `dateField`).
 */
import { z } from 'zod';

/**
 * An attachment or learning-resource link stored on a homework record.
 *
 * `url` must be non-empty — `z.string()` admitted `''`, which renders in the
 * student's "Resource Links" list as a dead anchor pointing at the current page.
 */
export const resourceLink = z.object({
  url: z.string().min(1, 'url is required'),
  label: z.string().optional(),
});

/**
 * Points an assignment is out of.
 *
 * `Int?` in Postgres (`schema.prisma` → `LmsHomework.maxScore`), so it must be a
 * whole number, and the upper bound is there to keep a typo out of a 32-bit
 * column rather than to express a grading policy. The old `.max(100)` WAS a
 * policy, and an unintended one: 100 is a common default, not a ceiling, and
 * nothing in the UI communicated it.
 */
export const maxScoreField = z.number().int().min(1).max(1_000_000);

/**
 * A score awarded to a submission.
 *
 * Bounded below only. The real ceiling is the homework's own `maxScore`, which
 * this layer cannot see — `gradeSubmission` enforces it against the loaded
 * homework row, so the check is made where the number to compare against exists.
 */
export const scoreField = z.number().min(0);
