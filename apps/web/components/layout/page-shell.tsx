import type {ReactNode} from "react";
import {cn} from "@/lib/utils";

export function PageShell({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("w-full min-w-0 space-y-4 animate-page-enter sm:space-y-6", className)}>
      <header className="hidden gap-4 lg:grid xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div className="max-w-4xl">
          {eyebrow ? (
            <p className="hero-kicker font-mono text-xs uppercase tracking-[0.2em] text-[var(--brand-muted)]">
              {eyebrow}
            </p>
          ) : null}
          <h1
            className={cn(
              "font-display max-w-4xl text-3xl font-semibold tracking-[-0.03em] text-[var(--brand-fg)] sm:text-4xl",
              eyebrow ? "mt-2" : ""
            )}
          >
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--brand-muted)] sm:text-base">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="xl:justify-self-end">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}
