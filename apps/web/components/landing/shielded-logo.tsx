import Link from "next/link";
import {cn} from "@/lib/utils";

function ShieldMark({className}: {className?: string}) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="shield-mark-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7A72F0" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <g transform="translate(50,50)">
        <path d="M-31,-40 L31,-40 L31,8 Q31,33 0,43 Q-31,33 -31,8 Z" fill="url(#shield-mark-grad)" />
        <path
          d="M-8.5,-2 L-8.5,-10 A8.5,8.5 0 0,1 8.5,-10 L8.5,-2"
          stroke="white"
          strokeWidth="2.3"
          fill="none"
          strokeLinecap="round"
        />
        <rect x="-13" y="-2" width="26" height="17" rx="4" fill="none" stroke="white" strokeWidth="1.9" />
        <circle cx="0" cy="6.5" r="3.4" fill="white" />
        <rect x="-1.4" y="8.5" width="2.8" height="4.8" rx="1.1" fill="white" />
      </g>
    </svg>
  );
}

export function ShieldedLogo({
  className,
  href = "/",
  showWordmark = true,
}: {
  className?: string;
  href?: "/" | "/about" | "/dashboard";
  showWordmark?: boolean;
}) {
  const inner = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--landing-border)] bg-[var(--landing-surface)] shadow-sm">
        <ShieldMark />
      </span>
      {showWordmark ? (
        <span className="font-display text-xl font-semibold tracking-tight text-[var(--landing-fg)]">
          Shielded<span className="text-[var(--landing-accent)]">.</span>
        </span>
      ) : null}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)]">
        {inner}
      </Link>
    );
  }
  return inner;
}
