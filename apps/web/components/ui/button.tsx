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
      "border-[#0047ab]/24 bg-[linear-gradient(180deg,#2b64c8,#0047ab)] text-[#f2f2f2] shadow-[0_14px_34px_rgba(0,71,171,0.28)] hover:-translate-y-0.5 hover:shadow-[0_22px_42px_rgba(0,71,171,0.34)] hover:saturate-125 active:translate-y-0 active:shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_8px_20px_rgba(0,71,171,0.2)]",
    secondary:
      "border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.01))] text-[#f2f2f2] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:-translate-y-0.5 hover:border-[#0047ab]/26 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.016))] hover:text-white active:translate-y-0 active:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
    ghost:
      "border-transparent bg-transparent text-[#cccccc] hover:border-white/8 hover:bg-white/5 hover:text-white",
  };

  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047ab]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060606] disabled:cursor-not-allowed disabled:opacity-45",
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
