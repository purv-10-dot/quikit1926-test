import { useEffect, type RefObject } from "react";

/**
 * Calls `onClose` when a mousedown event occurs outside the referenced element.
 *
 * Replaces the 6-line useEffect + addEventListener pattern duplicated across
 * PriorityTable StatusPicker, WWWTable StatusPicker, WWWTable RevisedDatePicker,
 * and PriorityModal TeamSelect.
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useClickOutside(ref, onClose);
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onClose]);
}
