import { useId } from "react";

interface QuikScaleMarkProps {
  /** Sizing / spacing utilities (e.g. "w-8 h-8 flex-shrink-0"). */
  className?: string;
  /** Accessible label; omit to render the mark as decorative. */
  title?: string;
}

/**
 * QuikScale brand mark — the official ↗ badge.
 *
 * Rebuilt from the official `Scale 180.svg` vector paths (purple rounded badge,
 * white inner square, up-right arrow) in the brand purple `#5B4181`. The source
 * asset's full-bleed raster texture and overlay layer are intentionally omitted:
 * they bloat the bundle and are imperceptible at sidebar size. Pure inline SVG,
 * so it stays crisp at any size with no extra network request.
 */
export function QuikScaleMark({ className, title }: QuikScaleMarkProps) {
  // Unique clip-path id so multiple instances on one page don't collide.
  const clipId = useId();

  return (
    <svg
      viewBox="0 0 180 180"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath={`url(#${clipId})`}>
        {/* Purple rounded badge */}
        <rect width="180" height="180" fill="#5B4181" />

        {/* Subtle inner-card highlight (adds depth to the badge) */}
        <path
          d="M46.4592 166.199H99.2217C115.159 167.942 127.237 157.172 131.284 151.569C136.991 145.862 149.619 133.172 154.475 128.067C164.062 119.974 166.148 107.574 165.992 102.386V49.9348C164.498 20.3006 140.052 13.7222 128.015 14.1372H79.7665C64.2023 13.6392 51.4916 24.6171 47.0817 30.1683C43.0351 34.215 33.1362 44.145 25.9145 51.4913C17.5721 57.4679 14.2413 70.7908 13.6188 76.7052C13.1518 83.761 12.4981 104.347 13.6188 130.246C14.7394 156.145 35.9793 165.006 46.4592 166.199Z"
          fill="white"
          fillOpacity="0.12"
          stroke="white"
          strokeOpacity="0.34"
        />

        {/* White inner square */}
        <rect
          width="112.125"
          height="110.773"
          rx="29.7087"
          transform="matrix(-1 0 0 1 161.09 19.1572)"
          fill="white"
        />

        {/* Up-right arrow ↗ */}
        <path
          d="M98.088 32.2139C96.4812 32.2139 95.0554 32.7749 93.9249 33.9053C92.7944 35.0358 92.2336 36.4616 92.2335 38.0684C92.2336 39.675 92.7947 41.1 93.9249 42.2305C95.0555 43.361 96.4811 43.9228 98.088 43.9229H126.092L91.4532 78.5615C90.3429 79.6719 89.8137 81.0876 89.8136 82.6719C89.8137 84.256 90.343 85.6709 91.4532 86.7812C92.5636 87.8916 93.9784 88.4208 95.5626 88.4209C97.147 88.4209 98.5625 87.8917 99.673 86.7812L134.312 52.1426V80.1465C134.312 81.7533 134.874 83.179 136.004 84.3096C137.134 85.4399 138.559 86.0009 140.166 86.001C141.773 86.001 143.199 85.4401 144.329 84.3096C145.46 83.179 146.021 81.7533 146.021 80.1465V38.0684C146.021 36.4616 145.46 35.0358 144.329 33.9053C143.199 32.7748 141.773 32.2139 140.166 32.2139H98.088Z"
          fill="#5B4181"
        />
      </g>

      <defs>
        <clipPath id={clipId}>
          <rect width="180" height="180" rx="28" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
