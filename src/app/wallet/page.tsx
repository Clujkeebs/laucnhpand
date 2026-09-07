"use client";

import { useState, type FormEvent } from "react";
import { Download, Droplet, Eye, Plus, Trash2, Upload } from "lucide-react";
import { Shell } from "@/components/Shell";
import { Alert, Badge, Button, Card, Copyable, ExternalRef, Field, Spinner } from "@/components/ui";
import { useWallet } from "@/lib/wallet";
import { explorerUrl } from "@/lib/solana";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

type Mode = "create" | "import";

export default function WalletPage() {
  const {
    ready,
    keystore,
    keypair,
    publicKey,
    balanceSol,
    network,
    connection,
    createWallet,
    importWallet,
    removeWallet,
    revealSecretKey,
    refreshBalance,
    lock,
  } = useWallet();

  const [mode, setMode] = useState<Mode>("create");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [secretInput, setSecretInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [revealPassphrase, setRevealPassphrase] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);

  const [airdropState, setAirdropState] = useState<string | null>(null);

  async function setup(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (passphrase.length < 10) {
      setError("Use a passphrase of at least 10 characters. It's the only thing protecting the key.");
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError("Passphrases don't match.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "create") await createWallet(passphrase);
      else await importWallet(secretInput, passphrase);
      setPassphrase("");
      setConfirmPassphrase("");
      setSecretInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set up the wallet.");
    } finally {
      setBusy(false);
    }
  }

  async function reveal(event: FormEvent) {
    event.preventDefault();
    setRevealError(null);
    try {
      setRevealed(await revealSecretKey(revealPassphrase));
      setRevealPassphrase("");
    } catch (err) {
      setRevealError(err instanceof Error ? err.message : "Could not decrypt.");
    }
  }

  async function airdrop() {
    if (!publicKey) return;
    setAirdropState("requesting");
    try {
      const signature = await connection.requestAirdrop(
        keypair!.publicKey,
        LAMPORTS_PER_SOL,
      );
      await connection.confirmTransaction(signature, "confirmed");
      await refreshBalance();
      setAirdropState("done");
    } catch (err) {
      setAirdropState(
        err instanceof Error ? `failed: ${err.message}` : "failed: the devnet faucet is rate-limited",
      );
    }
  }

  if (!ready) return null;

  return (
    <Shell>
      <h1 className="mb-1 text-xl font-semibold text-white">Wallet</h1>
      <p className="mb-7 text-sm text-ink-400">
        Generated and encrypted in this browser. The key is never uploaded.
      </p>

      {!keystore ? (
        <div className="max-w-lg space-y-5">
          <Card>
            <div className="mb-5 flex gap-1 rounded-lg bg-ink-850 p-1">
              {(["create", "import"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    mode === option ? "bg-ink-700 text-white" : "text-ink-400 hover:text-ink-200"
                  }`}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    {option === "create" ? (
                      <Plus className="h-3.5 w-3.5" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {option === "create" ? "New wallet" : "Import existing"}
                  </span>
                </button>
              ))}
            </div>

            <form onSubmit={setup} className="space-y-4">
              {mode === "import" ? (
                <Field
                  label="Secret key"
                  hint="Base58 (Phantom export) or a JSON byte array."
                >
                  <textarea
                    rows={3}
                    className="field resize-none font-mono text-xs"
                    value={secretInput}
                    onChange={(event) => setSecretInput(event.target.value)}
                  />
                </Field>
              ) : null}

              <Field
                label="Passphrase"
                hint="Encrypts the key at rest. There is no reset — write it down somewhere safe."
              >
                <input
                  type="password"
                  className="field font-mono"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                />
              </Field>

              <Field label="Confirm passphrase">
                <input
                  type="password"
                  className="field font-mono"
                  value={confirmPassphrase}
                  onChange={(event) => setConfirmPassphrase(event.target.value)}
                />
              </Field>

              {error ? <Alert tone="danger">{error}</Alert> : null}

              <Button type="submit" disabled={busy}>
                {busy ? "Working…" : mode === "create" ? "Create wallet" : "Import wallet"}
              </Button>
            </form>
          </Card>

          <Alert tone="warn">
            This wallet lives in one browser profile. Clearing site data deletes it. Export the
            secret key and store it offline as soon as you create it.
          </Alert>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Address" action={<Badge tone={keypair ? "good" : "neutral"}>{keypair ? "unlocked" : "locked"}</Badge>}>
            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-xs text-ink-400">Public key</p>
                <Copyable value={publicKey ?? ""} />
              </div>
              <div>
                <p className="mb-1 text-xs text-ink-400">Balance</p>
                <p className="text-2xl font-semibold tabular-nums text-white">
                  {balanceSol === null ? "—" : balanceSol.toFixed(6)}{" "}
                  <span className="text-sm font-normal text-ink-400">SOL</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => void refreshBalance()}>
                  Refresh
                </Button>
                {keypair ? (
                  <Button variant="ghost" onClick={lock}>
                    Lock
                  </Button>
                ) : null}
                {publicKey ? (
                  <ExternalRef href={explorerUrl("address", publicKey, network)}>
                    Solscan
                  </ExternalRef>
                ) : null}
              </div>
            </div>
          </Card>

          {network === "devnet" ? (
            <Card title="Devnet faucet" description="Free test SOL. Worthless, which is the point.">
              <Button variant="ghost" onClick={() => void airdrop()} disabled={!keypair || airdropState === "requesting"}>
                <span className="flex items-center gap-2">
                  {airdropState === "requesting" ? <Spinner /> : <Droplet className="h-3.5 w-3.5" />}
                  Request 1 SOL
                </span>
              </Button>
              {!keypair ? (
                <p className="mt-3 text-xs text-ink-400">Unlock the wallet first.</p>
              ) : null}
              {airdropState && airdropState !== "requesting" ? (
                <p className="mt-3 text-xs text-ink-400">
                  {airdropState === "done" ? "Airdrop confirmed." : airdropState}
                </p>
              ) : null}
            </Card>
          ) : null}

          <Card title="Export secret key" description="Paste this into Phantom to use the same wallet there.">
            {revealed ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-danger-500/30 bg-danger-500/5 p-3">
                  <p className="break-all font-mono text-xs text-ink-200">{revealed}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => void navigator.clipboard.writeText(revealed)}>
                    <span className="flex items-center gap-2">
                      <Download className="h-3.5 w-3.5" />
                      Copy
                    </span>
                  </Button>
                  <Button variant="ghost" onClick={() => setRevealed(null)}>
                    Hide
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={reveal} className="space-y-3">
                <Field label="Passphrase">
                  <input
                    type="password"
                    className="field font-mono"
                    value={revealPassphrase}
                    onChange={(event) => setRevealPassphrase(event.target.value)}
                  />
                </Field>
                {revealError ? <Alert tone="danger">{revealError}</Alert> : null}
                <Button variant="ghost" type="submit" disabled={!revealPassphrase}>
                  <span className="flex items-center gap-2">
                    <Eye className="h-3.5 w-3.5" />
                    Reveal
                  </span>
                </Button>
              </form>
            )}
          </Card>

          <Card title="Danger zone" description="Removes the encrypted key from this browser.">
            <Button
              variant="danger"
              onClick={() => {
                if (
                  window.confirm(
                    "Delete this wallet from the browser? If you haven't exported the secret key, the funds are gone for good.",
                  )
                ) {
                  removeWallet();
                }
              }}
            >
              <span className="flex items-center gap-2">
                <Trash2 className="h-3.5 w-3.5" />
                Remove wallet
              </span>
            </Button>
          </Card>
        </div>
      )}
    </Shell>
  );
}
