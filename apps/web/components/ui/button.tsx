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
    primary:
      "border-[#111827] bg-[#111827] text-white shadow-[0_6px_18px_rgba(17,24,39,0.2)] hover:-translate-y-0.5 hover:bg-[#1f2937] active:translate-y-0",
    secondary:
      "border-[#d1d5db] bg-white text-[#111827] hover:-translate-y-0.5 hover:border-[#9ca3af] hover:bg-[#f9fafb] active:translate-y-0",
    ghost:
      "border-transparent bg-transparent text-[#6b7280] hover:border-[#d1d5db] hover:bg-white hover:text-[#111827]",
  };

  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f46e5]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f3f4f6] disabled:cursor-not-allowed disabled:opacity-45",
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
