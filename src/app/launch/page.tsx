"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Rocket } from "lucide-react";
import { Shell } from "@/components/Shell";
import { WalletGate } from "@/components/WalletGate";
import { ReportSheet } from "@/components/ReportSheet";
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
import { explorerUrl, usingPublicRpc } from "@/lib/solana";
import { estimateLaunchCost, launchToken, type LaunchCost } from "@/lib/token";
import { toBaseUnits } from "@/lib/amount";
import { reportPlannedLaunch } from "@/lib/report";
import { rememberLaunch } from "@/lib/history";
import { ArtAssist, ConceptAssist, type Candidate } from "@/components/Assist";

export default function LaunchPage() {
  return (
    <Shell
      title="Issue a token"
      standfirst="Creates the mint, attaches metadata, and sends the full supply to your wallet. The report on the right is what anyone checking your token will see."
    >
      <WalletGate>
        <Suspense fallback={null}>
          <LaunchForm />
        </Suspense>
      </WalletGate>
    </Shell>
  );
}

function LaunchForm() {
  const { keypair, network, connection, balanceSol, refreshBalance } = useWallet();
  const params = useSearchParams();

  // A template carries an existing token's *configuration* only — never its
  // name, symbol or artwork. Those are yours to supply.
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState(() => {
    const raw = params.get("decimals");
    if (raw === null) return 9;
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 && value <= 9 ? value : 9;
  });
  const [supply, setSupply] = useState(() => {
    const value = params.get("supply");
    return value && /^\d+(\.\d+)?$/.test(value) ? value : "1000000000";
  });
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [artPreview, setArtPreview] = useState<string | null>(null);
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
      .then((value) => !cancelled && setCost(value))
      .catch(() => !cancelled && setCost(null));
    return () => {
      cancelled = true;
    };
  }, [connection]);

  const report = useMemo(
    () =>
      reportPlannedLaunch({
        name,
        symbol,
        description,
        hasImage: useManualUri ? manualUri.trim().length > 0 : image !== null,
        links: [website, twitter, telegram].map((l) => l.trim()).filter(Boolean),
        supply,
        decimals,
        revokeMint,
        revokeFreeze,
      }),
    [
      name,
      symbol,
      description,
      useManualUri,
      manualUri,
      image,
      website,
      twitter,
      telegram,
      supply,
      decimals,
      revokeMint,
      revokeFreeze,
    ],
  );

  const supplyPreview = useMemo(() => {
    try {
      toBaseUnits(supply, decimals);
      return Number(supply.replace(/[,_\s]/g, "")).toLocaleString();
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
    for (const [key, value] of Object.entries({
      name,
      symbol,
      description,
      website,
      twitter,
      telegram,
    })) {
      form.append(key, value);
    }

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
      <div className="grid max-w-5xl gap-10 lg:grid-cols-[1.15fr_1fr]">
        <Panel index="—" eyebrow="Issued" title="The token exists">
          <dl className="space-y-2">
            <Datum label="Name">{name}</Datum>
            <Datum label="Symbol">{symbol}</Datum>
            <Datum label="Supply">{supplyPreview ?? supply}</Datum>
            <Datum label="Decimals">{decimals}</Datum>
          </dl>

          <div className="mt-6 space-y-3">
            <div>
              <p className="eyebrow mb-1.5">Mint address</p>
              <Copyable value={result.mint} />
            </div>
            <div className="flex flex-wrap gap-5">
              <ExternalRef href={explorerUrl("token", result.mint, network)}>Token</ExternalRef>
              <ExternalRef href={explorerUrl("tx", result.signature, network)}>
                Transaction
              </ExternalRef>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link href={`/liquidity?mint=${result.mint}&decimals=${decimals}`}>
              <Button>Open a market</Button>
            </Link>
            <Link href={`/inspect?mint=${result.mint}`}>
              <Button variant="quiet">Examine</Button>
            </Link>
            <Button variant="quiet" onClick={() => setResult(null)}>
              Issue another
            </Button>
          </div>

          <div className="mt-7">
            <Note>
              The token exists but has no market. Until you open a pool and fund it there is no
              price, and nobody can buy it at any number.
            </Note>
          </div>
        </Panel>

        <ReportSheet report={report} heading="Final report" />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid max-w-6xl gap-10 lg:grid-cols-[1.35fr_1fr]">
      <div className="space-y-11">
        {params.get("template") ? (
          <Note>
            Started from an existing token&apos;s configuration — supply, decimals and
            authority settings only. The name, symbol and artwork are yours to write.
          </Note>
        ) : null}

        <Panel
          index="00"
          eyebrow="Assistant"
          title="Draft it"
          note="Optional. Names come from Claude; artwork is generated locally and costs nothing."
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
                  setUseManualUri(false);
                }}
              />
            </div>
          </div>
        </Panel>

        <Panel index="01" eyebrow="Identity" title="What it's called">
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
            <Field label="Symbol" hint="Up to 10 characters.">
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
                rows={3}
                className="ctl"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="The first thing shown under the token's name."
              />
            </Field>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            <Field label="Website">
              <input
                className="ctl"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://"
              />
            </Field>
            <Field label="X">
              <input
                className="ctl"
                value={twitter}
                onChange={(event) => setTwitter(event.target.value)}
                placeholder="https://x.com/…"
              />
            </Field>
            <Field label="Telegram">
              <input
                className="ctl"
                value={telegram}
                onChange={(event) => setTelegram(event.target.value)}
                placeholder="https://t.me/…"
              />
            </Field>
          </div>
        </Panel>

        <Panel
          index="02"
          eyebrow="Artwork"
          title="What it looks like"
          aside={
            <button
              type="button"
              onClick={() => setUseManualUri((value) => !value)}
              className="eyebrow hover:text-ink"
            >
              {useManualUri ? "Upload a file" : "Paste a URI"}
            </button>
          }
        >
          {useManualUri ? (
            <Field label="Metadata URI" hint="A URL returning Metaplex fungible-token metadata.">
              <input
                className="ctl"
                value={manualUri}
                onChange={(event) => setManualUri(event.target.value)}
                placeholder="https://…/metadata.json"
              />
            </Field>
          ) : (
            <label className="flex cursor-pointer items-center gap-4 border-b-[1.5px] border-rule pb-3 transition hover:border-[color:var(--rule-hard)]">
              {artPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={artPreview}
                  alt=""
                  width={44}
                  height={44}
                  className="shrink-0 border border-rule"
                />
              ) : null}
              <span className="eyebrow">File</span>
              <span className="data flex-1 truncate text-[13px]">
                {image ? image.name : "Choose an image…"}
              </span>
              <span className="data text-[11px] text-ink-faint">
                {image ? `${(image.size / 1024).toFixed(0)} KB` : "≤ 5 MB"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => setImage(event.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </Panel>

        <Panel index="03" eyebrow="Supply" title="How much of it">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Total supply" hint={supplyPreview ? `${supplyPreview} tokens` : "—"}>
              <input
                className="ctl"
                value={supply}
                onChange={(event) => setSupply(event.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Decimals" hint="9 matches SOL. 6 is common for memecoins.">
              <select
                className="ctl"
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
        </Panel>

        <Panel index="04" eyebrow="Authorities" title="What you give up">
          <div className="space-y-5">
            <Switch
              checked={revokeMint}
              onChange={setRevokeMint}
              label="Revoke mint authority"
              detail="Permanent. Nobody, you included, can ever create more supply."
            />
            <Switch
              checked={revokeFreeze}
              onChange={setRevokeFreeze}
              label="Revoke freeze authority"
              detail="Permanent. Nobody can freeze a holder's account to stop them selling."
            />
          </div>
        </Panel>

        <Panel index="05" eyebrow="Cost" title="What it costs to issue">
          {cost ? (
            <dl className="space-y-2">
              <Datum label="Mint account rent">{cost.mintRent.toFixed(6)}</Datum>
              <Datum label="Metadata account rent">{cost.metadataRent.toFixed(6)}</Datum>
              <Datum label="Token account rent">{cost.tokenAccountRent.toFixed(6)}</Datum>
              <Datum label="Transaction fees">{cost.fees.toFixed(6)}</Datum>
              <div className="border-t-[1.5px] border-[color:var(--rule-hard)] pt-2">
                <Datum label="Total, SOL">
                  <span className="font-bold">{cost.total.toFixed(6)}</span>
                </Datum>
              </div>
              <Datum label="Your balance">
                {balanceSol === null ? "—" : balanceSol.toFixed(6)}
              </Datum>
            </dl>
          ) : (
            <p className="annot">Reading rent rates from the network…</p>
          )}

          <div className="mt-5">
            <Note>
              Rent is locked inside the accounts, not spent. What actually costs money is
              liquidity, and that comes next.
            </Note>
          </div>
        </Panel>
      </div>

      <div className="space-y-6 lg:sticky lg:top-12 lg:self-start">
        <ReportSheet report={report} />

        <div className="flex items-center gap-3">
          {network === "mainnet-beta" ? (
            <Tag tone="signal">Live network</Tag>
          ) : (
            <Tag tone="verify">Test network</Tag>
          )}
          {network === "mainnet-beta" && usingPublicRpc(network) ? (
            <Tag tone="flag">Public RPC</Tag>
          ) : null}
        </div>

        {underfunded ? (
          <Note tone="signal">
            Not enough SOL to cover issuance.{" "}
            {network === "devnet"
              ? "Draw test SOL from the faucet on the custody page."
              : "Fund the wallet first."}
          </Note>
        ) : null}

        {report.verdict === "hostile" ? (
          <Note tone="signal">
            As configured, this token fails the two checks every scanner runs first. It can be
            issued, but expect it to be flagged within minutes of anyone looking.
          </Note>
        ) : null}

        {error ? <Note tone="signal">{error}</Note> : null}

        <Button type="submit" disabled={Boolean(step) || underfunded} className="w-full">
          {step ? <Spinner /> : <Rocket className="h-3.5 w-3.5" />}
          {step ?? "Issue token"}
        </Button>
      </div>
    </form>
  );
}

function Switch({
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
    <label className="flex cursor-pointer gap-3.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1"
      />
      <span>
        <span className="block text-[14px] font-semibold">{label}</span>
        <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-soft">{detail}</span>
      </span>
    </label>
  );
}
