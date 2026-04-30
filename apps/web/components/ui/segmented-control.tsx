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
    <div className="inline-flex rounded-2xl border border-[#e5e7eb] bg-white p-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-xl px-4 py-2.5 text-xs font-medium transition-all duration-200",
            value === option.value
              ? "bg-[#eef2ff] text-[#3730a3] shadow-[0_8px_18px_rgba(79,70,229,0.12)]"
              : "text-[#6b7280] hover:text-[#111827]"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
