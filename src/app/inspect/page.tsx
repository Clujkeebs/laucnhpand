"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Shell } from "@/components/Shell";
import { ReportSheet } from "@/components/ReportSheet";
import { Button, Copyable, Datum, ExternalRef, Note, Panel, Spinner } from "@/components/ui";
import { useWallet } from "@/lib/wallet";
import { explorerUrl, shortAddress } from "@/lib/solana";
import { fetchMintStatus, type MintStatus } from "@/lib/token";
import { fetchTopHolders, type HolderRow } from "@/lib/portfolio";
import { reportObservedToken, type Report } from "@/lib/report";
import { isValidMint } from "@/lib/pool";

export default function InspectPage() {
  return (
    <Shell
      title="Examine"
      standfirst="Point at any mint on this network and read what it actually is — authorities, supply, and who holds it. Run it on other people's tokens, and on your own before anyone else does."
    >
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
  const [report, setReport] = useState<Report | null>(null);
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
      setReport(null);
      try {
        const [mintStatus, holderData] = await Promise.all([
          fetchMintStatus(network, mint),
          fetchTopHolders(network, mint).catch(() => null),
        ]);
        setStatus(mintStatus);
        setHolders(holderData);
        setReport(
          reportObservedToken({
            mintAuthority: mintStatus.mintAuthority,
            freezeAuthority: mintStatus.freezeAuthority,
            hasMetadata: Boolean(mintStatus.name),
            topTenShare: holderData
              ? holderData.rows.slice(0, 10).reduce((sum, row) => sum + row.share, 0)
              : null,
            largestShare: holderData?.rows[0]?.share ?? null,
          }),
        );
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

  return (
    <div className="max-w-6xl">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(query.trim());
        }}
        className="mb-10 flex max-w-2xl items-end gap-4"
      >
        <div className="flex-1">
          <span className="eyebrow mb-2 block">Mint address</span>
          <input
            className="ctl"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Paste any SPL mint address"
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? <Spinner /> : <Search className="h-3.5 w-3.5" />}
          Examine
        </Button>
      </form>

      {error ? (
        <div className="max-w-2xl">
          <Note tone="signal">{error}</Note>
        </div>
      ) : null}

      {status && report ? (
        <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr]">
          <div className="space-y-11">
            <Panel
              index="01"
              eyebrow="Subject"
              title={status.name ? `${status.name} · ${status.symbol}` : "Unnamed token"}
              aside={
                <ExternalRef href={explorerUrl("token", status.mint, network)}>Solscan</ExternalRef>
              }
            >
              <dl className="space-y-2">
                <Datum label="Mint">{shortAddress(status.mint, 6)}</Datum>
                <Datum label="Supply">
                  {uiSupply.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </Datum>
                <Datum label="Decimals">{status.decimals}</Datum>
                <Datum label="Mint authority">
                  {status.mintAuthority ? shortAddress(status.mintAuthority, 4) : "revoked"}
                </Datum>
                <Datum label="Freeze authority">
                  {status.freezeAuthority ? shortAddress(status.freezeAuthority, 4) : "revoked"}
                </Datum>
              </dl>
              <div className="mt-5">
                <Copyable value={status.mint} label="Copy mint address" />
              </div>
            </Panel>

            {holders && holders.rows.length > 0 ? (
              <Panel index="02" eyebrow="Distribution" title="Who holds it">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-[1.5px] border-[color:var(--rule-hard)]">
                      <th className="eyebrow pb-2 text-left">#</th>
                      <th className="eyebrow pb-2 text-left">Owner</th>
                      <th className="eyebrow pb-2 text-right">Balance</th>
                      <th className="eyebrow pb-2 text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holders.rows.map((row, index) => (
                      <tr key={`${row.owner}-${index}`} className="border-b border-rule">
                        <td className="data py-2 text-[11px] text-ink-faint">
                          {String(index + 1).padStart(2, "0")}
                        </td>
                        <td className="py-2">
                          <ExternalRef href={explorerUrl("address", row.owner, network)}>
                            {shortAddress(row.owner, 5)}
                          </ExternalRef>
                        </td>
                        <td className="data py-2 text-right text-[12px]">
                          {row.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td className="data py-2 text-right text-[12px]">
                          {(row.share * 100).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-5">
                  <Note>
                    Liquidity pool accounts show up in this list too — a large pool balance is not
                    the same as one wallet holding the float.
                  </Note>
                </div>
              </Panel>
            ) : null}
          </div>

          <div className="lg:sticky lg:top-12 lg:self-start">
            <ReportSheet report={report} heading="Examination report" />
          </div>
        </div>
      ) : null}

      {!status && !busy && !error ? (
        <div className="max-w-2xl">
          <Note>
            Mint authority, freeze authority and holder concentration catch most of what goes
            wrong with a token. They take one lookup and they are the same three things a buyer
            will check on yours.
          </Note>
        </div>
      ) : null}
    </div>
  );
}
