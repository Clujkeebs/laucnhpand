"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Button, Datum, ExternalRef, Figure, Note, Panel, Tag } from "@/components/ui";
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
      .then((data) => !cancelled && setPortfolio(data))
      .catch(() => !cancelled && setPortfolio(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [publicKey, network]);

  if (!ready) return null;

  if (!keystore) {
    return (
      <Shell
        title="No wallet yet"
        standfirst="Everything here signs with a key held in this browser. Create one, then run a full issuance on the test network before you touch the live one."
      >
        <div className="max-w-xl">
          <Panel index="01" eyebrow="First step" title="Set up custody">
            <p className="mb-6 text-[13.5px] leading-relaxed text-ink-soft">
              The key is generated locally and encrypted with a passphrase only you hold. It never
              reaches the server, and there is no recovery — which is the trade for nobody else
              having it.
            </p>
            <Link href="/wallet">
              <Button>Create a wallet</Button>
            </Link>
          </Panel>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Ledger" standfirst={`${shortAddress(publicKey ?? "", 6)} · ${network === "devnet" ? "test network" : "live network"}`}>
      <div className="mb-11 flex flex-wrap gap-2.5">
        <Link href="/launch">
          <Button>Issue a token</Button>
        </Link>
        <Link href="/liquidity">
          <Button variant="quiet">Open a market</Button>
        </Link>
        <Link href="/inspect">
          <Button variant="quiet">Examine</Button>
        </Link>
      </div>

      <div className="mb-12 grid gap-7 sm:grid-cols-3">
        <Figure
          label="SOL balance"
          value={portfolio ? portfolio.solBalance.toFixed(4) : loading ? "…" : "—"}
          note={portfolio ? usd(portfolio.solValueUsd) : undefined}
        />
        <Figure
          label="Portfolio"
          value={usd(portfolio?.totalUsd ?? null)}
          note={
            network === "devnet"
              ? "Test tokens have no price"
              : `${portfolio?.holdings.length ?? 0} positions`
          }
        />
        <Figure label="Tokens issued" value={launches.length} note="On this network" />
      </div>

      <div className="grid gap-11 lg:grid-cols-2">
        <Panel index="01" eyebrow="Issuance" title="Your tokens">
          {launches.length === 0 ? (
            <p className="annot">Nothing issued from this browser yet.</p>
          ) : (
            <ul>
              {launches.slice(0, 8).map((entry) => (
                <li
                  key={entry.mint}
                  className="flex items-baseline justify-between gap-4 border-b border-rule py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">
                      {entry.name}{" "}
                      <span className="data text-[11px] font-normal text-ink-faint">
                        {entry.symbol}
                      </span>
                    </p>
                    <p className="data mt-0.5 text-[11px] text-ink-faint">
                      {shortAddress(entry.mint, 5)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-3">
                    {entry.poolId ? <Tag tone="verify">Market</Tag> : <Tag>No market</Tag>}
                    <Link href={`/inspect?mint=${entry.mint}`} className="eyebrow hover:text-ink">
                      Examine
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel index="02" eyebrow="Custody" title="Holdings">
          {!portfolio || portfolio.holdings.length === 0 ? (
            <p className="annot">{loading ? "Reading accounts…" : "No token accounts."}</p>
          ) : (
            <dl className="space-y-2.5">
              {portfolio.holdings.slice(0, 9).map((holding) => (
                <Datum
                  key={holding.mint}
                  label={holding.symbol ?? shortAddress(holding.mint, 5)}
                >
                  {holding.valueUsd === null
                    ? holding.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })
                    : usd(holding.valueUsd)}
                </Datum>
              ))}
            </dl>
          )}
          {portfolio && portfolio.holdings.length > 0 ? (
            <div className="mt-5">
              <ExternalRef href={explorerUrl("address", publicKey ?? "", network)}>
                Full account on Solscan
              </ExternalRef>
            </div>
          ) : null}
        </Panel>
      </div>

      {network === "devnet" ? (
        <div className="mt-11 max-w-xl">
          <Note>
            You are on the test network. Everything here is free and none of it is real — which
            makes it the right place to make your mistakes.
          </Note>
        </div>
      ) : null}
    </Shell>
  );
}
