"use client";

import {useEffect, useState} from "react";

/** Avoid SSR/client HTML mismatches for UI that depends on `window`, injected wallets, or post-persist state. */
export function useHasMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
