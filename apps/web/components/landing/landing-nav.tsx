"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {ArrowUpRight, Menu, X} from "lucide-react";
import {useEffect, useState} from "react";
import {ShieldedLogo} from "./shielded-logo";
import {cn} from "@/lib/utils";

const NAV_LINKS = [
  {href: "#how-it-works", label: "How it works", scroll: true},
  {href: "#privacy", label: "Your privacy", scroll: true},
  {href: "#benefits", label: "Why Shielded", scroll: true},
  {href: "/about", label: "About Shielded", scroll: false},
] as const;

const navLinkClass =
  "block rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--landing-muted)] transition hover:bg-[var(--landing-accent-soft)] hover:text-[var(--landing-fg)] lg:inline-block lg:rounded-none lg:bg-transparent lg:px-0 lg:py-0";

function sectionHref(hash: string, onHome: boolean) {
  return onHome ? hash : `/${hash}`;
}

export function LandingNav() {
  const pathname = usePathname();
  const onHome = pathname === "/";
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  const closeMobile = () => setMobileOpen(false);

  return (
    <header className="landing-nav sticky top-0 z-30 border-b border-[var(--landing-border)] bg-[var(--landing-bg)]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3 sm:px-8 sm:py-4">
        <ShieldedLogo href="/" />

        {/* Desktop */}
        <div className="hidden items-center gap-5 lg:flex">
          <nav className="flex items-center gap-5" aria-label="Page sections">
            {NAV_LINKS.map((item) =>
              item.scroll ? (
                <a key={item.href} href={sectionHref(item.href, onHome)} className={navLinkClass}>
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

        {/* Mobile: menu toggle */}
        <button
          type="button"
          className="landing-nav-menu-btn inline-flex size-10 items-center justify-center rounded-xl border border-[var(--landing-border)] bg-[var(--landing-surface)] text-[var(--landing-fg)] lg:hidden"
          aria-expanded={mobileOpen}
          aria-controls="landing-mobile-menu"
          onClick={() => setMobileOpen((o) => !o)}
        >
          {mobileOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          <span className="sr-only">{mobileOpen ? "Close menu" : "Open menu"}</span>
        </button>
      </div>

      {/* Mobile menu panel */}
      {mobileOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-[var(--landing-fg)]/20 backdrop-blur-[2px] lg:hidden"
            aria-label="Close menu"
            onClick={closeMobile}
          />
          <div
            id="landing-mobile-menu"
            className="landing-nav-mobile-panel absolute left-0 right-0 top-full z-50 border-b border-[var(--landing-border)] bg-[var(--landing-bg-elevated)] px-5 py-4 shadow-[0_20px_40px_rgba(15,23,42,0.1)] lg:hidden"
          >
            <nav className="flex flex-col gap-1" aria-label="Page sections">
              {NAV_LINKS.map((item) =>
                item.scroll ? (
                  <a
                    key={item.href}
                    href={sectionHref(item.href, onHome)}
                    className={navLinkClass}
                    onClick={closeMobile}
                  >
                    {item.label}
                  </a>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(navLinkClass, pathname === item.href && "bg-[var(--brand-accent-soft)] text-[var(--landing-fg)]")}
                    onClick={closeMobile}
                  >
                    {item.label}
                  </Link>
                )
              )}
            </nav>
            <Link
              href="/dashboard"
              className="landing-cta-primary mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold"
              onClick={closeMobile}
            >
              Open app
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </>
      ) : null}
    </header>
  );
}
