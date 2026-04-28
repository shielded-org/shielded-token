import {cn} from "@/lib/utils";

type InputFieldProps = React.InputHTMLAttributes<HTMLInputElement>;

export function InputField({className, ...props}: InputFieldProps) {
  return (
    <input
      className={cn(
        "h-14 w-full rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.012))] px-5 text-sm text-[#f2f2f2] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] outline-none placeholder:text-[#444444] hover:border-white/12 focus:border-[#7df9ff]/35 focus:ring-4 focus:ring-[#7df9ff]/10",
        className
      )}
      {...props}
    />
  );
}
