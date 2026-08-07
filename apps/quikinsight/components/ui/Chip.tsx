interface Props {
  label: string;
  active: boolean;
  onClick: () => void;
}

export default function Chip({ label, active, onClick }: Props) {
  return (
    <button className={`chip${active ? " active" : ""}`} onClick={onClick} type="button">
      {label}
    </button>
  );
}
