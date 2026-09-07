import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet";

export const metadata: Metadata = {
  title: "Launchpad",
  description: "Personal Solana token launcher",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
