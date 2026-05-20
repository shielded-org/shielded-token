import type {Metadata} from "next";
import {Providers} from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Shielded — EVM privacy protocol",
    template: "%s · Shielded",
  },
  description:
    "Private payments on Ethereum. Hold a shielded balance, send without public receipts, withdraw when you are ready.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
