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
    <section className={cn("space-y-6 animate-page-enter", className)}>
      <header className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div className="max-w-4xl">
          {eyebrow ? (
            <p className="hero-kicker font-mono text-xs uppercase text-[#9ca3af]">
              {eyebrow}
            </p>
          ) : null}
          <h1 className={cn(
            "max-w-4xl text-3xl font-semibold tracking-[-0.03em] text-[#111827] sm:text-4xl",
            eyebrow ? "mt-2" : ""
          )}>
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[#6b7280] sm:text-base">
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
