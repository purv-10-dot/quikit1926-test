/* Stat-card decorative icons used on the project Summary page. */

interface Props {
  className?: string;
}

export function CompletedIcon({ className }: Props) {
  return (
    <svg
      width="55"
      height="55"
      viewBox="0 0 55 55"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M0 27.5C0 12.3122 12.3122 0 27.5 0C42.6878 0 55 12.3122 55 27.5C55 42.6878 42.6878 55 27.5 55C12.3122 55 0 42.6878 0 27.5Z"
        fill="#ECECEC"
      />
      <path
        d="M37.6496 20.25L24.5996 34.75L17.3496 28.95"
        stroke="#7E7E7E"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function UpdatedIcon({ className }: Props) {
  return (
    <svg
      width="55"
      height="55"
      viewBox="0 0 55 55"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M0 27.5C0 12.3122 12.3122 0 27.5 0C42.6878 0 55 12.3122 55 27.5C55 42.6878 42.6878 55 27.5 55C12.3122 55 0 42.6878 0 27.5Z"
        fill="#DEEBFF"
      />
      <g transform="translate(13 13)">
        <path
          d="M13.7745 21.9448L22.7112 13.0081C21.4949 12.5019 20.0543 11.6704 18.6919 10.3079C17.3293 8.94531 16.4976 7.50449 15.9914 6.28809L7.05459 15.2249C6.35722 15.9224 6.00847 16.2711 5.7086 16.6555C5.35484 17.1091 5.05156 17.5998 4.80409 18.119C4.59431 18.5592 4.43838 19.0271 4.12648 19.9627L2.48181 24.8968C2.32833 25.3572 2.44816 25.8648 2.79136 26.2081C3.13456 26.5512 3.64221 26.6711 4.10265 26.5176L9.03669 24.8729C9.97234 24.561 10.4402 24.4051 10.8804 24.1953C11.3996 23.9479 11.8903 23.6446 12.3439 23.2908C12.7283 22.9909 13.0771 22.6422 13.7745 21.9448Z"
          fill="#0A65E4"
        />
        <path
          d="M25.1921 10.5286C27.0477 8.67296 27.0477 5.66437 25.1921 3.80873C23.3364 1.95308 20.3278 1.95308 18.4722 3.80873L17.4004 4.88057C17.4151 4.92489 17.4302 4.96982 17.4461 5.01534C17.8389 6.14772 18.5802 7.63217 19.9746 9.0266C21.369 10.421 22.8535 11.1623 23.9859 11.5552C24.0312 11.5709 24.0759 11.586 24.1201 11.6006L25.1921 10.5286Z"
          fill="#0A65E4"
        />
      </g>
    </svg>
  );
}

export function CreatedIcon({ className }: Props) {
  return (
    <svg
      width="55"
      height="55"
      viewBox="0 0 55 55"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M0 27.5C0 12.3122 12.3122 0 27.5 0C42.6878 0 55 12.3122 55 27.5C55 42.6878 42.6878 55 27.5 55C12.3122 55 0 42.6878 0 27.5Z"
        fill="#E1DBFF"
      />
      <path
        d="M33.75 26.25H28.75V21.25C28.75 20.9185 28.6183 20.6005 28.3839 20.3661C28.1495 20.1317 27.8315 20 27.5 20C27.1685 20 26.8505 20.1317 26.6161 20.3661C26.3817 20.6005 26.25 20.9185 26.25 21.25V26.25H21.25C20.9185 26.25 20.6005 26.3817 20.3661 26.6161C20.1317 26.8505 20 27.1685 20 27.5C20 27.8315 20.1317 28.1495 20.3661 28.3839C20.6005 28.6183 20.9185 28.75 21.25 28.75H26.25V33.75C26.25 34.0815 26.3817 34.3995 26.6161 34.6339C26.8505 34.8683 27.1685 35 27.5 35C27.8315 35 28.1495 34.8683 28.3839 34.6339C28.6183 34.3995 28.75 34.0815 28.75 33.75V28.75H33.75C34.0815 28.75 34.3995 28.6183 34.6339 28.3839C34.8683 28.1495 35 27.8315 35 27.5C35 27.1685 34.8683 26.8505 34.6339 26.6161C34.3995 26.3817 34.0815 26.25 33.75 26.25Z"
        fill="#5B4DA4"
      />
    </svg>
  );
}

export function DueSoonIcon({ className }: Props) {
  return (
    <svg
      width="55"
      height="55"
      viewBox="0 0 55 55"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M0 27.5C0 12.3122 12.3122 0 27.5 0C42.6878 0 55 12.3122 55 27.5C55 42.6878 42.6878 55 27.5 55C12.3122 55 0 42.6878 0 27.5Z"
        fill="#FFE2DC"
      />
      <path
        d="M35 19h-2v-1.5a1.5 1.5 0 0 0-3 0V19h-6v-1.5a1.5 1.5 0 0 0-3 0V19h-2a3 3 0 0 0-3 3v13a3 3 0 0 0 3 3h16a3 3 0 0 0 3-3V22a3 3 0 0 0-3-3Zm-16 3h16v3H19v-3Zm0 13V27h16v8H19Z"
        fill="#C75A2C"
      />
    </svg>
  );
}

export function NoActivityIllustration({ className }: Props) {
  return (
    <svg
      width="160"
      height="120"
      viewBox="0 0 160 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="40" y="35" width="38" height="28" rx="3" fill="#DEEBFF" />
      <rect x="84" y="35" width="38" height="28" rx="3" fill="#E5E7EB" />
      <rect x="62" y="65" width="38" height="28" rx="3" fill="#1E3155" />
      <path
        d="M73 76 l 6 6 12 -12"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function ReportsBannerIllustration({ className }: Props) {
  return (
    <svg
      width="170"
      height="92"
      viewBox="0 0 170 92"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Left dashboard card with bar chart */}
      <rect x="6" y="30" width="46" height="44" rx="6" fill="#FFFFFF" stroke="#DBE4F0" />
      <rect x="13" y="52" width="6" height="16" rx="1.5" fill="#FB923C" />
      <rect x="23" y="44" width="6" height="24" rx="1.5" fill="#8B5CF6" />
      <rect x="33" y="48" width="6" height="20" rx="1.5" fill="#FB923C" />
      <rect x="13" y="36" width="20" height="3" rx="1.5" fill="#E2E8F0" />

      {/* Plus separator */}
      <path
        d="M64 52 h10 M69 47 v10"
        stroke="#94A3B8"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Right dashboard card with bar chart */}
      <rect x="86" y="34" width="46" height="44" rx="6" fill="#FFFFFF" stroke="#DBE4F0" />
      <rect x="93" y="56" width="6" height="16" rx="1.5" fill="#22C55E" />
      <rect x="103" y="48" width="6" height="24" rx="1.5" fill="#8B5CF6" />
      <rect x="113" y="52" width="6" height="20" rx="1.5" fill="#FB923C" />
      <rect x="93" y="40" width="20" height="3" rx="1.5" fill="#E2E8F0" />

      {/* Curved arrow pointing toward the pie */}
      <path
        d="M70 30 C 90 16, 108 16, 124 26"
        stroke="#1E3155"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M124 26 l -6 -1 M124 26 l -2 -6"
        stroke="#1E3155"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Pie chart (tilted card) top-right */}
      <g transform="rotate(8 140 24)">
        <rect x="120" y="4" width="40" height="40" rx="8" fill="#FFFFFF" stroke="#DBE4F0" />
        {/* pie segments centered at (140,24) r=12 */}
        <path d="M140 24 L140 12 A12 12 0 0 1 152 24 Z" fill="#2563EB" />
        <path d="M140 24 L152 24 A12 12 0 0 1 140 36 Z" fill="#22C55E" />
        <path d="M140 24 L140 36 A12 12 0 0 1 128 24 Z" fill="#FBBF24" />
        <path d="M140 24 L128 24 A12 12 0 0 1 140 12 Z" fill="#BFDBFE" />
      </g>

      {/* Sparkles */}
      <path d="M150 56 l2 0 M151 55 l0 2" stroke="#1E3155" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M160 64 l3 0 M161.5 62.5 l0 3" stroke="#1E3155" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M154 72 l2 0 M155 71 l0 2" stroke="#1E3155" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function EpicProgressIllustration({ className }: Props) {
  return (
    <svg
      width="120"
      height="100"
      viewBox="0 0 120 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="20" y="15" width="34" height="34" rx="3" fill="#E5E7EB" />
      <rect x="64" y="15" width="34" height="34" rx="3" fill="#E5E7EB" />
      <rect x="20" y="59" width="34" height="34" rx="3" fill="#E5E7EB" />
      <rect x="64" y="59" width="34" height="34" rx="3" fill="#2563EB" />
      <path
        d="M73 73 l 6 6 12 -12"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
