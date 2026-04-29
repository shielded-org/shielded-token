import {ChevronDown, Menu} from "lucide-react";
import {Badge} from "./Badge";

type Props = {
  onOpenMenu: () => void;
  onToggleAccounts: () => void;
  activeAccountName: string;
  accountsOpen: boolean;
};

export function TopHeader({onOpenMenu, onToggleAccounts, activeAccountName, accountsOpen}: Props) {
  return (
    <header className="top-header">
      <button type="button" className="account-pill" onClick={onToggleAccounts} aria-label="Open account switcher">
        <strong>{activeAccountName}</strong>
        <ChevronDown size={14} className={accountsOpen ? "chevron-open" : ""} />
      </button>
      <Badge variant="network">● Sepolia</Badge>
      <button type="button" className="icon-btn" onClick={onOpenMenu} aria-label="Open menu">
        <Menu size={16} />
      </button>
    </header>
  );
}
