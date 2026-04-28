import {ButtonHTMLAttributes} from "react";

type ButtonVariant = "primary" | "ghost" | "danger" | "icon";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

export function Button({variant = "primary", className = "", fullWidth = true, ...props}: Props) {
  const widthClass = fullWidth ? "btn-full" : "";
  return <button className={`btn btn-${variant} ${widthClass} ${className}`.trim()} {...props} />;
}
