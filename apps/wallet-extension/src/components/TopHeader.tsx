import {useEffect, useRef, useState} from "react";
import {Check, ChevronDown, Menu} from "lucide-react";
import {CHAIN_ID_ARBITRUM_SEPOLIA, CHAIN_ID_BASE_SEPOLIA, CHAIN_ID_ETH_SEPOLIA, type ShieldedNetwork} from "../networks";

type Props = {
  onOpenMenu: () => void;
  onToggleAccounts: () => void;
  activeAccountName: string;
  accountsOpen: boolean;
  onCloseAccountsDropdown: () => void;
  shieldedNetworks: ShieldedNetwork[];
  shieldedChainId: number;
  onShieldedChainChange: (chainId: number) => void;
};

function networkPillTitle(net: ShieldedNetwork) {
  if (net.id === CHAIN_ID_ETH_SEPOLIA) return "Sepolia";
  if (net.id === CHAIN_ID_BASE_SEPOLIA) return "Base Sepolia";
  if (net.id === CHAIN_ID_ARBITRUM_SEPOLIA) return "Arb Sepolia";
  return net.label;
}

function networkMenuSubtitle(net: ShieldedNetwork) {
  if (net.id === CHAIN_ID_ETH_SEPOLIA) return "Ethereum Sepolia testnet";
  if (net.id === CHAIN_ID_BASE_SEPOLIA) return "Base Sepolia testnet";
  if (net.id === CHAIN_ID_ARBITRUM_SEPOLIA) return "Arbitrum Sepolia testnet";
  return net.label;
}

export function TopHeader({
  onOpenMenu,
  onToggleAccounts,
  activeAccountName,
  accountsOpen,
  onCloseAccountsDropdown,
  shieldedNetworks,
  shieldedChainId,
  onShieldedChainChange,
}: Props) {
  const [networkOpen, setNetworkOpen] = useState(false);
  const netPanelRef = useRef<HTMLDivElement>(null);

  const activeNet = shieldedNetworks.find((n) => n.id === shieldedChainId) ?? shieldedNetworks[0];
  const netLabel = activeNet?.label ?? "Network";
  const pillTitle = activeNet ? networkPillTitle(activeNet) : netLabel;
  const multi = shieldedNetworks.length > 1;

  useEffect(() => {
    if (accountsOpen) setNetworkOpen(false);
  }, [accountsOpen]);

  useEffect(() => {
    if (!networkOpen) return undefined;
    const onDoc = (e: MouseEvent) => {
      const el = netPanelRef.current;
      if (el && !el.contains(e.target as Node)) {
        setNetworkOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [networkOpen]);

  function openNetworkMenu() {
    onCloseAccountsDropdown();
    setNetworkOpen((v) => !v);
  }

  function selectNetwork(id: number) {
    onShieldedChainChange(id);
    setNetworkOpen(false);
  }

  return (
    <header className="top-header top-header-mm">
      <button type="button" className="account-pill" onClick={onToggleAccounts} aria-label="Open account switcher">
        <strong>{activeAccountName}</strong>
        <ChevronDown size={14} className={accountsOpen ? "chevron-open" : ""} />
      </button>

      <div className="top-header-mm-grow">
        <div className="top-header-mm-netwrap" ref={netPanelRef}>
          {multi ? (
            <>
              <button
                type="button"
                className={`network-mm-pill ${networkOpen ? "network-mm-pill--open" : ""}`}
                onClick={openNetworkMenu}
                aria-expanded={networkOpen}
                aria-haspopup="listbox"
                aria-label={`Network: ${netLabel}. Open network menu.`}
              >
                <span className="network-mm-pill__label">{pillTitle}</span>
                <ChevronDown size={16} className="network-mm-pill__chevron" aria-hidden />
              </button>
              {networkOpen ? (
                <>
                  <div className="network-mm-backdrop" aria-hidden />
                  <div className="network-mm-panel" role="listbox" aria-label="Select network">
                    {shieldedNetworks.map((n) => {
                      const selected = n.id === shieldedChainId;
                      return (
                        <button
                          key={n.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`network-mm-item ${selected ? "network-mm-item--active" : ""}`}
                          onClick={() => selectNetwork(n.id)}
                        >
                          <div className="network-mm-item__text">
                            <span className="network-mm-item__title">{networkPillTitle(n)}</span>
                            <span className="network-mm-item__sub">{networkMenuSubtitle(n)}</span>
                          </div>
                          {selected ? <Check size={18} className="network-mm-item__check" aria-hidden /> : null}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <span className="network-mm-pill network-mm-pill--static" aria-current="true">
              <span className="network-mm-pill__label">{pillTitle}</span>
            </span>
          )}
        </div>
      </div>

      <button type="button" className="icon-btn" onClick={onOpenMenu} aria-label="Open menu">
        <Menu size={16} />
      </button>
    </header>
  );
}
