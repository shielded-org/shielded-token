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
    <section className={cn("space-y-10 animate-page-enter", className)}>
      <header className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div className="max-w-4xl">
          {eyebrow ? (
            <p className="hero-kicker font-mono text-xs uppercase text-[#666666]">
              {eyebrow}
            </p>
          ) : null}
          <h1 className={cn(
            "max-w-4xl text-4xl font-bold tracking-[-0.055em] text-[#f2f2f2] sm:text-5xl lg:text-6xl",
            eyebrow ? "mt-4" : ""
          )}>
            {title}
          </h1>
          {description ? (
            <p className="mt-5 max-w-3xl text-[15px] leading-8 text-[#8b8b8b] sm:text-base">
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
