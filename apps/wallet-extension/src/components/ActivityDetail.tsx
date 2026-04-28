import {StatusBadge} from "./StatusBadge";
import {Card} from "./Card";
import {Button} from "./Button";

type Props = {
  title: string;
  icon: string;
  status: "completed" | "pending" | "failed";
  amount: string;
  subtitle: string;
  txHash?: string;
  onBack: () => void;
};

export function ActivityDetail({title, icon, status, amount, subtitle, txHash, onBack}: Props) {
  return (
    <div className="stack">
      <div className="row">
        <h2 className="screen-title">Transaction Detail</h2>
        <Button variant="ghost" fullWidth={false} onClick={onBack}>
          Back
        </Button>
      </div>
      <Card>
        <p style={{fontSize: 40, textAlign: "center"}}>{icon}</p>
        <p className="screen-title" style={{textAlign: "center"}}>
          {title}
        </p>
        <p style={{textAlign: "center"}}>
          <StatusBadge status={status} />
        </p>
      </Card>
      <p className="hero mono">{amount}</p>
      <Card>
        <p className="mono">{subtitle}</p>
        <p className="mono" style={{wordBreak: "break-all", marginTop: 8}}>
          {txHash || "N/A"}
        </p>
      </Card>
    </div>
  );
}
