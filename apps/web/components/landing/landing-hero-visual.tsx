"use client";

import {ArrowRight, Lock, Shield, Wallet} from "lucide-react";

export function LandingHeroVisual() {
  return (
    <div className="landing-hero-visual relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden>
      <div className="landing-hero-visual-glow" />
      <div className="landing-hero-visual-ring landing-hero-visual-ring-a" />
      <div className="landing-hero-visual-ring landing-hero-visual-ring-b" />

      <div className="relative mx-auto aspect-square max-h-[420px] w-full max-w-[420px]">
        <div className="landing-hero-visual-card landing-hero-visual-card-tl">
          <Wallet className="size-4 text-[var(--landing-accent)]" />
          <span className="mt-2 block text-xs font-semibold text-[var(--landing-fg)]">Your balance</span>
          <span className="mt-1 text-[10px] leading-snug text-[var(--landing-muted)]">Visible only to you</span>
        </div>

        <div className="landing-hero-visual-card landing-hero-visual-card-tr">
          <Lock className="size-4 text-[var(--landing-accent)]" />
          <span className="mt-2 block text-xs font-semibold text-[var(--landing-fg)]">Incoming payment</span>
          <span className="mt-1 text-[10px] leading-snug text-[var(--landing-muted)]">Delivered privately</span>
        </div>

        <div className="landing-hero-visual-card landing-hero-visual-card-bl">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--landing-accent)]">Verified</span>
          <span className="mt-2 block text-xs font-semibold text-[var(--landing-fg)]">In your wallet</span>
          <span className="mt-1 text-[10px] text-[var(--landing-muted)]">No extra apps required</span>
        </div>

        <div className="landing-hero-visual-card landing-hero-visual-card-br">
          <span className="text-[10px] text-[var(--landing-muted)]">Send</span>
          <span className="mt-1 block text-xs font-semibold text-[var(--landing-fg)]">Without exposure</span>
          <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-[var(--landing-accent)]">
            One click <ArrowRight className="size-3" />
          </span>
        </div>

        <div className="landing-hero-visual-core">
          <div className="landing-hero-visual-shield">
            <Shield className="size-14 text-white" strokeWidth={1.5} />
          </div>
          <p className="mt-4 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--landing-muted)]">
            Private by design
          </p>
        </div>

        <svg className="landing-hero-visual-lines absolute inset-0 size-full" viewBox="0 0 400 400">
          <path
            d="M200 200 L80 90 M200 200 L320 90 M200 200 L70 310 M200 200 L330 310"
            fill="none"
            stroke="url(#line-grad)"
            strokeWidth="1"
            strokeDasharray="4 6"
            opacity="0.45"
          />
          <defs>
            <linearGradient id="line-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7A72F0" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}
