"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {Building2, House, Menu, Settings, TerminalSquare, X} from "lucide-react";
import {ethers} from "ethers";
import {useEffect, useState} from "react";
import {WalletConnection} from "@/components/wallet/wallet-connection";
import {NAV_ITEMS, RELAYER_URL, TOKENS} from "@/lib/constants";
import {deriveShieldedKeysFromWallet, mapNotesToUi, scanPrivateState} from "@/lib/shielded-integration";
import {ERC20_ABI, SEPOLIA} from "@/lib/shielded-config";
import {cn} from "@/lib/utils";
import {getActiveInjectedProvider} from "@/lib/injected-wallet";
import {useShieldedStore} from "@/store/use-shielded-store";

export function AppShell({children}: {children: React.ReactNode}) {
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const address = useShieldedStore((state) => state.walletAddress);
  const viewingPub = useShieldedStore((state) => state.viewingPub);
  const viewingKey = useShieldedStore((state) => state.viewingKey);
  const lastSyncedBlock = useShieldedStore((state) => state.lastSyncedBlock);
  const setRelayerHealth = useShieldedStore((state) => state.setRelayerHealth);
  const setLastSyncedBlock = useShieldedStore((state) => state.setLastSyncedBlock);
  const setKeyMaterial = useShieldedStore((state) => state.setKeyMaterial);
  const setNotes = useShieldedStore((state) => state.setNotes);
  const setTokens = useShieldedStore((state) => state.setTokens);

  useEffect(() => {
    let mounted = true;

    async function checkHealth() {
      const startedAt = performance.now();
      try {
        const response = await fetch(`${RELAYER_URL}/healthz`, {cache: "no-store"});
        if (!mounted) return;
        setRelayerHealth({
          ok: response.ok,
          latencyMs: Math.round(performance.now() - startedAt),
          checkedAt: new Date().toISOString(),
        });
      } catch {
        if (!mounted) return;
        setRelayerHealth({
          ok: false,
          latencyMs: null,
          checkedAt: new Date().toISOString(),
        });
      }
    }

    checkHealth();
    const interval = window.setInterval(checkHealth, 15000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [setRelayerHealth, setLastSyncedBlock]);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    async function syncKeys() {
      try {
        const provider = getActiveInjectedProvider();
        if (!provider) return;
        const keys = await deriveShieldedKeysFromWallet(
          address as `0x${string}`,
          async (message) =>
            (await provider.request({
              method: "personal_sign",
              params: [message, address],
            })) as `0x${string}`
        );
        if (cancelled) return;
        setKeyMaterial({
          spendingKey: keys.spendingKey.toString(),
          viewingKey: keys.viewingPriv.toString(),
          viewingPub: keys.viewingPub,
          ownerPk: keys.ownerPk.toString(),
          walletAddress: address as `0x${string}`,
        });
      } catch {
        // user may reject signature prompt
      }
    }
    void syncKeys();
    return () => {
      cancelled = true;
    };
  }, [address, setKeyMaterial]);

  useEffect(() => {
    let cancelled = false;
    async function resolveTokenMetadata() {
      try {
        const provider = new ethers.JsonRpcProvider(SEPOLIA.rpcUrl, SEPOLIA.chainId);
        const unique = Array.from(new Set(TOKENS.map((t) => t.contractAddress.toLowerCase())));
        const resolved = await Promise.all(
          unique.map(async (addr, index) => {
            const token = new ethers.Contract(addr, ERC20_ABI, provider);
            const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);
            return {
              symbol: String(symbol),
              name: String(symbol),
              decimals: Number(decimals),
              accent: TOKENS[index % TOKENS.length]?.accent ?? TOKENS[0].accent,
              icon: String(symbol).slice(0, 1).toUpperCase(),
              contractAddress: ethers.getAddress(addr) as `0x${string}`,
            };
          })
        );
        if (!cancelled && resolved.length > 0) {
          setTokens(resolved);
        }
      } catch {
        // fallback to default tokens
      }
    }
    void resolveTokenMetadata();
    return () => {
      cancelled = true;
    };
  }, [setTokens]);

  useEffect(() => {
    if (!viewingPub || !viewingKey) return;
    const activeViewingPub = viewingPub;
    let cancelled = false;
    async function syncNotes() {
      try {
        const scan = await scanPrivateState(BigInt(viewingKey), activeViewingPub);
        if (cancelled) return;
        setLastSyncedBlock(scan.stats.latestBlock);
        setNotes(mapNotesToUi(scan.notes));
      } catch {
        // keep previous state
      }
    }
    void syncNotes();
    const interval = window.setInterval(() => {
      void syncNotes();
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [setLastSyncedBlock, setNotes, viewingKey, viewingPub]);

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-[#111827]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px]">
        {mobileSidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-[#111827]/35 lg:hidden"
            aria-label="Close navigation menu"
            onClick={() => setMobileSidebarOpen(false)}
          />
        ) : null}

        <aside className={cn(
          "fixed inset-y-0 left-0 z-50 w-[250px] border-r border-[#e5e7eb] bg-[#f8fafc] px-4 py-5 transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="flex items-center gap-3 px-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-[#111827] text-white">
              <Building2 className="size-4" />
            </div>
            <p className="font-semibold text-[#111827]">Shielded</p>
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              className="ml-auto inline-flex rounded-lg border border-[#e5e7eb] p-1.5 text-[#6b7280] lg:hidden"
              aria-label="Close navigation"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-8 space-y-2">
            <p className="px-2 text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">Company</p>
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
                    active ? "bg-[#e5e7eb] text-[#111827]" : "text-[#4b5563] hover:bg-[#eef2f7]"
                  )}
                >
                  <TerminalSquare className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="mt-8 space-y-2">
            <p className="px-2 text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">Manage</p>
            <Link href="/settings" onClick={() => setMobileSidebarOpen(false)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#4b5563] hover:bg-[#eef2f7]">
              <Settings className="size-4" /> Settings
            </Link>
          </div>
        </aside>

        <div className="flex flex-1 flex-col px-3 py-3 sm:px-4 lg:px-6 lg:py-4">
          <header className="surface-panel rounded-2xl px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav className="flex items-center gap-5 text-sm text-[#4b5563]">
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(true)}
                  className="inline-flex rounded-lg border border-[#e5e7eb] p-1.5 text-[#6b7280] lg:hidden"
                  aria-label="Open navigation"
                >
                  <Menu className="size-4" />
                </button>
                <span className="inline-flex items-center gap-1.5 font-medium text-[#111827]"><House className="size-4" /> Home</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-2.5 py-1 text-xs text-[#6b7280]">
                  Synced to block {lastSyncedBlock.toLocaleString()}
                </span>
              </nav>
              <div className="flex items-center gap-2">
                <WalletConnection />
              </div>
            </div>
          </header>

          <main className="flex-1 pt-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
