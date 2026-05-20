import {LandingNav} from "@/components/landing/landing-nav";
import {LandingScrollEffects} from "@/components/landing/landing-scroll-effects";
import Link from "next/link";

export default function MarketingLayout({children}: {children: React.ReactNode}) {
  return (
    <div className="landing-page relative overflow-x-hidden">
      <LandingScrollEffects />
      <div className="landing-blob landing-blob-a" aria-hidden />
      <div className="landing-blob landing-blob-b" aria-hidden />
      <LandingNav />
      <main>{children}</main>
      <footer className="landing-footer relative z-10 border-t border-[var(--landing-border)]">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
          <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <p className="font-display text-lg font-semibold text-[var(--landing-fg)]">Shielded</p>
              <p className="mt-3 max-w-md text-sm leading-7 text-[var(--landing-muted)]">
                Private payments for Ethereum teams. Deposit, pay discreetly, withdraw on your schedule—available on
                public testnets while we prepare for mainnet.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--landing-muted)]">Explore</p>
              <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <a href="/about" className="text-[var(--landing-muted)] hover:text-[var(--landing-fg)]">
                    About Shielded
                  </a>
                </li>
                <li>
                  <Link href="/dashboard" className="text-[var(--landing-muted)] hover:text-[var(--landing-fg)]">
                    Open app
                  </Link>
                </li>
                <li>
                  <a href="#how-it-works" className="text-[var(--landing-muted)] hover:text-[var(--landing-fg)]">
                    How it works
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--landing-muted)]">In the app</p>
              <ul className="mt-4 space-y-2 text-sm text-[var(--landing-muted)]">
                <li>Deposit</li>
                <li>Send privately</li>
                <li>Withdraw</li>
                <li>Testnet faucet</li>
              </ul>
            </div>
          </div>
          <p className="mt-10 border-t border-[var(--landing-border)] pt-8 text-xs text-[var(--landing-muted)]">
            Shielded — private payments on Ethereum. Try it on testnet today.
          </p>
        </div>
      </footer>
    </div>
  );
}
