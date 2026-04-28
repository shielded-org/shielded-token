import {PendingPulse} from "./PendingPulse";

export type ActivityRowItem = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  amount: string;
  amountColor: string;
  timeLabel: string;
  pending?: boolean;
};

type Props = {
  item: ActivityRowItem;
  onClick: (id: string) => void;
};

export function ActivityRow({item, onClick}: Props) {
  return (
    <button type="button" className={`activity-row ${item.pending ? "pending" : ""}`} onClick={() => onClick(item.id)}>
      <div className="activity-icon">{item.icon}</div>
      <div style={{textAlign: "left"}}>
        <p>{item.title}</p>
        <p className="muted mono">{item.subtitle}</p>
        {item.pending && (
          <p className="muted">
            <PendingPulse />
            Pending
          </p>
        )}
      </div>
      <div style={{textAlign: "right"}}>
        <p className="mono" style={{color: item.amountColor}}>
          {item.amount}
        </p>
        <p className="muted">{item.timeLabel}</p>
      </div>
    </button>
  );
}
