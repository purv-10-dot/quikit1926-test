/**
 * Re-exports the cn() helper from @quikit/ui so quikvc components have a
 * single import path matching the rest of the app, without needing local
 * clsx + tailwind-merge dependencies.
 *
 *   import { cn } from "@/lib/utils";
 */
export { cn } from "@quikit/ui";
