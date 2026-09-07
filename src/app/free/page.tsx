"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Coins, HandCoins, Rocket } from "lucide-react";
import { Shell } from "@/components/Shell";
import { WalletGate } from "@/components/WalletGate";
import { ArtAssist, ConceptAssist, type Candidate } from "@/components/Assist";
import { LineChart } from "@/components/Chart";
import {
  Button,
  Copyable,
  Datum,
  ExternalRef,
  Field,
  Note,
  Panel,
  Spinner,
  Tag,
} from "@/components/ui";
import { useWallet } from "@/lib/wallet";
import { explorerUrl } from "@/lib/solana";
import {
  claimCreatorFees,
  createFreeLaunch,
  fetchClaimableFees,
  fetchFeeRates,
  feesFromVolume,
  volumeForTarget,
  type FeeRates,
} from "@/lib/launchpad";

const SOL_USD_FALLBACK = 0;

export default function FreeLaunchPage() {
  return (
    <Shell
      title="Curve launch"
      standfirst="Issue against a bonding curve instead of funding a pool. Your outlay is account rent; buyers trade against the curve, and your share of the trade fee accrues to a vault you can claim."
    >
      <WalletGate>
        <CurveLaunch />
      </WalletGate>
    </Shell>
  );
}

function CurveLaunch() {
  const { keypair, network, publicKey, refreshBalance } = useWallet();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [artPreview, setArtPreview] = useState<string | null>(null);
  const [initialBuy, setInitialBuy] = useState("0");

  const [rates, setRates] = useState<FeeRates | null>(null);
  const [solUsd, setSolUsd] = useState<number>(SOL_USD_FALLBACK);
  const [claimable, setClaimable] = useState<number | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimTx, setClaimTx] = useState<string | null>(null);

  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ mint: string; poolId: string; signature: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    fetchFeeRates(network)
      .then((value) => !cancelled && setRates(value))
      .catch(() => !cancelled && setRates(null));
    return () => {
      cancelled = true;
    };
  }, [network]);

  useEffect(() => {
    if (network !== "mainnet-beta") {
      setSolUsd(0);
      return;
    }
    let cancelled = false;
    fetch("/api/market", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mints: ["So11111111111111111111111111111111111111112"] }),
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Record<string, { price?: number } | undefined>) => {
        const price = data["So11111111111111111111111111111111111111112"]?.price;
        if (!cancelled && typeof price === "number") setSolUsd(price);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [network]);

  const refreshClaimable = useCallback(async () => {
    if (!publicKey) return;
    try {
      setClaimable(await fetchClaimableFees(network, publicKey));
    } catch {
      setClaimable(null);
    }
  }, [network, publicKey]);

  useEffect(() => {
    void refreshClaimable();
  }, [refreshClaimable]);

  // What volume actually pays. This is the whole earnings model in one curve.
  const earningsCurve = useMemo(() => {
    if (!rates) return [];
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= 40; i += 1) {
      const volume = (i / 40) * 2000;
      points.push({ x: volume, y: feesFromVolume(volume, rates) });
    }
    return points;
  }, [rates]);

  const usd = (sol: number) => (solUsd > 0 ? ` ≈ $${(sol * solUsd).toFixed(2)}` : "");

  async function claim() {
    if (!keypair) return;
    setClaiming(true);
    setError(null);
    try {
      setClaimTx(await claimCreatorFees(network, keypair));
      await refreshClaimable();
      void refreshBalance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed.");
    } finally {
      setClaiming(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!keypair) return;
    setError(null);
    try {
      if (!name.trim()) throw new Error("Name is required.");
      if (!symbol.trim()) throw new Error("Symbol is required.");
      if (!image) throw new Error("Generate or choose artwork first.");

      setStep("Uploading metadata…");
      const form = new FormData();
      form.append("image", image);
      form.append("name", name);
      form.append("symbol", symbol);
      form.append("description", description);
      const upload = await fetch("/api/upload", { method: "POST", body: form });
      const uploaded = (await upload.json()) as { metadataUri?: string; error?: string };
      if (!upload.ok || !uploaded.metadataUri) throw new Error(uploaded.error ?? "Upload failed.");

      const launch = await createFreeLaunch(
        network,
        keypair,
        {
          name: name.trim(),
          symbol: symbol.trim(),
          uri: uploaded.metadataUri,
          decimals: 6,
          initialBuySol: Number(initialBuy) || 0,
        },
        setStep,
      );

      setResult(launch);
      setStep(null);
      void refreshBalance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Launch failed.");
      setStep(null);
    }
  }

  return (
    <div className="grid max-w-6xl gap-11 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-11">
        {result ? (
          <Panel index="—" eyebrow="Live" title="The curve is open">
            <dl className="space-y-2">
              <Datum label="Token">{symbol}</Datum>
              <Datum label="Mint">{result.mint.slice(0, 10)}…</Datum>
            </dl>
            <div className="mt-5 space-y-3">
              <Copyable value={result.mint} />
              <div className="flex flex-wrap gap-5">
                <ExternalRef href={explorerUrl("token", result.mint, network)}>Token</ExternalRef>
                <ExternalRef href={explorerUrl("tx", result.signature, network)}>
                  Transaction
                </ExternalRef>
              </div>
            </div>
            <div className="mt-7 flex flex-wrap gap-2.5">
              <Link href={`/inspect?mint=${result.mint}`}>
                <Button variant="quiet">Examine</Button>
              </Link>
              <Button variant="quiet" onClick={() => setResult(null)}>
                Launch another
              </Button>
            </div>
            <div className="mt-7">
              <Note>
                Fees only accrue when people trade. A curve nobody buys pays nothing — the
                mechanism is real, the volume is not guaranteed.
              </Note>
            </div>
          </Panel>
        ) : (
          <form onSubmit={submit} className="space-y-11">
            <Panel
              index="01"
              eyebrow="Draft"
              title="Name and mark"
              note="Artwork is generated here for free; names need an API key."
            >
              <div className="space-y-8">
                <ConceptAssist
                  onApply={(candidate: Candidate) => {
                    setName(candidate.name);
                    setSymbol(candidate.symbol);
                    setDescription(candidate.description);
                  }}
                />
                <div className="border-t border-rule pt-7">
                  <ArtAssist
                    seed={name || symbol}
                    label={name || symbol}
                    onApply={(file, preview) => {
                      setImage(file);
                      setArtPreview(preview);
                    }}
                  />
                </div>
              </div>
            </Panel>

            <Panel index="02" eyebrow="Identity" title="Details">
              <div className="grid gap-6 sm:grid-cols-2">
                <Field label="Name">
                  <input
                    className="ctl"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="My Token"
                    maxLength={32}
                  />
                </Field>
                <Field label="Symbol">
                  <input
                    className="ctl uppercase"
                    value={symbol}
                    onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                    placeholder="MTK"
                    maxLength={10}
                  />
                </Field>
              </div>
              <div className="mt-6">
                <Field label="Description">
                  <textarea
                    rows={2}
                    className="ctl"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>
              </div>
              {artPreview ? (
                <div className="mt-6 flex items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={artPreview} alt="" width={44} height={44} className="border border-rule" />
                  <span className="eyebrow">Artwork attached</span>
                </div>
              ) : null}
            </Panel>

            <Panel
              index="03"
              eyebrow="Opening buy"
              title="Skin in the game"
              note="Optional. Zero is allowed — that is the point of this flow."
            >
              <Field label="SOL to spend on your own tokens at launch">
                <input
                  className="ctl"
                  value={initialBuy}
                  onChange={(event) => setInitialBuy(event.target.value)}
                  inputMode="decimal"
                />
              </Field>
              {Number(initialBuy) > 0 ? (
                <div className="mt-5">
                  <Note tone="flag">
                    Buying your own launch is legal and common, but it is visible on chain and
                    it makes you the first holder. Buying across several wallets to hide that
                    is the thing this app will not help with.
                  </Note>
                </div>
              ) : null}
            </Panel>

            {error ? <Note tone="signal">{error}</Note> : null}

            <Button type="submit" disabled={Boolean(step)} className="w-full">
              {step ? <Spinner /> : <Rocket className="h-3.5 w-3.5" />}
              {step ?? "Open the curve"}
            </Button>
          </form>
        )}
      </div>

      <div className="space-y-11 lg:sticky lg:top-12 lg:self-start">
        <Panel index="—" eyebrow="Earnings" title="What fees pay">
          {rates ? (
            <div className="space-y-6">
              <dl className="space-y-2">
                <Datum label="Trade fee, every trade">
                  {(rates.tradeFeeRate * 100).toFixed(2)}%
                </Datum>
                <Datum label="Your share of it">
                  {(rates.creatorFeeRate * 100).toFixed(3)}%
                </Datum>
              </dl>

              <LineChart
                points={earningsCurve}
                xLabel="Volume, SOL"
                yLabel="Your fees, SOL"
                formatX={(value) => (value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value.toFixed(0))}
                formatY={(value) => value.toFixed(2)}
                series={2}
                caption="Fees are a fixed cut of trading volume. The line is straight because there is no leverage in it — twice the volume is exactly twice the fees."
              />

              <dl className="space-y-2 border-t border-rule pt-4">
                <Datum label="Volume for 0.1 SOL">
                  {volumeForTarget(0.1, rates).toFixed(0)} SOL
                </Datum>
                <Datum label="Volume for 1 SOL">
                  {volumeForTarget(1, rates).toFixed(0)} SOL
                </Datum>
                <Datum label="Volume for 10 SOL">
                  {volumeForTarget(10, rates).toFixed(0)} SOL
                </Datum>
              </dl>

              <Note>
                At {(rates.creatorFeeRate * 100).toFixed(3)}%, earning 0.1 SOL
                {usd(0.1)} takes about {volumeForTarget(0.1, rates).toFixed(0)} SOL of trading
                through your curve. That is the real number — everything on this page is
                downstream of whether anyone trades.
              </Note>
            </div>
          ) : (
            <p className="annot">Reading fee rates from the network…</p>
          )}
        </Panel>

        <Panel index="—" eyebrow="Vault" title="Claim">
          <dl className="space-y-2">
            <Datum label="Claimable, SOL">
              {claimable === null ? "—" : claimable.toFixed(6)}
            </Datum>
          </dl>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Button variant="quiet" onClick={() => void refreshClaimable()}>
              Refresh
            </Button>
            <Button onClick={() => void claim()} disabled={claiming || !claimable}>
              {claiming ? <Spinner /> : <HandCoins className="h-3.5 w-3.5" />}
              Claim fees
            </Button>
          </div>
          {claimTx ? (
            <div className="mt-4">
              <ExternalRef href={explorerUrl("tx", claimTx, network)}>Claim transaction</ExternalRef>
            </div>
          ) : null}
        </Panel>

        <div className="flex flex-wrap gap-2.5">
          {network === "mainnet-beta" ? (
            <Tag tone="signal">Live network</Tag>
          ) : (
            <Tag tone="verify">Test network</Tag>
          )}
          <Tag>
            <span className="flex items-center gap-1.5">
              <Coins className="h-3 w-3" />
              Rent only
            </span>
          </Tag>
        </div>
      </div>
    </div>
  );
}
