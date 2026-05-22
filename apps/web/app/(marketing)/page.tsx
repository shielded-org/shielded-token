import type {CSSProperties} from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  HandCoins,
  Lock,
  Shield,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import {LandingHeroVisual} from "@/components/landing/landing-hero-visual";

const STEPS = [
  {
    step: "01",
    title: "Move funds in",
    body: "Deposit tokens from your everyday wallet into your private balance. This step is public on-chain—like any normal transfer—so you always know when you are entering the private layer.",
    link: {label: "Deposit", href: "/shield"},
  },
  {
    step: "02",
    title: "Pay and get paid privately",
    body: "Send to another Shielded user without exposing who paid whom or how much. Recipients see the payment in their inbox when it is meant for them—without broadcasting details to the whole network.",
    link: {label: "Send privately", href: "/transfer"},
  },
  {
    step: "03",
    title: "Cash out when you want",
    body: "Withdraw back to a regular wallet address when you are ready. You stay in control of timing; exiting is a normal on-chain action, clearly labeled in the app.",
    link: {label: "Withdraw", href: "/unshield"},
  },
] as const;

const FEATURES = [
  {
    title: "Private payments",
    subtitle: "Core experience",
    detail: "Pay teams, contributors, or partners without publishing payment details on a public ledger.",
    cta: "Send now",
    href: "/transfer",
  },
  {
    title: "One private balance",
    subtitle: "Simple to hold",
    detail: "See what you own in one place. Hide or reveal balances when you need to—your choice.",
    cta: "Deposit",
    href: "/shield",
  },
  {
    title: "Works where you build",
    subtitle: "Multi-chain",
    detail: "Use the same experience on leading Ethereum test networks while we prepare for mainnet.",
    cta: "View dashboard",
    href: "/dashboard",
  },
] as const;

const BENEFITS = [
  {
    icon: Lock,
    label: "Privacy you can explain",
    detail: "Strong protection for everyday transfers—not vague promises. We are clear about what is private and what is not.",
  },
  {
    icon: Wallet,
    label: "Familiar wallet flow",
    detail: "Connect with MetaMask or similar wallets. No new chain to learn for basic deposit, send, and withdraw.",
  },
  {
    icon: Sparkles,
    label: "Built in the browser",
    detail: "Generate what you need inside the app. No shipping keys to a third-party prover for standard flows.",
  },
  {
    icon: Users,
    label: "Made for real teams",
    detail: "Treasury payouts, payroll, and B2B settlements where discretion matters—without leaving public Ethereum.",
  },
] as const;

const NETWORKS = [
  {name: "Ethereum Sepolia", tag: "Testnet"},
  {name: "Base Sepolia", tag: "Testnet"},
  {name: "Arbitrum Sepolia", tag: "Testnet"},
] as const;

const BOUNDARIES = [
  {
    icon: Eye,
    label: "When you deposit",
    text: "Amount and wallet address are visible on-chain—same as sending to any contract today.",
  },
  {
    icon: EyeOff,
    label: "While you stay shielded",
    text: "Who paid whom and how much stays private inside the Shielded layer.",
  },
  {
    icon: Eye,
    label: "When you withdraw",
    text: "Destination and amount show on-chain again. We label these steps so nothing feels hidden.",
  },
] as const;

const USE_CASES = [
  "Treasury and ops payouts",
  "Payroll with discretion",
  "Grants and contributor rewards",
  "Testing before mainnet launch",
] as const;

export default function LandingPage() {
  return (
    <div className="landing-scroll">
      <section id="hero" className="landing-section landing-hero landing-reveal--hero relative z-10">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-12 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:py-20">
          <div className="relative min-w-0">
            <p className="landing-kicker font-mono text-xs uppercase tracking-[0.35em] text-[var(--landing-muted)]">
              Private payments on Ethereum
            </p>
            <h1 className="font-display mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-[var(--landing-fg)] sm:text-5xl md:text-6xl xl:text-7xl">
              Pay without the public receipt.
            </h1>
            <p className="mt-6 text-base leading-8 text-[var(--landing-muted)] sm:text-lg">
              <span className="font-semibold text-[var(--landing-accent)]">Shielded</span> lets you hold a private
              balance, send to people who use Shielded, and withdraw when you are done—on the networks you already use.
              No token. No hype. Just a product built for discretion on public chains.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/dashboard"
                className="landing-cta-primary inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold"
              >
                Open app
                <ArrowUpRight className="size-4" />
              </Link>
              <Link
                href="/about"
                className="landing-cta-ghost inline-flex items-center gap-2 rounded-full border px-7 py-3.5 text-sm font-semibold"
              >
                Learn more
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <ul className="mt-12 grid gap-4 sm:grid-cols-3">
              {[
                {icon: Lock, text: "Private sends"},
                {icon: Shield, text: "You control"},
                {icon: HandCoins, text: "Testnet ready"},
              ].map((item) => (
                <li
                  key={item.text}
                  className="flex items-center gap-2 rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-surface)] px-4 py-3 text-sm text-[var(--landing-muted)]"
                >
                  <item.icon className="size-4 shrink-0 text-[var(--landing-accent)]" />
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
          <div className="mx-auto w-full max-w-md lg:max-w-none">
            <LandingHeroVisual />
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="landing-section landing-reveal relative z-10 bg-[var(--landing-bg-elevated)]"
        style={{"--landing-reveal-delay": "0ms"} as CSSProperties}
      >
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="max-w-2xl">
            <p className="landing-kicker font-mono text-xs uppercase tracking-[0.28em] text-[var(--landing-muted)]">
              Simple flow
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold text-[var(--landing-fg)] sm:text-4xl">
              Three steps. That&apos;s it.
            </h2>
            <p className="mt-4 text-base leading-8 text-[var(--landing-muted)]">
              You do not need to understand cryptography to get value from Shielded. Deposit, pay privately, withdraw—each
              step is guided in the app with plain-language labels.
            </p>
          </div>
          <ol className="mt-14 space-y-6">
            {STEPS.map((step) => (
              <li key={step.step} className="landing-card grid gap-6 rounded-[28px] p-6 sm:grid-cols-[auto_1fr_auto] sm:p-8">
                <span className="font-mono text-3xl font-semibold text-[var(--landing-accent)]">{step.step}</span>
                <div>
                  <h3 className="font-display text-xl font-semibold text-[var(--landing-fg)]">{step.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--landing-muted)] sm:text-base">{step.body}</p>
                </div>
                <Link
                  href={step.link.href}
                  className="landing-cta-ghost inline-flex h-fit items-center gap-2 self-start rounded-full border px-4 py-2 text-xs font-semibold sm:self-center"
                >
                  {step.link.label}
                  <ArrowRight className="size-3.5" />
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        id="privacy"
        className="landing-section landing-reveal relative z-10"
        style={{"--landing-reveal-delay": "80ms"} as CSSProperties}
      >
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
            <div>
              <p className="landing-kicker font-mono text-xs uppercase tracking-[0.28em] text-[var(--landing-muted)]">
                Trust & transparency
              </p>
              <h2 className="font-display mt-3 text-3xl font-semibold text-[var(--landing-fg)] sm:text-4xl">
                Honest about what stays private
              </h2>
              <p className="mt-4 text-base leading-8 text-[var(--landing-muted)]">
                We believe privacy products should be upfront. Shielded protects your activity while funds sit in the
                private layer—not when you move in or out with a normal wallet transfer.
              </p>
              <p className="mt-4 text-base leading-8 text-[var(--landing-muted)]">
                That clarity helps finance teams, founders, and operators adopt the product with confidence instead of
                guessing what outsiders can see.
              </p>
              <Link
                href="/about"
                className="landing-cta-ghost mt-8 inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold"
              >
                Read the product story
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <ul className="space-y-4">
              {BOUNDARIES.map((row) => (
                <li key={row.label} className="landing-card flex gap-4 rounded-[24px] p-5 sm:p-6">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--landing-accent)]/10 text-[var(--landing-accent)]">
                    <row.icon className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-[var(--landing-fg)]">{row.label}</p>
                    <p className="mt-2 text-sm leading-7 text-[var(--landing-muted)]">{row.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section
        id="benefits"
        className="landing-section landing-reveal relative z-10 bg-[var(--landing-bg-elevated)]"
        style={{"--landing-reveal-delay": "120ms"} as CSSProperties}
      >
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="text-center">
            <p className="landing-kicker font-mono text-xs uppercase tracking-[0.28em] text-[var(--landing-muted)]">
              Why Shielded
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold text-[var(--landing-fg)] sm:text-4xl">
              Built for people who move money for work
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-[var(--landing-muted)]">
              Whether you run a DAO treasury or pay contractors internationally, Shielded gives you discretion without
              asking you to leave the Ethereum ecosystem.
            </p>
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2">
            {BENEFITS.map((item) => (
              <article key={item.label} className="landing-card rounded-[24px] p-6 sm:p-7">
                <item.icon className="size-6 text-[var(--landing-accent)]" />
                <h3 className="font-display mt-4 text-lg font-semibold text-[var(--landing-fg)]">{item.label}</h3>
                <p className="mt-2 text-sm leading-7 text-[var(--landing-muted)]">{item.detail}</p>
              </article>
            ))}
          </div>

          <div className="mt-10 landing-card rounded-[28px] p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--landing-muted)]">Good fit for</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {USE_CASES.map((label) => (
                <li
                  key={label}
                  className="rounded-full border border-[var(--landing-border)] bg-[var(--landing-surface)] px-4 py-2 text-sm text-[var(--landing-fg)]"
                >
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section
        className="landing-section landing-reveal relative z-10"
        style={{"--landing-reveal-delay": "60ms"} as CSSProperties}
      >
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <p className="landing-kicker font-mono text-xs uppercase tracking-[0.28em] text-[var(--landing-muted)]">
            In the app today
          </p>
          <h2 className="font-display mt-3 text-3xl font-semibold text-[var(--landing-fg)] sm:text-4xl">
            Everything you need to try it
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-[var(--landing-muted)]">
            Dashboard, private inbox, deposit, send, withdraw, and a testnet faucet—so you can experiment with mock
            tokens before real funds.
          </p>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="landing-card rounded-[28px] p-6 sm:p-7">
                <p className="font-mono text-xs uppercase tracking-wider text-[var(--landing-accent)]">{feature.subtitle}</p>
                <h3 className="font-display mt-3 text-xl font-semibold text-[var(--landing-fg)]">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--landing-muted)]">{feature.detail}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href={feature.href} className="landing-cta-ghost rounded-full border px-4 py-2 text-xs font-semibold">
                    {feature.cta}
                  </Link>
                  <Link href="/dashboard" className="landing-cta-primary rounded-full px-4 py-2 text-xs font-semibold">
                    Open app
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="try-it"
        className="landing-section landing-reveal relative z-10 bg-[var(--landing-bg-elevated)]"
        style={{"--landing-reveal-delay": "100ms"} as CSSProperties}
      >
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <p className="landing-kicker font-mono text-xs uppercase tracking-[0.28em] text-[var(--landing-muted)]">
                Try it free
              </p>
              <h2 className="font-display mt-3 text-3xl font-semibold text-[var(--landing-fg)] sm:text-4xl">
                Live on testnets today
              </h2>
              <p className="mt-4 text-base leading-8 text-[var(--landing-muted)]">
                Connect your wallet, pick a network, and mint play-money tokens from the faucet. Run a full private
                payment in minutes—no mainnet risk while we finish audits and launch prep.
              </p>
              <p className="mt-4 text-base leading-8 text-[var(--landing-muted)]">
                Mainnet is next on the roadmap. Today is the best time to learn the product and share feedback with your
                team.
              </p>
            </div>
            <ul className="space-y-4">
              {NETWORKS.map((net) => (
                <li
                  key={net.name}
                  className="landing-card flex items-center justify-between gap-4 rounded-[24px] px-5 py-4 sm:px-6 sm:py-5"
                >
                  <p className="font-semibold text-[var(--landing-fg)]">{net.name}</p>
                  <span className="rounded-full bg-[var(--landing-accent)]/10 px-3 py-1 text-xs font-semibold text-[var(--landing-accent)]">
                    {net.tag}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section
        id="get-started"
        className="landing-section landing-reveal relative z-10 mt-10 pb-28"
        style={{"--landing-reveal-delay": "140ms"} as CSSProperties}
      >
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="landing-card rounded-[32px] p-8 sm:p-14">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <h2 className="font-display text-3xl font-semibold text-[var(--landing-fg)] sm:text-4xl">
                  Start your first private payment
                </h2>
                <p className="mt-4 max-w-xl text-base leading-8 text-[var(--landing-muted)]">
                  Open the app, connect your wallet, and follow the guided deposit and send flows. If you are evaluating
                  for your organization, run a test payout between two wallets—you will see the difference immediately.
                </p>
                <ul className="mt-6 space-y-2 text-sm text-[var(--landing-muted)]">
                  <li>· Private balance dashboard</li>
                  <li>· Inbox for payments meant for you</li>
                  <li>· Free test tokens on public testnets</li>
                </ul>
              </div>
              <Link
                href="/dashboard"
                className="landing-cta-primary inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-8 py-4 text-base font-semibold"
              >
                Open app
                <ArrowUpRight className="size-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
