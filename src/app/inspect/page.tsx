"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Search } from "lucide-react";
import { Shell } from "@/components/Shell";
import { Alert, Badge, Button, Card, Copyable, ExternalRef, Spinner } from "@/components/ui";
import { useWallet } from "@/lib/wallet";
import { explorerUrl, shortAddress } from "@/lib/solana";
import { fetchMintStatus, type MintStatus } from "@/lib/token";
import { fetchTopHolders, type HolderRow } from "@/lib/portfolio";
import { isValidMint } from "@/lib/pool";

export default function InspectPage() {
  return (
    <Shell>
      <h1 className="mb-1 text-xl font-semibold text-white">Inspect a token</h1>
      <p className="mb-7 text-sm text-ink-400">
        Authorities, supply and holder concentration — read straight off the chain.
      </p>
      <Suspense fallback={null}>
        <Inspector />
      </Suspense>
    </Shell>
  );
}

function Inspector() {
  const params = useSearchParams();
  const { network } = useWallet();
  const [query, setQuery] = useState(params.get("mint") ?? "");
  const [status, setStatus] = useState<MintStatus | null>(null);
  const [holders, setHolders] = useState<{ rows: HolderRow[]; supply: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (mint: string) => {
      if (!isValidMint(mint)) {
        setError("That isn't a valid mint address.");
        return;
      }
      setBusy(true);
      setError(null);
      setStatus(null);
      setHolders(null);
      try {
        const [mintStatus, holderData] = await Promise.all([
          fetchMintStatus(network, mint),
          fetchTopHolders(network, mint).catch(() => null),
        ]);
        setStatus(mintStatus);
        setHolders(holderData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lookup failed.");
      } finally {
        setBusy(false);
      }
    },
    [network],
  );

  useEffect(() => {
    const initial = params.get("mint");
    if (initial) void run(initial);
  }, [params, run]);

  const uiSupply = status ? Number(status.supply) / 10 ** status.decimals : 0;
  const topTenShare = holders
    ? holders.rows.slice(0, 10).reduce((sum, row) => sum + row.share, 0)
    : 0;

  return (
    <div className="max-w-4xl space-y-5">
      <Card>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(query.trim());
          }}
          className="flex gap-2"
        >
          <input
            className="field font-mono text-xs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Paste any SPL mint address"
          />
          <Button type="submit" disabled={busy}>
            <span className="flex items-center gap-2">
              {busy ? <Spinner /> : <Search className="h-3.5 w-3.5" />}
              Check
            </span>
          </Button>
        </form>
        {error ? (
          <div className="mt-3">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}
      </Card>

      {status ? (
        <>
          <Card
            title={status.name ? `${status.name} (${status.symbol})` : "Unnamed token"}
            action={<ExternalRef href={explorerUrl("token", status.mint, network)}>Solscan</ExternalRef>}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs text-ink-400">Mint</p>
                <Copyable value={status.mint} label={shortAddress(status.mint, 8)} />
              </div>
              <div>
                <p className="mb-1.5 text-xs text-ink-400">Supply</p>
                <p className="font-mono text-sm text-ink-200">
                  {uiSupply.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <Signal
                ok={status.mintAuthority === null}
                okText="Mint authority revoked — supply is fixed"
                badText={`Mint authority still active (${shortAddress(status.mintAuthority ?? "", 4)}). More tokens can be created at any time.`}
              />
              <Signal
                ok={status.freezeAuthority === null}
                okText="Freeze authority revoked — accounts can't be frozen"
                badText={`Freeze authority still active (${shortAddress(status.freezeAuthority ?? "", 4)}). Holder accounts can be frozen, blocking sells.`}
              />
              {holders ? (
                <Signal
                  ok={topTenShare < 0.5}
                  okText={`Top 10 accounts hold ${(topTenShare * 100).toFixed(1)}% of supply`}
                  badText={`Top 10 accounts hold ${(topTenShare * 100).toFixed(1)}% of supply — highly concentrated`}
                />
              ) : null}
            </div>
          </Card>

          {holders && holders.rows.length > 0 ? (
            <Card title="Top holders" description="Largest token accounts, by balance.">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-ink-700 text-left text-ink-400">
                      <th className="pb-2 font-medium">#</th>
                      <th className="pb-2 font-medium">Owner</th>
                      <th className="pb-2 text-right font-medium">Amount</th>
                      <th className="pb-2 text-right font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holders.rows.map((row, index) => (
                      <tr key={`${row.owner}-${index}`} className="border-b border-ink-800/60">
                        <td className="py-2 text-ink-400">{index + 1}</td>
                        <td className="py-2">
                          <ExternalRef href={explorerUrl("address", row.owner, network)}>
                            {shortAddress(row.owner, 6)}
                          </ExternalRef>
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-ink-200">
                          {row.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-ink-200">
                          {(row.share * 100).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}

      {!status && !busy ? (
        <Alert tone="info">
          These three checks — mint authority, freeze authority, holder concentration — catch most
          of what goes wrong with a token. Run them on anything before you put money in, and expect
          people to run them on yours.
        </Alert>
      ) : null}
    </div>
  );
}

function Signal({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) {
  return (
    <div className="flex items-start gap-2.5">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint-400" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn-500" />
      )}
      <p className={`text-xs leading-relaxed ${ok ? "text-ink-300" : "text-warn-500"}`}>
        {ok ? okText : badText}
      </p>
    </div>
  );
}
