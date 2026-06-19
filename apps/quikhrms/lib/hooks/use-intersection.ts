"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Triggers once when element enters viewport.
 * Use to defer API calls for below-the-fold content.
 */
export function useIntersection(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || isVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px", ...options },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isVisible, options]);

  return { ref, isVisible };
}
