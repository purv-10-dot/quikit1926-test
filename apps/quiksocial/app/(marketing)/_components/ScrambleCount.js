"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll-triggered scramble → count-up animation (odometer / slot-machine).
 *
 * Two phases when the element enters the viewport:
 *  1. Scramble (~55% of duration): random digits flicker in the same
 *     character slots every ~110 ms.
 *  2. Count-up (~45% of duration): eases from 0 to `target` with a cubic
 *     ease-out so the climb decelerates as it approaches the final value.
 *
 * Zero-padding is preserved (length of `value` string) so the layout
 * doesn't jitter during scramble. Suffix (× / % / + / X / etc.) is
 * appended unchanged.
 *
 * Fires once via IntersectionObserver.
 */
export default function ScrambleCount({
  value,           // string — numeric portion, e.g. "10", "03", "95"
  suffix = "",     // optional non-numeric trailer, e.g. "×", "%", "+", "X"
  duration = 1700, // total ms for scramble + count-up
}) {
  const ref = useRef(null);
  const startedRef = useRef(false);
  const target = parseInt(value, 10) || 0;
  const pad = String(value).length;

  // Server renders the final value; client hydrates the same.
  const [display, setDisplay] = useState(String(target).padStart(pad, "0"));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !startedRef.current) {
          startedRef.current = true;
          animate();
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();

    function animate() {
      const scrambleDur = duration * 0.55;
      const countDur    = duration * 0.45;
      const t0 = performance.now();

      // Phase 1 — scramble
      const scrambleId = setInterval(() => {
        const elapsed = performance.now() - t0;
        if (elapsed >= scrambleDur) {
          clearInterval(scrambleId);
          countUp();
          return;
        }
        const rnd = Math.floor(Math.random() * Math.pow(10, pad));
        setDisplay(String(rnd).padStart(pad, "0"));
      }, 110);

      // Initial scramble frame so there's no flash of the static value
      setDisplay(
        String(Math.floor(Math.random() * Math.pow(10, pad))).padStart(pad, "0")
      );

      // Phase 2 — cubic ease-out count-up from 0 → target
      function countUp() {
        const c0 = performance.now();
        const tick = () => {
          const elapsed = performance.now() - c0;
          const t = Math.min(1, elapsed / countDur);
          const eased = 1 - Math.pow(1 - t, 3);
          const current = Math.round(eased * target);
          setDisplay(String(current).padStart(pad, "0"));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }
  }, [duration, pad, target]);

  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  );
}
