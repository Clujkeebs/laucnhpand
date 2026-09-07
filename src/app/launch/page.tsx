"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ImagePlus, Rocket, ShieldCheck } from "lucide-react";
import { Shell } from "@/components/Shell";
import { WalletGate } from "@/components/WalletGate";
import { Alert, Badge, Button, Card, Copyable, ExternalRef, Field, Spinner } from "@/components/ui";
import { useWallet } from "@/lib/wallet";
import { explorerUrl, usingPublicRpc } from "@/lib/solana";
import { estimateLaunchCost, launchToken, type LaunchCost } from "@/lib/token";
import { toBaseUnits } from "@/lib/amount";
import { rememberLaunch } from "@/lib/history";

export default function LaunchPage() {
  return (
    <Shell>
      <h1 className="mb-1 text-xl font-semibold text-white">Launch a token</h1>
      <p className="mb-7 text-sm text-ink-400">
        Creates an SPL mint, attaches metadata, and mints the full supply to your wallet.
      </p>
      <WalletGate>
        <LaunchForm />
      </WalletGate>
    </Shell>
  );
}

function LaunchForm() {
  const { keypair, network, connection, balanceSol, refreshBalance } = useWallet();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState(9);
  const [supply, setSupply] = useState("1000000000");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [manualUri, setManualUri] = useState("");
  const [useManualUri, setUseManualUri] = useState(false);

  const [revokeMint, setRevokeMint] = useState(true);
  const [revokeFreeze, setRevokeFreeze] = useState(true);

  const [cost, setCost] = useState<LaunchCost | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ mint: string; signature: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    estimateLaunchCost(connection)
      .then((value) => {
        if (!cancelled) setCost(value);
      })
      .catch(() => setCost(null));
    return () => {
      cancelled = true;
    };
  }, [connection]);

  const supplyPreview = useMemo(() => {
    try {
      const base = toBaseUnits(supply, decimals);
      return base > 0n ? Number(supply.replace(/[,_\s]/g, "")).toLocaleString() : null;
    } catch {
      return null;
    }
  }, [supply, decimals]);

  const underfunded = cost !== null && balanceSol !== null && balanceSol < cost.total;

  const uploadMetadata = useCallback(async (): Promise<string> => {
    if (useManualUri) {
      if (!/^https?:\/\//.test(manualUri.trim())) {
        throw new Error("Metadata URI must be an http(s) URL.");
      }
      return manualUri.trim();
    }
    if (!image) throw new Error("Add a token image, or switch to pasting a metadata URI.");

    const form = new FormData();
    form.append("image", image);
    form.append("name", name);
    form.append("symbol", symbol);
    form.append("description", description);
    form.append("website", website);
    form.append("twitter", twitter);
    form.append("telegram", telegram);

    const response = await fetch("/api/upload", { method: "POST", body: form });
    const body = (await response.json()) as { metadataUri?: string; error?: string };
    if (!response.ok || !body.metadataUri) throw new Error(body.error ?? "Upload failed.");
    return body.metadataUri;
  }, [useManualUri, manualUri, image, name, symbol, description, website, twitter, telegram]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!keypair) return;
    setError(null);
    setResult(null);

    try {
      if (!name.trim()) throw new Error("Name is required.");
      if (!symbol.trim()) throw new Error("Symbol is required.");
      if (symbol.trim().length > 10) throw new Error("Symbol must be 10 characters or fewer.");
      toBaseUnits(supply, decimals);

      setStep("Uploading metadata…");
      const uri = await uploadMetadata();

      const launch = await launchToken(
        network,
        keypair,
        {
          name: name.trim(),
          symbol: symbol.trim(),
          decimals,
          supply,
          uri,
          revokeMintAuthority: revokeMint,
          revokeFreezeAuthority: revokeFreeze,
        },
        setStep,
      );

      rememberLaunch({
        mint: launch.mint,
        name: name.trim(),
        symbol: symbol.trim(),
        decimals,
        supply,
        network,
        createdAt: new Date().toISOString(),
      });

      setResult({ mint: launch.mint, signature: launch.createSignature });
      setStep(null);
      void refreshBalance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Launch failed.");
      setStep(null);
    }
  }

  if (result) {
    return (
      <div className="max-w-2xl space-y-5">
        <Card title="Token created">
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs text-ink-400">Mint address</p>
              <Copyable value={result.mint} />
            </div>
            <div className="flex flex-wrap gap-4">
              <ExternalRef href={explorerUrl("token", result.mint, network)}>
                View token
              </ExternalRef>
              <ExternalRef href={explorerUrl("tx", result.signature, network)}>
                View transaction
              </ExternalRef>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href={`/liquidity?mint=${result.mint}&decimals=${decimals}`}>
                <Button>Add liquidity</Button>
              </Link>
              <Link href={`/inspect?mint=${result.mint}`}>
                <Button variant="ghost">Inspect</Button>
              </Link>
              <Button variant="ghost" onClick={() => setResult(null)}>
                Launch another
              </Button>
            </div>
          </div>
        </Card>

        <Alert tone="info">
          The token exists but has no market. Until you create a pool and fund it, there is no
          price and nobody can buy it.
        </Alert>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid max-w-5xl gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <Card title="Identity">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input
                className="field"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="My Token"
                maxLength={32}
              />
            </Field>
            <Field label="Symbol" hint="Up to 10 characters.">
              <input
                className="field uppercase"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                placeholder="MTK"
                maxLength={10}
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Description">
              <textarea
                rows={3}
                className="field resize-none"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What is this token for?"
              />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Website">
              <input
                className="field"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://"
              />
            </Field>
            <Field label="X / Twitter">
              <input
                className="field"
                value={twitter}
                onChange={(event) => setTwitter(event.target.value)}
                placeholder="https://x.com/…"
              />
            </Field>
            <Field label="Telegram">
              <input
                className="field"
                value={telegram}
                onChange={(event) => setTelegram(event.target.value)}
                placeholder="https://t.me/…"
              />
            </Field>
          </div>
        </Card>

        <Card
          title="Image"
          action={
            <button
              type="button"
              onClick={() => setUseManualUri((value) => !value)}
              className="text-xs text-mint-400 hover:underline"
            >
              {useManualUri ? "Upload a file instead" : "Paste a metadata URI instead"}
            </button>
          }
        >
          {useManualUri ? (
            <Field
              label="Metadata URI"
              hint="A URL returning the Metaplex fungible-token metadata JSON."
            >
              <input
                className="field font-mono text-xs"
                value={manualUri}
                onChange={(event) => setManualUri(event.target.value)}
                placeholder="https://…/metadata.json"
              />
            </Field>
          ) : (
            <label className="flex cursor-pointer items-center gap-4 rounded-lg border border-dashed border-ink-600 p-5 transition hover:border-ink-400">
              <div className="rounded-lg bg-ink-800 p-3">
                <ImagePlus className="h-5 w-5 text-ink-400" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm text-ink-200">
                  {image ? image.name : "Choose a PNG, JPG or GIF"}
                </p>
                <p className="text-xs text-ink-400">
                  {image ? `${(image.size / 1024).toFixed(0)} KB` : "Up to 5 MB. Square works best."}
                </p>
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => setImage(event.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </Card>

        <Card title="Supply">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Total supply" hint={supplyPreview ? `${supplyPreview} tokens` : undefined}>
              <input
                className="field tabular-nums"
                value={supply}
                onChange={(event) => setSupply(event.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Decimals" hint="9 matches SOL. 6 is common for memecoins.">
              <select
                className="field"
                value={decimals}
                onChange={(event) => setDecimals(Number(event.target.value))}
              >
                {[0, 2, 4, 5, 6, 8, 9].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card title="Authorities" description="Both revocations are permanent.">
          <div className="space-y-4">
            <Toggle
              checked={revokeMint}
              onChange={setRevokeMint}
              label="Revoke mint authority"
              detail="Nobody, including you, can ever mint more supply. Without this, buyers have to trust that you won't dilute them."
            />
            <Toggle
              checked={revokeFreeze}
              onChange={setRevokeFreeze}
              label="Revoke freeze authority"
              detail="Nobody can freeze a holder's account and block them from selling. Leaving this on is a well-known honeypot pattern and scanners flag it."
            />
          </div>

          {!revokeMint || !revokeFreeze ? (
            <div className="mt-4">
              <Alert tone="warn">
                Every token scanner checks these two fields. Leaving either in place will be read as
                a red flag by anyone who looks.
              </Alert>
            </div>
          ) : (
            <div className="mt-4">
              <Alert tone="good">
                <span className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Supply is fixed and no account can be frozen.
                </span>
              </Alert>
            </div>
          )}
        </Card>

        <Card title="Cost" description="Rent is locked in the accounts, not spent.">
          {cost ? (
            <dl className="space-y-2 text-xs">
              <Row label="Mint account rent" value={cost.mintRent} />
              <Row label="Metadata account rent" value={cost.metadataRent} />
              <Row label="Token account rent" value={cost.tokenAccountRent} />
              <Row label="Transaction fees" value={cost.fees} />
              <div className="mt-3 flex items-center justify-between border-t border-ink-700 pt-3">
                <dt className="font-medium text-ink-200">Total</dt>
                <dd className="font-mono font-semibold text-white">{cost.total.toFixed(6)} SOL</dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-ink-400">Estimating…</p>
          )}

          <p className="mt-4 text-xs text-ink-400">
            Your balance:{" "}
            <span className="font-mono text-ink-200">
              {balanceSol === null ? "—" : `${balanceSol.toFixed(6)} SOL`}
            </span>
          </p>

          {underfunded ? (
            <div className="mt-3">
              <Alert tone="danger">
                Not enough SOL to cover the launch.{" "}
                {network === "devnet" ? "Use the devnet faucet on the wallet page." : "Fund the wallet first."}
              </Alert>
            </div>
          ) : null}
        </Card>

        {network === "mainnet-beta" ? (
          <Alert tone="warn">
            <span className="font-semibold">Mainnet.</span> This spends real SOL and the token is
            public the moment it exists.
            {usingPublicRpc(network) ? " You're on a public RPC, which will rate-limit and may fail mid-launch." : ""}
          </Alert>
        ) : (
          <Badge tone="good">Devnet — nothing here is real</Badge>
        )}

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Button type="submit" disabled={Boolean(step) || underfunded} className="w-full">
          <span className="flex items-center justify-center gap-2">
            {step ? <Spinner /> : <Rocket className="h-4 w-4" />}
            {step ?? "Launch token"}
          </span>
        </Button>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-400">{label}</dt>
      <dd className="font-mono text-ink-200">{value.toFixed(6)}</dd>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  detail,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  detail: string;
}) {
  return (
    <label className="flex cursor-pointer gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#14e39a]"
      />
      <span>
        <span className="block text-sm text-ink-200">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-400">{detail}</span>
      </span>
    </label>
  );
}
