"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useWallet } from "@/lib/wallet";
import { useTheme } from "@/lib/theme";
import { shortAddress, usingPublicRpc } from "@/lib/solana";
import { Datum } from "./ui";
import { Logo } from "./Logo";

const NAV = [
  { href: "/", plate: "00", label: "Ledger" },
  { href: "/launch", plate: "01", label: "Issue" },
  { href: "/liquidity", plate: "02", label: "Market" },
  { href: "/inspect", plate: "03", label: "Examine" },
  { href: "/bridge", plate: "04", label: "Bridge" },
  { href: "/wallet", plate: "05", label: "Custody" },
];

export function Shell({
  title,
  standfirst,
  children,
}: {
  title: string;
  standfirst?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { network, setNetwork, publicKey, keypair, balanceSol } = useWallet();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen lg:flex">
      <aside className="shrink-0 border-b border-rule px-6 py-5 lg:h-screen lg:w-[248px] lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-7 lg:py-8">
        <div className="flex items-start justify-between lg:block">
          <Link href="/" className="block">
            <span className="flex items-center gap-2.5">
              <Logo size={26} />
              <span className="display text-[30px] leading-none">Launchpad</span>
            </span>
            <span className="eyebrow mt-2 block">Solana · Issuance desk</span>
          </Link>

          <button
            type="button"
            onClick={toggle}
            title={theme === "dark" ? "Switch to paper" : "Switch to dark"}
            className="border border-rule p-1.5 text-ink-soft transition hover:border-ink hover:text-ink lg:mt-6"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>

        <nav className="mt-6 flex gap-4 border-t border-rule pt-4 lg:mt-8 lg:flex-col lg:gap-0 lg:pt-5">
          {NAV.map(({ href, plate, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`group flex items-baseline gap-2.5 lg:border-b lg:border-rule lg:py-2.5 ${
                  active ? "text-ink" : "text-ink-faint hover:text-ink"
                }`}
              >
                <span className="data text-[10px]">{plate}</span>
                <span
                  className={`text-[15px] ${active ? "font-semibold" : "font-normal"}`}
                >
                  {label}
                </span>
                {active ? <span className="ml-auto hidden text-[10px] lg:inline">●</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-7 hidden lg:block">
          <p className="eyebrow mb-2.5">Network</p>
          <div className="flex border border-rule">
            {(["devnet", "mainnet-beta"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setNetwork(option)}
                className={`data flex-1 py-1.5 text-[10px] uppercase tracking-[0.12em] transition ${
                  network === option
                    ? "bg-ink text-paper"
                    : "text-ink-faint hover:text-ink"
                }`}
              >
                {option === "devnet" ? "Test" : "Live"}
              </button>
            ))}
          </div>
          {network === "mainnet-beta" && usingPublicRpc(network) ? (
            <p className="mt-2 text-[10.5px] leading-snug text-signal">
              Public RPC — set a dedicated endpoint before issuing.
            </p>
          ) : null}
        </div>

        {publicKey ? (
          <dl className="mt-6 hidden space-y-1.5 border-t border-rule pt-4 lg:block">
            <Datum label="Key">{shortAddress(publicKey, 4)}</Datum>
            <Datum label="State">{keypair ? "open" : "sealed"}</Datum>
            <Datum label="SOL">{balanceSol === null ? "—" : balanceSol.toFixed(4)}</Datum>
          </dl>
        ) : null}

        <button
          type="button"
          onClick={signOut}
          className="eyebrow mt-6 hidden hover:text-signal lg:block"
        >
          Sign out
        </button>
      </aside>

      <main className="min-w-0 flex-1 px-6 py-8 lg:px-12 lg:py-12">
        <header className="mb-9 border-b-[1.5px] border-[color:var(--rule-hard)] pb-6">
          <h1 className="display text-[clamp(38px,5.5vw,60px)]">{title}</h1>
          {standfirst ? <p className="annot mt-3 max-w-[54ch]">{standfirst}</p> : null}
        </header>
        {children}
      </main>
    </div>
  );
}
