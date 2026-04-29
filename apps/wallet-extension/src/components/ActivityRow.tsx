import {PendingPulse} from "./PendingPulse";

export type ActivityRowItem = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  amount: string;
  amountColor: string;
  timeLabel: string;
  status: "completed" | "pending" | "failed";
};

type Props = {
  item: ActivityRowItem;
  onClick: (id: string) => void;
};

export function ActivityRow({item, onClick}: Props) {
  const parsedTime = new Date(item.timeLabel);
  const timeText = Number.isNaN(parsedTime.getTime()) ? item.timeLabel : parsedTime.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});
  return (
    <button type="button" className={`activity-row ${item.status === "pending" ? "pending" : ""}`} onClick={() => onClick(item.id)}>
      <div className="activity-icon">{item.icon}</div>
      <div style={{textAlign: "left"}}>
        <p>{item.title}</p>
        <p className="muted mono">{item.subtitle}</p>
        {item.status === "pending" && (
          <p className="muted">
            <PendingPulse />
            Pending
          </p>
        )}
        {item.status === "failed" && <p className="muted" style={{color: "#fda4af"}}>Failed</p>}
      </div>
      <div style={{textAlign: "right"}}>
        <p className="mono" style={{color: item.amountColor}}>
          {item.amount}
        </p>
        <p className="muted">{timeText}</p>
      </div>
    </button>
  );
}
