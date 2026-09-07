"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Droplets, Lock } from "lucide-react";
import { Shell } from "@/components/Shell";
import { WalletGate } from "@/components/WalletGate";
import { Button, Copyable, Datum, ExternalRef, Field, Note, Panel, Spinner } from "@/components/ui";
import { useWallet } from "@/lib/wallet";
import { explorerUrl } from "@/lib/solana";
import { createLiquidityPool, isValidMint, lockLiquidity } from "@/lib/pool";
import { fetchMintStatus } from "@/lib/token";
import { listLaunches, updateLaunch } from "@/lib/history";

export default function LiquidityPage() {
  return (
    <Shell
      title="Open a market"
      standfirst="Pairs your token with SOL on Raydium so it has a price and can be traded. The SOL side is real capital leaving your wallet."
    >
      <WalletGate>
        <Suspense fallback={null}>
          <div className="grid max-w-6xl gap-11 lg:grid-cols-2">
            <CreatePool />
            <LockLp />
          </div>
        </Suspense>
      </WalletGate>
    </Shell>
  );
}

function CreatePool() {
  const params = useSearchParams();
  const { keypair, network, refreshBalance } = useWallet();

  const [mint, setMint] = useState(params.get("mint") ?? "");
  const [decimals, setDecimals] = useState<number | null>(
    params.get("decimals") ? Number(params.get("decimals")) : null,
  );
  const [tokenAmount, setTokenAmount] = useState("");
  const [solAmount, setSolAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ poolId: string; lpMint: string; signature: string } | null>(
    null,
  );

  // Decimals must match the mint exactly, so read them from chain rather than trusting input.
  useEffect(() => {
    if (!isValidMint(mint)) {
      setDecimals(null);
      return;
    }
    let cancelled = false;
    fetchMintStatus(network, mint)
      .then((status) => !cancelled && setDecimals(status.decimals))
      .catch(() => !cancelled && setDecimals(null));
    return () => {
      cancelled = true;
    };
  }, [mint, network]);

  const impliedPrice =
    Number(tokenAmount) > 0 && Number(solAmount) > 0
      ? Number(solAmount) / Number(tokenAmount)
      : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!keypair) return;
    setError(null);
    setBusy(true);
    try {
      if (!isValidMint(mint)) throw new Error("That isn't a valid mint address.");
      if (decimals === null) throw new Error("Couldn't read the mint's decimals on this network.");
      if (Number(tokenAmount) <= 0 || Number(solAmount) <= 0) {
        throw new Error("Both sides of the pool need a positive amount.");
      }

      const pool = await createLiquidityPool(network, keypair, {
        mint,
        decimals,
        tokenAmount,
        solAmount,
      });
      updateLaunch(mint, { poolId: pool.poolId, lpMint: pool.lpMint });
      setResult(pool);
      void refreshBalance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pool creation failed.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Panel index="01" eyebrow="Open" title="The market exists">
        <div className="space-y-4">
          <div>
            <p className="eyebrow mb-1.5">Pool</p>
            <Copyable value={result.poolId} />
          </div>
          <div>
            <p className="eyebrow mb-1.5">LP mint</p>
            <Copyable value={result.lpMint} />
          </div>
          <ExternalRef href={explorerUrl("tx", result.signature, network)}>Transaction</ExternalRef>
          <Note>
            The SOL you added is now buyable supply. Anyone can trade against this pool and the
            price moves with them.
          </Note>
          <Button variant="quiet" onClick={() => setResult(null)}>
            Open another
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel index="01" eyebrow="Pool" title="Create" note="Raydium CPMM, paired against SOL.">
      <form onSubmit={submit} className="space-y-6">
        <Field label="Token mint" hint={decimals === null ? undefined : `${decimals} decimals`}>
          <input
            className="ctl"
            value={mint}
            onChange={(event) => setMint(event.target.value.trim())}
            placeholder="Mint address"
          />
        </Field>

        <MintPicker onPick={setMint} />

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Token amount">
            <input
              className="ctl"
              value={tokenAmount}
              onChange={(event) => setTokenAmount(event.target.value)}
              inputMode="decimal"
              placeholder="800000000"
            />
          </Field>
          <Field label="SOL amount">
            <input
              className="ctl"
              value={solAmount}
              onChange={(event) => setSolAmount(event.target.value)}
              inputMode="decimal"
              placeholder="5"
            />
          </Field>
        </div>

        {impliedPrice ? (
          <dl>
            <Datum label="Opening price, SOL">{impliedPrice.toExponential(4)}</Datum>
          </dl>
        ) : null}

        <Note tone="flag">
          The SOL side is real money that leaves your wallet. You get it back only by withdrawing
          liquidity — which, once people have bought in, means selling into them.
        </Note>

        {error ? <Note tone="signal">{error}</Note> : null}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? <Spinner /> : <Droplets className="h-3.5 w-3.5" />}
          {busy ? "Creating pool…" : "Create pool"}
        </Button>
      </form>
    </Panel>
  );
}

function LockLp() {
  const { keypair, network } = useWallet();
  const [poolId, setPoolId] = useState("");
  const [lpAmount, setLpAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!keypair) return;
    setError(null);
    setBusy(true);
    try {
      if (!isValidMint(poolId)) throw new Error("That isn't a valid pool ID.");
      if (Number(lpAmount) <= 0) throw new Error("Enter an LP amount to lock.");
      setSignature(await lockLiquidity(network, keypair, poolId, lpAmount));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lock failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      index="02"
      eyebrow="Commitment"
      title="Lock LP"
      note="Permanently commits liquidity so it cannot be withdrawn."
    >
      {signature ? (
        <div className="space-y-4">
          <Note tone="verify">Liquidity locked. This cannot be undone.</Note>
          <ExternalRef href={explorerUrl("tx", signature, network)}>Transaction</ExternalRef>
          <Button variant="quiet" onClick={() => setSignature(null)}>
            Lock more
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-6">
          <Field label="Pool ID">
            <input
              className="ctl"
              value={poolId}
              onChange={(event) => setPoolId(event.target.value.trim())}
              placeholder="Pool address"
            />
          </Field>
          <Field label="LP amount to lock">
            <input
              className="ctl"
              value={lpAmount}
              onChange={(event) => setLpAmount(event.target.value)}
              inputMode="decimal"
            />
          </Field>

          <Note>
            Locked liquidity is the difference between a pool people will buy into and one they
            won&apos;t. It is also irreversible: that SOL is not coming back to you.
          </Note>

          {error ? <Note tone="signal">{error}</Note> : null}

          <Button type="submit" variant="quiet" disabled={busy} className="w-full">
            {busy ? <Spinner /> : <Lock className="h-3.5 w-3.5" />}
            {busy ? "Locking…" : "Lock liquidity"}
          </Button>
        </form>
      )}
    </Panel>
  );
}

function MintPicker({ onPick }: { onPick: (mint: string) => void }) {
  const { network } = useWallet();
  const [launches, setLaunches] = useState<ReturnType<typeof listLaunches>>([]);

  useEffect(() => {
    setLaunches(listLaunches().filter((entry) => entry.network === network));
  }, [network]);

  if (launches.length === 0) return null;

  return (
    <div className="flex flex-wrap items-baseline gap-3">
      <span className="eyebrow">Yours</span>
      {launches.slice(0, 6).map((entry) => (
        <button
          key={entry.mint}
          type="button"
          onClick={() => onPick(entry.mint)}
          className="data text-[11px] underline decoration-rule underline-offset-4 hover:decoration-ink"
        >
          {entry.symbol}
        </button>
      ))}
    </div>
  );
}
