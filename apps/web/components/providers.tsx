"use client";

import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {WagmiProvider} from "wagmi";
import {useState} from "react";
import {ToastContainer} from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {wagmiConfig} from "@/lib/wagmi";

export function Providers({children}: {children: unknown}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig as never}>
      <QueryClientProvider client={queryClient}>
        {children as never}
        <ToastContainer
          position="top-right"
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          limit={5}
          theme="light"
          hideProgressBar
          className="zk-toastify-root"
        />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
