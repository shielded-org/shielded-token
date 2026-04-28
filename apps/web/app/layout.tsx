import type {Metadata} from "next";
import {AppShell} from "@/components/layout/app-shell";
import {Providers} from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shielded Token",
  description: "Privacy-first DeFi interface for shielded transfers on Ethereum.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
