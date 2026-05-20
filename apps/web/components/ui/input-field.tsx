import {cn} from "@/lib/utils";

type InputFieldProps = React.InputHTMLAttributes<HTMLInputElement>;

export function InputField({className, ...props}: InputFieldProps) {
  return (
    <input
      className={cn(
        "h-14 w-full rounded-2xl border border-[var(--brand-border-solid)] bg-[var(--brand-surface)] px-5 text-sm text-[var(--brand-fg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] outline-none placeholder:text-[var(--brand-muted)] hover:border-[var(--brand-accent)]/35 focus:border-[var(--brand-accent)]/45 focus:ring-4 focus:ring-[var(--brand-accent-soft)] app-focus-ring",
        className
      )}
      {...props}
    />
  );
}
