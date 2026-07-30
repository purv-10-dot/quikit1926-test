/**
 * QuikSkill-local UI primitives.
 *
 * CLAUDE.md says "UI components: Import from `@quikit/ui` — NEVER create local
 * copies", and QuikLMS now DOES depend on `@quikit/ui` (see package.json) and
 * uses it for `globalSignOut`. These six stay local anyway, deliberately, for a
 * reason that is worth recording rather than rediscovering:
 *
 *   THE TWO PACKAGES SPEAK DIFFERENT DESIGN-TOKEN LANGUAGES.
 *
 * `@quikit/ui`'s primitives are written against the platform token set —
 * `--color-secondary`, `--color-neutral-100`, `--color-border`,
 * `--color-text-primary`, `--color-danger`. QuikLMS's `app/globals.css` defines
 * NONE of those and does not import `@quikit/ui/styles`; it has its own set
 * (`--brand-primary`, `--surface`, `--fg`, `--line`, …). Dropping the shared
 * components in would render them with unset colours across ~20 files.
 *
 * More importantly, `--brand-primary` / `--brand-secondary` are the PER-TENANT
 * white-label colours, set server-side from `LmsTenant.primaryColor` /
 * `secondaryColor` and surfaced in the tenant Branding screen. The local
 * `Button` reads them; the shared one reads the platform accent. Swapping would
 * silently disable white-labelling — a shipped product feature — for every
 * tenant.
 *
 * Making these shared is therefore not an import change: it needs QuikLMS's
 * tokens reconciled with the platform's (or the shared primitives taught to
 * read a brand variable). Until then, keeping them local is the correct call,
 * and `ProgressRing` has no shared equivalent at all.
 */
export { Button, type ButtonProps } from './Button';
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './Card';
export { Input, type InputProps } from './Input';
export { Badge, type BadgeProps } from './Badge';
export { Skeleton } from './Skeleton';
export { ProgressRing, type ProgressRingProps } from './ProgressRing';
