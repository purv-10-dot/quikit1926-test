'use client';

import { useEffect } from 'react';

/**
 * Page-wide effects that don't belong to any one section:
 *  - scroll reveal: `.reveal` elements get `.in` when they enter the viewport
 *    (CSS owns the transition and the per-element delays)
 *  - magnetic pull on buttons and the theme toggle
 *
 * Both are skipped under `prefers-reduced-motion`; the reveal falls back to
 * showing everything immediately rather than leaving the page blank, which is
 * also what happens without IntersectionObserver.
 *
 * The QuikHRMS original also draws a cursor brush-trail on a canvas — that is
 * dead code there (its own CSS force-hides `#brush` and the custom cursor), so
 * it isn't ported.
 */
export default function PageEffects() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.lp-root .reveal'));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = window.matchMedia('(pointer: fine)').matches;
    if (reduced || !fine) return;

    const magnets = Array.from(
      document.querySelectorAll<HTMLElement>('.lp-root .btn, .lp-root .theme-toggle, .lp-root .socials a'),
    );
    const handlers = magnets.map((el) => {
      const onMove = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const mx = e.clientX - (r.left + r.width / 2);
        const my = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${mx * 0.22}px,${my * 0.32}px)`;
      };
      const onOut = () => {
        el.style.transform = '';
      };
      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseleave', onOut);
      return { el, onMove, onOut };
    });

    return () => {
      handlers.forEach(({ el, onMove, onOut }) => {
        el.removeEventListener('mousemove', onMove);
        el.removeEventListener('mouseleave', onOut);
        el.style.transform = '';
      });
    };
  }, []);

  return null;
}
