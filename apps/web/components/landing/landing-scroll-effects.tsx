"use client";

import {usePathname} from "next/navigation";
import {useEffect} from "react";
import {scrollToHash} from "@/lib/landing-scroll";

/**
 * Landing-only: eased in-page anchor scroll + section reveal on scroll.
 */
export function LandingScrollEffects() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.querySelector(".landing-page");
    if (!root) return;

    const onAnchorClick = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href*="#"]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const raw = anchor.getAttribute("href") ?? "";
      const hash = raw.includes("#") ? raw.slice(raw.indexOf("#")) : "";
      if (!hash || hash === "#") return;

      const id = hash.slice(1);
      const section = document.getElementById(id);
      if (!section || !root.contains(section)) return;

      const samePage = raw.startsWith("#") || (raw.startsWith("/#") && pathname === "/");
      if (!samePage) return;

      event.preventDefault();
      window.history.pushState(null, "", pathname === "/" ? hash : `/${hash}`);
      scrollToHash(hash);
    };

    root.addEventListener("click", onAnchorClick);
    return () => root.removeEventListener("click", onAnchorClick);
  }, [pathname]);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (!hash || pathname !== "/") return;
    const timer = window.setTimeout(() => scrollToHash(hash, 1000), 120);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    const root = document.querySelector(".landing-page");
    if (!root) return;

    const nodes = root.querySelectorAll<HTMLElement>(".landing-reveal");
    if (nodes.length === 0) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      nodes.forEach((el) => el.classList.add("landing-reveal--visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("landing-reveal--visible");
          observer.unobserve(entry.target);
        }
      },
      {threshold: 0.12, rootMargin: "0px 0px -6% 0px"}
    );

    nodes.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
