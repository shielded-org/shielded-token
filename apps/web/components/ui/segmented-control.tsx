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
    <div className="inline-flex rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.008))] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-xl px-4 py-2.5 text-xs font-medium transition-all duration-200",
            value === option.value
              ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] text-[#f2f2f2] shadow-[0_10px_24px_rgba(0,0,0,0.24)]"
              : "text-[#666666] hover:text-[#cccccc]"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
