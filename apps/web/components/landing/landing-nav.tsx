"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {ArrowUpRight} from "lucide-react";
import {ShieldedLogo} from "./shielded-logo";
import {cn} from "@/lib/utils";

const NAV_LINKS = [
  {href: "#how-it-works", label: "How it works", scroll: true},
  {href: "#privacy", label: "Your privacy", scroll: true},
  {href: "#benefits", label: "Why Shielded", scroll: true},
  {href: "/about", label: "About Shielded", scroll: false},
] as const;

const navLinkClass =
  "whitespace-nowrap text-xs font-medium text-[var(--landing-muted)] transition hover:text-[var(--landing-fg)] sm:text-sm";

function sectionHref(hash: string, onHome: boolean) {
  return onHome ? hash : `/${hash}`;
}

export function LandingNav() {
  const pathname = usePathname();
  const onHome = pathname === "/";

  return (
    <header className="landing-nav sticky top-0 z-30 border-b border-[var(--landing-border)] bg-[var(--landing-bg)]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4 sm:gap-4 sm:px-8">
        <ShieldedLogo href="/" />
        <div className="flex flex-wrap items-center justify-end gap-3 sm:gap-4 lg:gap-5">
          <nav
            className="flex max-w-[min(100%,42rem)] items-center gap-2 overflow-x-auto sm:gap-4 lg:max-w-none lg:gap-5"
            aria-label="Page sections"
          >
            {NAV_LINKS.map((item) =>
              item.scroll ? (
                <a
                  key={item.href}
                  href={sectionHref(item.href, onHome)}
                  className={navLinkClass}
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(navLinkClass, pathname === item.href && "text-[var(--landing-fg)]")}
                >
                  {item.label}
                </Link>
              )
            )}
          </nav>
          <Link
            href="/dashboard"
            className="landing-cta-primary inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold"
          >
            Open app
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
