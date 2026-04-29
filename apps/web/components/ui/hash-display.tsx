"use client";

import {Check, Copy} from "lucide-react";
import {useState} from "react";
import {copyText, shortenHash} from "@/lib/utils";
import {cn} from "@/lib/utils";

type HashDisplayProps = {
  value: string;
  className?: string;
};

export function HashDisplay({value, className}: HashDisplayProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await copyText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "group inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 font-mono text-xs text-[#cccccc] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition hover:-translate-y-0.5 hover:border-[#0047ab]/20 hover:bg-white/[0.05]",
        className
      )}
      title={value}
    >
      <span>{shortenHash(value)}</span>
      {copied ? (
        <Check className="size-3.5 text-[#0047ab]" />
      ) : (
        <Copy className="size-3.5 text-[#666666] transition group-hover:text-[#0047ab]" />
      )}
    </button>
  );
}
