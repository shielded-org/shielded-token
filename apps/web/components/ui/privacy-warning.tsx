import {TriangleAlert} from "lucide-react";

export function PrivacyWarning({
  message,
  variant = "warning",
}: {
  message: string;
  variant?: "info" | "warning" | "critical";
}) {
  const variantClasses = {
    info: "border-[#93c5fd] bg-[#eff6ff] text-[#1e3a8a]",
    warning: "border-amber-300 bg-[#fffbeb] text-[#92400e]",
    critical: "border-red-300 bg-red-50 text-red-800",
  };

  const iconClasses = {
    info: "text-[#2563eb]",
    warning: "text-amber-600",
    critical: "text-red-600",
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
