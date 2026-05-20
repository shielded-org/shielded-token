/** Sticky nav offset — keep in sync with `.landing-section { scroll-margin-top }`. */
export const LANDING_SCROLL_OFFSET_PX = 88;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function smoothScrollToElement(el: HTMLElement, durationMs = 900): void {
  if (prefersReducedMotion()) {
    el.scrollIntoView({behavior: "auto", block: "start"});
    return;
  }

  const startY = window.scrollY;
  const targetY = Math.max(0, el.getBoundingClientRect().top + window.scrollY - LANDING_SCROLL_OFFSET_PX);
  const distance = targetY - startY;
  if (Math.abs(distance) < 2) return;

  const startTime = performance.now();

  function frame(now: number) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    window.scrollTo(0, startY + distance * easeInOutCubic(progress));
    if (progress < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

export function scrollToHash(hash: string, durationMs?: number): void {
  const id = hash.replace(/^#/, "").trim();
  if (!id) return;
  const el = document.getElementById(id);
  if (el) smoothScrollToElement(el, durationMs);
}
