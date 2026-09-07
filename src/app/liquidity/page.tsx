"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Droplets, Lock } from "lucide-react";
import { Shell } from "@/components/Shell";
import { WalletGate } from "@/components/WalletGate";
import { Alert, Button, Card, Copyable, ExternalRef, Field, Spinner } from "@/components/ui";
import { useWallet } from "@/lib/wallet";
import { explorerUrl } from "@/lib/solana";
import { createLiquidityPool, isValidMint, lockLiquidity } from "@/lib/pool";
import { fetchMintStatus } from "@/lib/token";
import { listLaunches, updateLaunch } from "@/lib/history";

export default function LiquidityPage() {
  return (
    <Shell>
      <h1 className="mb-1 text-xl font-semibold text-white">Liquidity</h1>
      <p className="mb-7 text-sm text-ink-400">
        Pair your token with SOL on Raydium so it has a price and can be traded.
      </p>
      <WalletGate>
        <Suspense fallback={null}>
          <LiquidityPanels />
        </Suspense>
      </WalletGate>
    </Shell>
  );
}

function LiquidityPanels() {
  return (
    <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
      <CreatePool />
      <LockLp />
    </div>
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

  // Decimals have to match the mint exactly, so read them from chain rather than trusting input.
  useEffect(() => {
    if (!isValidMint(mint)) {
      setDecimals(null);
      return;
    }
    let cancelled = false;
    fetchMintStatus(network, mint)
      .then((status) => {
        if (!cancelled) setDecimals(status.decimals);
      })
      .catch(() => {
        if (!cancelled) setDecimals(null);
      });
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
      <Card title="Pool created">
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs text-ink-400">Pool ID</p>
            <Copyable value={result.poolId} />
          </div>
          <div>
            <p className="mb-1.5 text-xs text-ink-400">LP mint</p>
            <Copyable value={result.lpMint} />
          </div>
          <ExternalRef href={explorerUrl("tx", result.signature, network)}>
            View transaction
          </ExternalRef>
          <Alert tone="info">
            The SOL you just added is now buyable supply. Anyone can trade against this pool, and
            the price moves with them.
          </Alert>
          <Button variant="ghost" onClick={() => setResult(null)}>
            Create another
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Create pool" description="Raydium CPMM, paired against SOL.">
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Token mint"
          hint={decimals === null ? undefined : `${decimals} decimals`}
        >
          <input
            className="field font-mono text-xs"
            value={mint}
            onChange={(event) => setMint(event.target.value.trim())}
            placeholder="Mint address"
          />
        </Field>

        <MintPicker onPick={setMint} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Token amount">
            <input
              className="field tabular-nums"
              value={tokenAmount}
              onChange={(event) => setTokenAmount(event.target.value)}
              inputMode="decimal"
              placeholder="800000000"
            />
          </Field>
          <Field label="SOL amount">
            <input
              className="field tabular-nums"
              value={solAmount}
              onChange={(event) => setSolAmount(event.target.value)}
              inputMode="decimal"
              placeholder="5"
            />
          </Field>
        </div>

        {impliedPrice ? (
          <p className="text-xs text-ink-400">
            Opening price:{" "}
            <span className="font-mono text-ink-200">{impliedPrice.toExponential(4)} SOL</span> per
            token.
          </p>
        ) : null}

        <Alert tone="warn">
          The SOL side is real money that leaves your wallet. You get it back only by withdrawing
          liquidity — which, once people have bought in, means selling into them.
        </Alert>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Button type="submit" disabled={busy} className="w-full">
          <span className="flex items-center justify-center gap-2">
            {busy ? <Spinner /> : <Droplets className="h-4 w-4" />}
            {busy ? "Creating pool…" : "Create pool"}
          </span>
        </Button>
      </form>
    </Card>
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
    <Card
      title="Lock LP"
      description="Permanently commit liquidity so it can't be withdrawn."
    >
      {signature ? (
        <div className="space-y-3">
          <Alert tone="good">Liquidity locked. This cannot be undone.</Alert>
          <ExternalRef href={explorerUrl("tx", signature, network)}>View transaction</ExternalRef>
          <Button variant="ghost" onClick={() => setSignature(null)}>
            Lock more
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Pool ID">
            <input
              className="field font-mono text-xs"
              value={poolId}
              onChange={(event) => setPoolId(event.target.value.trim())}
              placeholder="Pool address"
            />
          </Field>
          <Field label="LP amount to lock">
            <input
              className="field tabular-nums"
              value={lpAmount}
              onChange={(event) => setLpAmount(event.target.value)}
              inputMode="decimal"
            />
          </Field>

          <Alert tone="info">
            Locked liquidity is the difference between a pool people will buy into and one they
            won&apos;t. It is also irreversible: that SOL is not coming back to you.
          </Alert>

          {error ? <Alert tone="danger">{error}</Alert> : null}

          <Button type="submit" variant="ghost" disabled={busy} className="w-full">
            <span className="flex items-center justify-center gap-2">
              {busy ? <Spinner /> : <Lock className="h-4 w-4" />}
              {busy ? "Locking…" : "Lock liquidity"}
            </span>
          </Button>
        </form>
      )}
    </Card>
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
    <div className="flex flex-wrap gap-1.5">
      {launches.slice(0, 6).map((entry) => (
        <button
          key={entry.mint}
          type="button"
          onClick={() => onPick(entry.mint)}
          className="rounded-md bg-ink-800 px-2 py-1 text-[11px] text-ink-300 transition hover:bg-ink-700 hover:text-white"
        >
          {entry.symbol}
        </button>
      ))}
    </div>
  );
}
