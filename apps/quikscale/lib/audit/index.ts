/**
 * Audit system barrel. Import surface for capture points and read APIs:
 *
 *   import { audit, requestContext, classifyUpdateAction } from "@/lib/audit";
 */
export { audit, requestContext } from "./audit";
export type { AuditActor, AuditLogParams, AuditSource } from "./audit";
export { diffFields, valuesEqual, stableStringify } from "./diff";
export type { FieldChange, DiffOptions } from "./diff";
export {
  classifyUpdateAction,
  actionBucket,
  OWNERSHIP_FIELDS,
  ASSIGNMENT_FIELDS,
  STATUS_FIELDS,
} from "./actions";
export type { AuditAction, AuditFilterBucket } from "./actions";
export {
  KPI_AUDIT_EXCLUDE,
  KPI_AUDIT_FIELDS,
  KPI_FIELD_LABELS,
  kpiFieldLabel,
} from "./kpiFields";
export {
  PRIORITY_AUDIT_EXCLUDE,
  PRIORITY_AUDIT_FIELDS,
  PRIORITY_FIELD_LABELS,
  priorityFieldLabel,
} from "./priorityFields";
export {
  WWW_AUDIT_EXCLUDE,
  WWW_AUDIT_FIELDS,
  WWW_FIELD_LABELS,
  wwwFieldLabel,
} from "./wwwFields";
export {
  CLIENT_AUDIT_EXCLUDE,
  CLIENT_AUDIT_FIELDS,
  CLIENT_FIELD_LABELS,
  clientFieldLabel,
} from "./clientFields";
export {
  CLIENT_MEMBER_AUDIT_EXCLUDE,
  CLIENT_MEMBER_AUDIT_FIELDS,
  CLIENT_MEMBER_FIELD_LABELS,
  clientMemberFieldLabel,
} from "./clientMemberFields";
export {
  DAILY_HUDDLE_AUDIT_EXCLUDE,
  DAILY_HUDDLE_AUDIT_FIELDS,
  DAILY_HUDDLE_FIELD_LABELS,
  dailyHuddleFieldLabel,
  dailyHuddleValueLabel,
} from "./dailyHuddleFields";
export {
  WEEKLY_MEETING_AUDIT_EXCLUDE,
  WEEKLY_MEETING_AUDIT_FIELDS,
  WEEKLY_MEETING_FIELD_LABELS,
  WEEKLY_SCORE_LABELS,
  weeklyMeetingFieldLabel,
  weeklyMeetingValueLabel,
} from "./weeklyMeetingFields";
