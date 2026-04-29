"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {Shield, Sparkles, TerminalSquare} from "lucide-react";
import {useEffect} from "react";
import {WalletBar} from "@/components/wallet/wallet-bar";
import {NAV_ITEMS, RELAYER_URL} from "@/lib/constants";
import {cn} from "@/lib/utils";
import {useShieldedStore} from "@/store/use-shielded-store";

export function AppShell({children}: {children: React.ReactNode}) {
  const pathname = usePathname();
  const setRelayerHealth = useShieldedStore((state) => state.setRelayerHealth);
  const setLastSyncedBlock = useShieldedStore((state) => state.setLastSyncedBlock);

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
    const blockInterval = window.setInterval(() => {
      setLastSyncedBlock(useShieldedStore.getState().lastSyncedBlock + 1);
    }, 22000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.clearInterval(blockInterval);
    };
  }, [setLastSyncedBlock, setRelayerHealth]);

  return (
    <div className="min-h-screen bg-[#060606] text-[#cccccc]">
      <div className="grain pointer-events-none fixed inset-0 opacity-100" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-4 pb-10 pt-4 sm:px-6 lg:px-10">
        <header className="surface-panel rounded-[32px] px-5 py-5 sm:px-6 lg:px-7">
          <div className="soft-divider flex flex-col gap-6 pb-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex size-14 items-center justify-center rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.012))] text-[#00ff7f] shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
                <Shield className="size-5" />
              </div>
              <div className="max-w-xl">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl font-bold tracking-[-0.05em] text-[#f2f2f2]">
                    Shielded Token
                  </h1>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-[#666666]">
                    <Sparkles className="size-3" />
                    private defi
                  </span>
                </div>
                <p className="mt-2 text-sm leading-7 text-[#8b8b8b]">
                  A privacy-first wallet surface for shielding, private transfer,
                  discovery, and controlled exits back to public state.
                </p>
              </div>
            </div>
            <nav className="flex flex-wrap items-center gap-2.5">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm transition-all duration-200",
                      active
                        ? "border-[#00ff7f]/24 bg-[#00ff7f]/10 text-[#f2f2f2] shadow-[0_12px_28px_rgba(0,255,127,0.08)]"
                        : "border-white/8 bg-white/[0.03] text-[#8b8b8b] hover:-translate-y-0.5 hover:border-white/12 hover:bg-white/[0.05] hover:text-[#f2f2f2]"
                    )}
                  >
                    <TerminalSquare className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="pt-6">
            <WalletBar />
          </div>
        </header>

        <main className="flex-1 pt-12">{children}</main>
      </div>
    </div>
  );
}
