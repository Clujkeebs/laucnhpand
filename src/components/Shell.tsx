"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Coins,
  Droplets,
  LayoutDashboard,
  LogOut,
  Search,
  Wallet as WalletIcon,
  Lock as LockIcon,
} from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { shortAddress, usingPublicRpc } from "@/lib/solana";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/launch", label: "Launch", icon: Coins },
  { href: "/liquidity", label: "Liquidity", icon: Droplets },
  { href: "/inspect", label: "Inspect", icon: Search },
  { href: "/wallet", label: "Wallet", icon: WalletIcon },
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { network, setNetwork, publicKey, keypair, balanceSol, lock } = useWallet();

  async function signOut() {
    lock();
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-ink-700 lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between p-5 lg:block">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="rounded-lg bg-mint-900 p-1.5">
              <Coins className="h-4 w-4 text-mint-400" />
            </div>
            <span className="text-sm font-semibold text-white">Launchpad</span>
          </Link>

          <nav className="flex gap-1 lg:mt-7 lg:flex-col">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? "bg-ink-800 font-medium text-white"
                      : "text-ink-300 hover:bg-ink-850 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden lg:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="hidden space-y-3 p-5 lg:block">
          <div className="card p-3">
            <p className="mb-2 text-[11px] font-medium text-ink-400">Network</p>
            <div className="flex gap-1">
              {(["devnet", "mainnet-beta"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setNetwork(option)}
                  className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                    network === option
                      ? option === "devnet"
                        ? "bg-mint-900 text-mint-400"
                        : "bg-warn-500/15 text-warn-500"
                      : "text-ink-400 hover:text-ink-200"
                  }`}
                >
                  {option === "devnet" ? "Devnet" : "Mainnet"}
                </button>
              ))}
            </div>
            {network === "mainnet-beta" && usingPublicRpc(network) ? (
              <p className="mt-2 text-[10px] leading-snug text-warn-500">
                Public RPC — set NEXT_PUBLIC_MAINNET_RPC before launching.
              </p>
            ) : null}
          </div>

          {publicKey ? (
            <div className="card p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-ink-400">Wallet</p>
                {keypair ? (
                  <span className="text-[10px] text-mint-400">unlocked</span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] text-ink-400">
                    <LockIcon className="h-2.5 w-2.5" />
                    locked
                  </span>
                )}
              </div>
              <p className="mt-1.5 font-mono text-xs text-ink-200">{shortAddress(publicKey, 5)}</p>
              <p className="mt-0.5 text-[11px] tabular-nums text-ink-400">
                {balanceSol === null ? "—" : `${balanceSol.toFixed(4)} SOL`}
              </p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-ink-400 transition hover:text-danger-500"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-5 lg:p-8">{children}</main>
    </div>
  );
}
