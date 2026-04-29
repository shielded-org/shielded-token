import {ChevronDown} from "lucide-react";
import {cn} from "@/lib/utils";

type SelectFieldProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function SelectField({className, children, ...props}: SelectFieldProps) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-14 w-full appearance-none rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.012))] px-5 text-sm text-[#f2f2f2] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] outline-none hover:border-white/12 focus:border-[#7df9ff]/35 focus:ring-4 focus:ring-[#7df9ff]/10",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-5 top-1/2 size-4 -translate-y-1/2 text-[#666666]" />
    </div>
  );
}
