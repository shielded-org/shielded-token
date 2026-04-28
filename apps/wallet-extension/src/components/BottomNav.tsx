import {ComponentType} from "react";
import {Activity, Home, KeyRound, Send, Shield} from "lucide-react";

type Tab = "home" | "shield" | "send" | "keys" | "activity";

type Props = {
  active: Tab;
  onSelect: (tab: Tab) => void;
};

const ITEMS: Array<{id: Tab; label: string; icon: ComponentType<{size?: number}>}> = [
  {id: "home", label: "Home", icon: Home},
  {id: "shield", label: "Shield", icon: Shield},
  {id: "send", label: "Send", icon: Send},
  {id: "keys", label: "Keys", icon: KeyRound},
  {id: "activity", label: "Activity", icon: Activity},
];

export function BottomNav({active, onSelect}: Props) {
  return (
    <nav className="bottom-nav">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.id} type="button" className={`bottom-item ${active === item.id ? "active" : ""}`} onClick={() => onSelect(item.id)}>
            <Icon size={16} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
