import {cn} from "@/lib/utils";

type Option<T extends string> = {
  label: string;
  value: T;
};

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
}) {
  return (
    <div className="inline-flex rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-xl px-4 py-2.5 text-xs font-semibold transition-all duration-200 app-focus-ring",
            value === option.value
              ? "bg-[var(--brand-accent-soft)] text-[var(--brand-accent)] shadow-[0_8px_18px_rgba(79,70,229,0.14)]"
              : "text-[var(--brand-muted)] hover:text-[var(--brand-fg)]"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
