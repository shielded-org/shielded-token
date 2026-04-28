import {HTMLAttributes} from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
};

export function Card({interactive = false, className = "", ...props}: Props) {
  return <div className={`card ${interactive ? "card-interactive" : ""} ${className}`.trim()} {...props} />;
}
