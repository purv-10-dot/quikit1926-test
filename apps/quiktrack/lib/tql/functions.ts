/**
 * TQL function resolution — currentUser() and the date/time family.
 *
 * Only functions with a well-defined QuikTrack equivalent are implemented.
 * membersOf(), openSprints(), and the rest of Jira's catalog are handled
 * directly in the translator where a relation query is needed, or omitted
 * where no backing concept exists — see lib/tql/fields.ts.
 */
import { TqlParseError } from "./tokenizer";
import type { TqlPosition } from "./tokenizer";
import type { TqlValue } from "./parser";

export interface TqlFunctionContext {
  userId: string;
  /** Injectable for tests; defaults to `new Date()`. */
  now?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function offsetArg(args: TqlValue[]): number {
  if (args.length === 0) return 0;
  const arg = args[0]!;
  if (arg.kind !== "literal") {
    throw new TqlParseError(`Function offset must be a literal string, e.g. "-1"`, { pos: 0, line: 1, col: 1 });
  }
  const n = Number(arg.value);
  if (Number.isNaN(n)) {
    throw new TqlParseError(`Invalid offset "${arg.value}" — expected a number of days`, { pos: 0, line: 1, col: 1 });
  }
  return n;
}

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfWeekUTC(d: Date): Date {
  const s = startOfDayUTC(d);
  const dow = s.getUTCDay(); // 0 = Sunday
  s.setUTCDate(s.getUTCDate() - dow);
  return s;
}

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfYearUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

/**
 * Resolve a TQL function call to the scalar value it represents. Returns
 * `null` for functions that don't resolve to a scalar (e.g. openSprints()),
 * which the translator must special-case against a relation instead.
 */
export function resolveFunction(
  name: string,
  args: TqlValue[],
  ctx: TqlFunctionContext,
  pos: TqlPosition,
): string | Date | null {
  const now = ctx.now ?? new Date();
  const lower = name.toLowerCase();

  switch (lower) {
    case "currentuser":
      return ctx.userId;
    case "now":
      return now;
    case "startofday":
      return new Date(startOfDayUTC(now).getTime() + offsetArg(args) * DAY_MS);
    case "endofday":
      return new Date(startOfDayUTC(now).getTime() + (offsetArg(args) + 1) * DAY_MS - 1);
    case "startofweek":
      return new Date(startOfWeekUTC(now).getTime() + offsetArg(args) * 7 * DAY_MS);
    case "endofweek":
      return new Date(startOfWeekUTC(now).getTime() + (offsetArg(args) + 1) * 7 * DAY_MS - 1);
    case "startofmonth": {
      const base = startOfMonthUTC(now);
      base.setUTCMonth(base.getUTCMonth() + offsetArg(args));
      return base;
    }
    case "endofmonth": {
      const base = startOfMonthUTC(now);
      base.setUTCMonth(base.getUTCMonth() + offsetArg(args) + 1);
      return new Date(base.getTime() - 1);
    }
    case "startofyear": {
      const base = startOfYearUTC(now);
      base.setUTCFullYear(base.getUTCFullYear() + offsetArg(args));
      return base;
    }
    case "endofyear": {
      const base = startOfYearUTC(now);
      base.setUTCFullYear(base.getUTCFullYear() + offsetArg(args) + 1);
      return new Date(base.getTime() - 1);
    }
    case "opensprints":
      return null;
    default:
      throw new TqlParseError(
        `Unknown function "${name}()". Supported: currentUser(), now(), startOfDay(), endOfDay(), startOfWeek(), endOfWeek(), startOfMonth(), endOfMonth(), startOfYear(), endOfYear(), openSprints().`,
        pos,
      );
  }
}
