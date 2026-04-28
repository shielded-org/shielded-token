import {InputHTMLAttributes, ReactNode} from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  mono?: boolean;
  rightSlot?: ReactNode;
};

export function Input({mono = false, rightSlot, className = "", ...props}: Props) {
  if (!rightSlot) {
    return <input className={`input ${mono ? "input-mono" : ""} ${className}`.trim()} {...props} />;
  }
  return (
    <div className="input-with-slot">
      <input className={`input ${mono ? "input-mono" : ""} ${className}`.trim()} {...props} />
      <div className="input-slot">{rightSlot}</div>
    </div>
  );
}
