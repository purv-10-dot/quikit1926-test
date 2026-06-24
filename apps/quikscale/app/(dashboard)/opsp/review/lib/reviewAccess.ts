/**
 * Pure access resolver for the OPSP Review screen — decides what a user can see
 * based on their OPSP permissions. Kept free of React/fetch so it's unit-tested
 * in isolation and the page/components stay thin.
 *
 * Three audiences:
 *   - "full"          → has OPSP.Review (or is admin): Review tab + (if granted)
 *                       the Critical # Review tab. Admins get all critical
 *                       scopes (Year/Quarter/Individual); non-admins only the
 *                       per-user Individual scope.
 *   - "critical-only" → has Critical Review but NOT OPSP.Review: a focused
 *                       page showing only their own Individual critical cards.
 *   - "none"          → no access (the page/route guards anyway).
 *
 * Critical scope keys mirror the API/section: "year" | "actions" | "people".
 */

export type CriticalModule = "year" | "actions" | "people";

export interface ReviewAccessInput {
  isAdmin: boolean;
  hasReview: boolean;          // OPSP.Review:view
  hasCritical: boolean;        // OPSP.Review.Critical:view
  canEditUser: boolean;        // OPSP.EditUser:update
}

export interface ReviewAccess {
  mode: "full" | "critical-only" | "none";
  showReviewTab: boolean;
  showCriticalTab: boolean;
  /** Critical # Review sub-tabs the user may see (admins: all; else Individual). */
  allowedCriticalModules: CriticalModule[];
  /** Show the user-picker in the Individual critical scope (admin + EditUser). */
  canPickUser: boolean;
}

export function resolveReviewAccess(i: ReviewAccessInput): ReviewAccess {
  const hasReview = i.isAdmin || i.hasReview;
  const hasCritical = i.isAdmin || i.hasCritical;

  if (!hasReview && !hasCritical) {
    return {
      mode: "none",
      showReviewTab: false,
      showCriticalTab: false,
      allowedCriticalModules: [],
      canPickUser: false,
    };
  }

  // Year/Quarter criticals are org-level (admin only); Individual is per-user.
  const allowedCriticalModules: CriticalModule[] = i.isAdmin
    ? ["year", "actions", "people"]
    : ["people"];

  // Critical-Review-only audience: focused Individual-own view, no Review tab.
  if (!hasReview && hasCritical) {
    return {
      mode: "critical-only",
      showReviewTab: false,
      showCriticalTab: true,
      allowedCriticalModules: ["people"],
      canPickUser: false,
    };
  }

  return {
    mode: "full",
    showReviewTab: true,
    showCriticalTab: hasCritical,
    allowedCriticalModules,
    canPickUser: i.isAdmin && i.canEditUser,
  };
}
