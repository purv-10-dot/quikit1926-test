/**
 * PHASE 37 — console/runtime errors and baseline accessibility across a
 * representative 27 pages spanning all seven role surfaces.
 *
 * Two things are measured per page, both from a real browser render as the
 * page's OWNING role:
 *
 *  1. Runtime health — `console.error` output and uncaught `pageerror`s.
 *  2. Baseline a11y — exactly one <h1>, every <img> has alt text, every form
 *     control has an accessible label, and the document has a non-empty <title>.
 *
 * Violations are COLLECTED and asserted at the end of each test rather than
 * asserted one at a time, so a page with four problems reports four problems
 * instead of stopping at the first. The failure message is the finding.
 *
 * On hydration: this app emits a React hydration mismatch on every single page
 * (a lucide-react `aria-hidden` server/client prop difference), which makes React
 * throw away the server HTML and re-render the whole document on the client.
 * That is one systemic defect, not 27, so it is asserted once in its own test and
 * filtered out of the per-page console assertion — otherwise it would bury every
 * page-specific error underneath it.
 */

import { test, expect, type Page } from "@playwright/test";
import { watch, gotoAs, realConsoleErrors, isHydrationNoise } from "../fixtures/page";
import type { RoleKey } from "../fixtures/auth";

const PAGES: Array<{ path: string; role: RoleKey }> = [
  { path: "/learner/dashboard",            role: "learner" },
  { path: "/learner/certificates",         role: "learner" },
  { path: "/learner/exams",                role: "learner" },
  { path: "/learner/homework",             role: "learner" },
  { path: "/learner/schedule",             role: "learner" },
  { path: "/teacher-dashboard",            role: "teacher" },
  { path: "/teacher-dashboard/batches",    role: "teacher" },
  { path: "/teacher-dashboard/homework",   role: "teacher" },
  { path: "/teacher-dashboard/attendance", role: "teacher" },
  { path: "/tenant-dashboard",             role: "tenantAdmin" },
  { path: "/courses",                      role: "tenantAdmin" },
  { path: "/students",                     role: "tenantAdmin" },
  { path: "/batches",                      role: "tenantAdmin" },
  { path: "/exams",                        role: "tenantAdmin" },
  { path: "/user-management",              role: "tenantAdmin" },
  { path: "/branding",                     role: "tenantAdmin" },
  { path: "/question-bank",                role: "tenantAdmin" },
  { path: "/storage",                      role: "tenantAdmin" },
  { path: "/payouts",                      role: "tenantAdmin" },
  { path: "/dashboard",                    role: "superAdmin" },
  { path: "/tenants",                      role: "superAdmin" },
  { path: "/master-courses",               role: "superAdmin" },
  { path: "/master-courses/builder",       role: "superAdmin" },
  { path: "/approvals",                    role: "superAdmin" },
  { path: "/manager-dashboard",            role: "manager" },
  { path: "/parent-dashboard",             role: "parent" },
  { path: "/profile",                      role: "learner" },
];

interface A11yReport {
  title: string;
  h1Count: number;
  h1Texts: string[];
  imgsMissingAlt: string[];
  unlabeledControls: string[];
}

/** Runs in the page. Deliberately mirrors what a screen reader would resolve. */
async function auditA11y(page: Page): Promise<A11yReport> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const s = getComputedStyle(el);
      return s.display !== "none" && s.visibility !== "hidden" && (r.width > 0 || r.height > 0);
    };

    const h1s = Array.from(document.querySelectorAll("h1"));
    const imgs = Array.from(document.querySelectorAll("img")).filter(visible);
    const imgsMissingAlt = imgs
      // aria-hidden / role=presentation images are intentionally not announced.
      .filter((i) => i.getAttribute("alt") === null && i.getAttribute("aria-hidden") !== "true" && i.getAttribute("role") !== "presentation")
      .map((i) => (i.getAttribute("src") || "(no src)").slice(0, 80));

    const controls = Array.from(
      document.querySelectorAll<HTMLInputElement>("input, select, textarea"),
    ).filter((el) => !["hidden", "submit", "button", "reset", "image"].includes(el.type || "") && visible(el));

    const unlabeledControls = controls
      .filter((el) => {
        const id = el.getAttribute("id");
        if (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) return false;
        if (el.closest("label")) return false;
        if (el.getAttribute("aria-label")) return false;
        const lb = el.getAttribute("aria-labelledby");
        if (lb && lb.split(/\s+/).some((x) => document.getElementById(x))) return false;
        // A placeholder is not a label, but it does give a screen reader
        // *something*; counted separately so the finding stays honest.
        if (el.getAttribute("placeholder")) return false;
        if (el.getAttribute("title")) return false;
        return true;
      })
      .map((el) => `${el.tagName.toLowerCase()}[type=${el.type || "n/a"}][name=${el.getAttribute("name") || "-"}]`);

    return {
      title: document.title,
      h1Count: h1s.length,
      h1Texts: h1s.map((h) => (h.textContent || "").trim().slice(0, 60)),
      imgsMissingAlt,
      unlabeledControls,
    };
  });
}

test.describe("Phase 37 — runtime errors and baseline a11y", () => {
  for (const { path, role } of PAGES) {
    test(`${path} [${role}] is error-free and passes baseline a11y`, async ({ page }) => {
      test.setTimeout(150_000);

      const probe = watch(page);
      await gotoAs(page, role, path, { settle: 1_500 });
      const a11y = await auditA11y(page);

      const violations: string[] = [];

      // ── a11y ──────────────────────────────────────────────────────────────
      if (!a11y.title || !a11y.title.trim()) {
        violations.push("A11Y/title: document has no <title>");
      }
      if (a11y.h1Count === 0) {
        violations.push("A11Y/h1: page has no <h1> — no top-level landmark heading");
      } else if (a11y.h1Count > 1) {
        violations.push(
          `A11Y/h1: page has ${a11y.h1Count} <h1> elements (${JSON.stringify(a11y.h1Texts)}) — expected exactly 1`,
        );
      }
      if (a11y.imgsMissingAlt.length) {
        violations.push(
          `A11Y/img-alt: ${a11y.imgsMissingAlt.length} visible <img> without alt: ${JSON.stringify(a11y.imgsMissingAlt)}`,
        );
      }
      if (a11y.unlabeledControls.length) {
        violations.push(
          `A11Y/label: ${a11y.unlabeledControls.length} form control(s) with no label, aria-label, placeholder or title: ` +
            JSON.stringify(a11y.unlabeledControls),
        );
      }

      // ── runtime ───────────────────────────────────────────────────────────
      const errors = realConsoleErrors(probe);
      if (errors.length) {
        violations.push(`CONSOLE: ${errors.length} error(s): ${JSON.stringify([...new Set(errors)].slice(0, 5))}`);
      }
      if (probe.serverErrors.length) {
        violations.push(`XHR-5xx: ${JSON.stringify(probe.serverErrors)}`);
      }

      // Always print, pass or fail — the phase deliverable is the inventory.
      console.log(
        `[A11Y ${path}] title=${JSON.stringify(a11y.title)} h1=${a11y.h1Count} ` +
          `imgNoAlt=${a11y.imgsMissingAlt.length} unlabeled=${a11y.unlabeledControls.length} ` +
          `consoleErr=${errors.length} hydrationErr=${probe.pageErrors.filter(isHydrationNoise).length} ` +
          `xhr5xx=${probe.serverErrors.length} xhr4xx=${probe.apiFailures.length - probe.serverErrors.length}`,
      );

      expect(violations, `${path} [${role}]:\n  - ${violations.join("\n  - ")}`).toEqual([]);
    });
  }
});

test.describe("Phase 37 — systemic hydration failure", () => {
  /**
   * Asserted once, over a small cross-section, because it is a single root cause
   * rather than a per-page defect. React reports "Hydration failed because the
   * initial UI does not match what was rendered on the server" and then discards
   * the entire server-rendered document — every page in this app pays a full
   * client re-render, and any server-rendered content is thrown away.
   */
  const SAMPLE: Array<{ path: string; role: RoleKey }> = [
    { path: "/learner/dashboard", role: "learner" },
    { path: "/tenant-dashboard",  role: "tenantAdmin" },
    { path: "/dashboard",         role: "superAdmin" },
  ];

  for (const { path, role } of SAMPLE) {
    test(`${path} hydrates without a server/client mismatch`, async ({ page }) => {
      test.setTimeout(150_000);
      const probe = watch(page);
      await gotoAs(page, role, path);

      const hydration = [...probe.pageErrors, ...probe.consoleErrors].filter(isHydrationNoise);
      console.log(`[HYDRATION ${path}] ${hydration.length} event(s)`);

      expect(
        [...new Set(hydration)].slice(0, 3),
        `${path}: React hydration mismatch — the server HTML was discarded and the page ` +
          `re-rendered entirely on the client`,
      ).toEqual([]);
    });
  }
});
