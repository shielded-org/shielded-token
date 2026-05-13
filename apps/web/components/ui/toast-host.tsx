"use client";

import {CheckCircle2, Info, X, XCircle} from "lucide-react";
import {useCallback, useEffect, useState} from "react";
import {setToastPush} from "@/lib/toast";
import {cn} from "@/lib/utils";

type Kind = "success" | "error" | "info";

type Item = {id: string; kind: Kind; message: string};

export function ToastHost({children}: {children: React.ReactNode}) {
  const [items, setItems] = useState<Item[]>([]);

  const remove = useCallback((id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (kind: Kind, message: string, durationMs = 6000) => {
      const id = crypto.randomUUID();
      setItems((xs) => [...xs, {id, kind, message}].slice(-5));
      window.setTimeout(() => remove(id), durationMs);
    },
    [remove]
  );

  useEffect(() => {
    setToastPush(push);
    return () => setToastPush(null);
  }, [push]);

  return (
    <>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex max-h-screen flex-col items-end gap-2 overflow-y-auto p-3 sm:p-4"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex max-w-[min(100vw-1.5rem,24rem)] items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-[0_12px_40px_rgba(15,23,42,0.12)] toast-host-enter",
              t.kind === "success" && "border-emerald-200/80 bg-white text-emerald-950",
              t.kind === "error" && "border-red-200/90 bg-white text-red-950",
              t.kind === "info" && "border-[#e5e7eb] bg-white text-[#111827]"
            )}
          >
            {t.kind === "success" ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
            ) : t.kind === "error" ? (
              <XCircle className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden />
            ) : (
              <Info className="mt-0.5 size-5 shrink-0 text-[#4f46e5]" aria-hidden />
            )}
            <p className="min-w-0 flex-1 leading-relaxed">{t.message}</p>
            <button
              type="button"
              className="shrink-0 rounded-md p-1 text-[#9ca3af] hover:bg-black/5 hover:text-[#374151]"
              aria-label="Dismiss notification"
              onClick={() => remove(t.id)}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
