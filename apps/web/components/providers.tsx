"use client";

import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {WagmiProvider} from "wagmi";
import {useState} from "react";
import {wagmiConfig} from "@/lib/wagmi";

export function Providers({children}: {children: unknown}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig as never}>
      <QueryClientProvider client={queryClient}>{children as never}</QueryClientProvider>
    </WagmiProvider>
  );
}
