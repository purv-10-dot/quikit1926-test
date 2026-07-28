"use client";

import { useEffect } from "react";

/**
 * Paints a subtle full-screen background image on the dashboard's scroll
 * container (<main>) while this page is mounted, then cleanly restores it on
 * unmount. Using the scroll container (not the page div) means the image:
 *   - covers the full width & height (sits behind the scrollbar, no white strip),
 *   - stays fixed while the page scrolls (no re-scaling seams / lines),
 *   - is scoped to only the pages that render <PageBackground />.
 */
export function PageBackground({ src }: { src: string }) {
  useEffect(() => {
    const el = document.querySelector("main");
    if (!el) return;
    const main = el as HTMLElement;
    const prev = main.style.cssText;
    Object.assign(main.style, {
      backgroundImage: `url('${src}')`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundAttachment: "fixed",
    });
    // Flags the sticky top nav to go frosted (see globals.css) so the
    // background flows behind it — scoped to pages that mount this component.
    main.dataset.pageBg = "true";
    return () => {
      main.style.cssText = prev;
      delete main.dataset.pageBg;
    };
  }, [src]);

  return null;
}
