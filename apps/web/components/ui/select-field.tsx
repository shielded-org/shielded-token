import {ChevronDown} from "lucide-react";
import {cn} from "@/lib/utils";

type SelectFieldProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function SelectField({className, children, ...props}: SelectFieldProps) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-14 w-full appearance-none rounded-2xl border border-[#d1d5db] bg-white px-5 text-sm text-[#111827] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] outline-none hover:border-[#9ca3af] focus:border-[#4f46e5]/45 focus:ring-4 focus:ring-[#4f46e5]/10",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-5 top-1/2 size-4 -translate-y-1/2 text-[#6b7280]" />
    </div>
  );
}
