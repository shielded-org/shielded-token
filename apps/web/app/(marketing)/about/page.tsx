import type {Metadata} from "next";
import Link from "next/link";
import {ArrowUpRight} from "lucide-react";

export const metadata: Metadata = {
  title: "About Shielded",
  description: "What Shielded is, who it is for, and how private payments work on Ethereum testnets.",
};

const SECTIONS = [
  {
    title: "What is Shielded?",
    body: "Shielded is a private payments product for Ethereum and popular L2 testnets. You deposit tokens, hold a private balance, send to other Shielded users without public payment details, and withdraw when you choose. It is open source and built for teams who need discretion—not anonymity theater.",
  },
  {
    title: "Who is it for?",
    body: "Finance and ops leads, DAO treasurers, founders paying contributors, and anyone who wants payroll or treasury flows without broadcasting amounts and counter parties on a public ledger. Developers can also integrate the same flows into their own products over time.",
  },
  {
    title: "What stays private?",
    body: "While your funds sit in the private layer, who paid whom and how much is not exposed to everyday chain observers. When you deposit from or withdraw to a normal wallet, that step looks like a regular on-chain transfer—we label those moments clearly in the app so you are never surprised.",
  },
  {
    title: "How is it different from sending ETH?",
    body: "A standard transfer is public by default. Shielded adds a private balance in between: you move in once, make multiple private payments, then move out. That pattern fits ongoing operations better than one-off public sends.",
  },
  {
    title: "Where can I use it?",
    body: "Today on Ethereum Sepolia, Base Sepolia, and Arbitrum Sepolia. Use the in-app faucet for test tokens, then try deposit, send, and withdraw end to end. Mainnet launch is the next milestone after security review and operational readiness.",
  },
  {
    title: "Is there a token?",
    body: "No. Shielded is infrastructure—a product and protocol you use with existing ERC-20 style test assets today. We are not bundling a token sale with the launch.",
  },
] as const;

export default function AboutProductPage() {
  return (
    <article className="relative z-10 mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <p className="landing-kicker font-mono text-xs uppercase tracking-[0.35em] text-[var(--landing-muted)]">
        About Shielded
      </p>
      <h1 className="font-display mt-4 text-4xl font-semibold tracking-tight text-[var(--landing-fg)] sm:text-5xl">
        Private payments, explained simply
      </h1>
      <p className="mt-6 text-base leading-8 text-[var(--landing-muted)]">
        Everything you need to understand the product—without a cryptography degree.
      </p>

      <div className="mt-12 space-y-6">
        {SECTIONS.map((section) => (
          <section key={section.title} className="landing-card rounded-[24px] p-6 sm:p-8">
            <h2 className="font-display text-xl font-semibold text-[var(--landing-fg)]">{section.title}</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--landing-muted)] sm:text-base">{section.body}</p>
          </section>
        ))}
      </div>

      <div className="mt-14 flex flex-wrap gap-4">
        <Link
          href="/dashboard"
          className="landing-cta-primary inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold"
        >
          Open app
          <ArrowUpRight className="size-4" />
        </Link>
        <Link href="/" className="landing-cta-ghost inline-flex items-center gap-2 rounded-full border px-7 py-3.5 text-sm font-semibold">
          Back to home
        </Link>
      </div>
    </article>
  );
}
