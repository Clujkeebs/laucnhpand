"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Coins, Droplets, Rocket, Wallet } from "lucide-react";
import { Shell } from "@/components/Shell";
import { Alert, Badge, Button, Card, Stat } from "@/components/ui";
import { useWallet } from "@/lib/wallet";
import { explorerUrl, shortAddress } from "@/lib/solana";
import { fetchPortfolio, type Portfolio } from "@/lib/portfolio";
import { listLaunches, type LaunchRecord } from "@/lib/history";

const usd = (value: number | null) =>
  value === null
    ? "—"
    : value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export default function DashboardPage() {
  const { ready, publicKey, keystore, network } = useWallet();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [launches, setLaunches] = useState<LaunchRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLaunches(listLaunches().filter((entry) => entry.network === network));
  }, [network]);

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    setLoading(true);
    fetchPortfolio(network, publicKey)
      .then((data) => {
        if (!cancelled) setPortfolio(data);
      })
      .catch(() => {
        if (!cancelled) setPortfolio(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey, network]);

  if (!ready) return null;

  if (!keystore) {
    return (
      <Shell>
        <div className="mx-auto max-w-lg pt-10">
          <Card title="Start here" description="You need a wallet before anything else works.">
            <p className="mb-5 text-sm leading-relaxed text-ink-300">
              Create one in your browser, or import a key you already have. Then stay on devnet and
              run a full launch end to end — mint, metadata, pool — with free test SOL. Switch to
              mainnet once none of it surprises you.
            </p>
            <Link href="/wallet">
              <Button>
                <span className="flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Set up wallet
                </span>
              </Button>
            </Link>
          </Card>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Dashboard</h1>
          <p className="text-sm text-ink-400">
            {shortAddress(publicKey ?? "", 6)} ·{" "}
            {network === "devnet" ? "Devnet" : "Mainnet"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/launch">
            <Button>
              <span className="flex items-center gap-2">
                <Rocket className="h-4 w-4" />
                Launch token
              </span>
            </Button>
          </Link>
          <Link href="/liquidity">
            <Button variant="ghost">
              <span className="flex items-center gap-2">
                <Droplets className="h-4 w-4" />
                Liquidity
              </span>
            </Button>
          </Link>
        </div>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat
          label="SOL balance"
          value={portfolio ? portfolio.solBalance.toFixed(4) : loading ? "…" : "—"}
          sub={portfolio ? usd(portfolio.solValueUsd) : undefined}
        />
        <Stat
          label="Portfolio value"
          value={usd(portfolio?.totalUsd ?? null)}
          sub={network === "devnet" ? "Devnet tokens have no price" : `${portfolio?.holdings.length ?? 0} tokens`}
        />
        <Stat label="Tokens launched" value={launches.length} sub="On this network" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Your launches" description="Tokens you created from this browser.">
          {launches.length === 0 ? (
            <p className="text-sm text-ink-400">Nothing yet.</p>
          ) : (
            <ul className="space-y-2">
              {launches.slice(0, 8).map((entry) => (
                <li
                  key={entry.mint}
                  className="flex items-center justify-between rounded-lg bg-ink-850 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink-200">
                      {entry.name}{" "}
                      <span className="text-ink-400">{entry.symbol}</span>
                    </p>
                    <p className="font-mono text-[11px] text-ink-400">
                      {shortAddress(entry.mint, 5)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {entry.poolId ? <Badge tone="good">pooled</Badge> : <Badge>no pool</Badge>}
                    <Link
                      href={`/inspect?mint=${entry.mint}`}
                      className="text-ink-400 transition hover:text-mint-400"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Holdings" description="Every SPL token in this wallet.">
          {!portfolio || portfolio.holdings.length === 0 ? (
            <p className="text-sm text-ink-400">{loading ? "Loading…" : "No tokens."}</p>
          ) : (
            <ul className="space-y-2">
              {portfolio.holdings.slice(0, 8).map((holding) => (
                <li
                  key={holding.mint}
                  className="flex items-center justify-between rounded-lg bg-ink-850 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink-200">
                      {holding.symbol ?? shortAddress(holding.mint, 5)}
                    </p>
                    <p className="font-mono text-[11px] tabular-nums text-ink-400">
                      {holding.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm tabular-nums text-ink-200">{usd(holding.valueUsd)}</p>
                    <a
                      href={explorerUrl("token", holding.mint, network)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-ink-400 hover:text-mint-400"
                    >
                      view
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {network === "devnet" ? (
        <div className="mt-5">
          <Alert tone="info">
            <span className="flex items-center gap-2">
              <Coins className="h-3.5 w-3.5 shrink-0" />
              You&apos;re on devnet. Everything here is free and none of it is real — the right place
              to make your mistakes.
            </span>
          </Alert>
        </div>
      ) : null}
    </Shell>
  );
}
