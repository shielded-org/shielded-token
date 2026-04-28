import {HTMLAttributes} from "react";

type Variant = "private" | "public" | "network" | "success" | "warning" | "danger";

type Props = HTMLAttributes<HTMLSpanElement> & {
  variant: Variant;
};

export function Badge({variant, className = "", ...props}: Props) {
  return <span className={`badge badge-${variant} ${className}`.trim()} {...props} />;
}
