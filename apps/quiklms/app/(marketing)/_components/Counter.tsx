'use client';

import { useEffect, useRef } from 'react';

interface CounterProps {
  /** Number to count up to. Ignored when `text` is set. */
  value?: number;
  /** Appended after the number, e.g. "%" or "+". */
  suffix?: string;
  /** Fixed text shown instead of a count (e.g. "1.2 & 2004"). */
  text?: string;
  className?: string;
  as?: 'div' | 'b' | 'span';
}

/**
 * Count-up that starts when the element scrolls into view. Falls straight to
 * the final value under `prefers-reduced-motion` or without IntersectionObserver,
 * so the number is never left showing the placeholder 0.
 */
export function Counter({ value = 0, suffix = '', text, className, as: Tag = 'div' }: CounterProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function animate() {
      if (text) {
        el!.textContent = text;
        return;
      }
      const dur = 1400;
      let start: number | null = null;
      function step(ts: number) {
        if (start === null) start = ts;
        const p = Math.min((ts - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el!.textContent = Math.round(value * eased).toLocaleString('en-IN') + suffix;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      if (text) el.textContent = text;
      else el.textContent = value.toLocaleString('en-IN') + suffix;
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            animate();
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, suffix, text]);

  return (
    <Tag ref={ref as React.RefObject<never>} className={className}>
      {text ?? '0'}
    </Tag>
  );
}
