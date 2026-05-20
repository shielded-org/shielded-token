import {ChevronDown} from "lucide-react";
import {cn} from "@/lib/utils";

type SelectFieldProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function SelectField({className, children, ...props}: SelectFieldProps) {
  return (
    <div className="relative">
      <select
        className={cn(
          "app-select h-14 w-full appearance-none rounded-2xl px-5 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-5 top-1/2 size-4 -translate-y-1/2 text-[var(--brand-muted)]" />
    </div>
  );
}
