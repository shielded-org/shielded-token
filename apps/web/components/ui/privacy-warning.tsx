import {TriangleAlert} from "lucide-react";

export function PrivacyWarning({
  message,
  variant = "warning",
}: {
  message: string;
  variant?: "info" | "warning" | "critical";
}) {
  const variantClasses = {
    info: "border-[#0047ab]/20 bg-[#0047ab]/10 text-[#c8daff]",
    warning: "border-amber-400/18 bg-[linear-gradient(180deg,rgba(251,191,36,0.12),rgba(251,191,36,0.05))] text-amber-100",
    critical: "border-red-400/20 bg-red-500/10 text-red-100",
  };

  const iconClasses = {
    info: "text-[#4d7fd6]",
    warning: "text-amber-400",
    critical: "text-red-400",
  };

  return (
    <div className={`rounded-[24px] border p-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${variantClasses[variant]}`}>
      <div className="flex items-start gap-3">
        <TriangleAlert className={`mt-0.5 size-4 shrink-0 ${iconClasses[variant]}`} />
        <p className="leading-6">{message}</p>
      </div>
    </div>
  );
}
