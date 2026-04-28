import {Lock} from "lucide-react";
import {Badge} from "./Badge";

type Props = {
  onLock: () => void;
};

export function TopHeader({onLock}: Props) {
  return (
    <header className="top-header">
      <div className="header-brand">
        <span>🛡</span>
        <strong>Shielded</strong>
      </div>
      <Badge variant="network">● Sepolia</Badge>
      <button type="button" className="icon-btn" onClick={onLock}>
        <Lock size={16} />
      </button>
    </header>
  );
}
