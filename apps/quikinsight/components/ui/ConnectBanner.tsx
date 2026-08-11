interface Props {
  connected: boolean;
  connectedLabel: string;
  disconnectedText: string;
  options: string[];
  onConnect: (name: string) => void;
  onDisconnect: () => void;
  manageLabel?: string;
  onManage?: () => void;
}

/**
 * Generic "connect one of these external tools" banner. Used by the Team
 * page (PM tools), OKRs page (OKR tools), and Leads page (CRM tools).
 */
export default function ConnectBanner({
  connected,
  connectedLabel,
  disconnectedText,
  options,
  onConnect,
  onDisconnect,
  manageLabel,
  onManage,
}: Props) {
  if (connected) {
    return (
      <div className="team-banner">
        <div className="team-synced-pill">
          <span className="platform-dot on" />
          {connectedLabel}
        </div>
        <button className="btn btn-sm" onClick={onManage ?? onDisconnect} type="button">
          {manageLabel ?? "Disconnect"}
        </button>
      </div>
    );
  }
  return (
    <div className="team-banner">
      <div className="team-banner-text">{disconnectedText}</div>
      <div className="team-banner-chips">
        {options.map((name) => (
          <button key={name} className="btn btn-sm btn-primary" onClick={() => onConnect(name)} type="button">
            Connect {name}
          </button>
        ))}
      </div>
    </div>
  );
}
