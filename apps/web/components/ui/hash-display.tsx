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
        "group inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-3 py-1.5 font-mono text-xs text-[#374151] transition hover:-translate-y-0.5 hover:border-[#a5b4fc] hover:bg-[#f8fafc]",
        className
      )}
      title={value}
    >
      <span>{shortenHash(value)}</span>
      {copied ? (
        <Check className="size-3.5 text-[#4f46e5]" />
      ) : (
        <Copy className="size-3.5 text-[#9ca3af] transition group-hover:text-[#4f46e5]" />
      )}
    </button>
  );
}
