import type {ButtonHTMLAttributes, ReactNode} from "react";
import {cn} from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  icon?: ReactNode;
};

export function Button({
  className,
  variant = "primary",
  icon,
  children,
  ...props
}: ButtonProps) {
  const variants = {
    primary: "app-btn-primary",
    secondary: "app-btn-secondary",
    ghost: "app-btn-ghost",
  };

  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-all duration-200 ease-out app-focus-ring disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:transform-none",
        variants[variant],
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
