/* Template-card illustrations for the "Select a template" modal.
 * Stacked colour rectangles + white card with grid lines, matching Jira's
 * template-picker visual language. Each variant just changes the palette. */

interface Props {
  className?: string;
}

function CardSvg({
  back,
  front,
  className,
}: Props & { back: string; front: string }) {
  return (
    <svg
      width="200"
      height="200"
      viewBox="0 0 267 290"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="51.7"
        width="121"
        height="178.237"
        transform="rotate(12.21 51.7 0)"
        fill={back}
      />
      <rect x="132" y="39" width="121" height="151" fill={front} fillOpacity="0.5" />
      <rect x="55" y="45" width="164" height="129" fill="#ffffff" />
      <rect x="64" y="62" width="46" height="15" fill="#ECECEC" />
      <rect x="177" y="62" width="17" height="7" fill="#ECECEC" />
      <rect x="158" y="62" width="17" height="7" fill="#ECECEC" />
      <rect x="196" y="62" width="17" height="7" fill="#ECECEC" />
      <rect x="64" y="86" width="46" height="76" fill="#ECECEC" />
      <rect x="115" y="86" width="46" height="76" fill="#ECECEC" />
      <rect x="166" y="86" width="46" height="76" fill="#ECECEC" />
    </svg>
  );
}

export function KanbanIllustration(props: Props) {
  return <CardSvg {...props} back="#FCA700" front="#671294" />;
}

export function WebDesignIllustration(props: Props) {
  return <CardSvg {...props} back="#7BC470" front="#FFC93D" />;
}

export function ScrumIllustration(props: Props) {
  return <CardSvg {...props} back="#9333EA" front="#EC4899" />;
}
