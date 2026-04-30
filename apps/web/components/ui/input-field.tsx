import {cn} from "@/lib/utils";

type InputFieldProps = React.InputHTMLAttributes<HTMLInputElement>;

export function InputField({className, ...props}: InputFieldProps) {
  return (
    <input
      className={cn(
        "h-14 w-full rounded-2xl border border-[#d1d5db] bg-white px-5 text-sm text-[#111827] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] outline-none placeholder:text-[#9ca3af] hover:border-[#9ca3af] focus:border-[#4f46e5]/45 focus:ring-4 focus:ring-[#4f46e5]/10",
        className
      )}
      {...props}
    />
  );
}
