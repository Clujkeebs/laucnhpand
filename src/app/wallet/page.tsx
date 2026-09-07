"use client";

import { useState, type FormEvent } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Shell } from "@/components/Shell";
import { Button, Copyable, Datum, ExternalRef, Field, Note, Panel, Tag } from "@/components/ui";
import { useWallet } from "@/lib/wallet";
import { explorerUrl } from "@/lib/solana";

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
      setError("Use at least 10 characters. This is the only thing protecting the key.");
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
    if (!keypair) return;
    setAirdropState("requesting");
    try {
      const signature = await connection.requestAirdrop(keypair.publicKey, LAMPORTS_PER_SOL);
      await connection.confirmTransaction(signature, "confirmed");
      await refreshBalance();
      setAirdropState("Airdrop confirmed.");
    } catch (err) {
      setAirdropState(
        err instanceof Error ? err.message : "The test faucet is rate-limited. Try again shortly.",
      );
    }
  }

  if (!ready) return null;

  if (!keystore) {
    return (
      <Shell
        title="Custody"
        standfirst="The key is generated here, in this browser, and encrypted with a passphrase only you hold. It is never sent to the server."
      >
        <div className="max-w-xl space-y-9">
          <Panel index="01" eyebrow="Setup" title={mode === "create" ? "New key" : "Import a key"}>
            <div className="mb-7 flex gap-5">
              {(["create", "import"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={`eyebrow ${mode === option ? "text-ink underline underline-offset-4" : "hover:text-ink"}`}
                >
                  {option === "create" ? "Generate" : "Import"}
                </button>
              ))}
            </div>

            <form onSubmit={setup} className="space-y-6">
              {mode === "import" ? (
                <Field label="Secret key" hint="Base58 from Phantom, or a JSON byte array.">
                  <textarea
                    rows={3}
                    className="ctl"
                    value={secretInput}
                    onChange={(event) => setSecretInput(event.target.value)}
                  />
                </Field>
              ) : null}

              <Field
                label="Passphrase"
                hint="Encrypts the key at rest. There is no reset — write it down somewhere physical."
              >
                <input
                  type="password"
                  className="ctl"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                />
              </Field>

              <Field label="Confirm passphrase">
                <input
                  type="password"
                  className="ctl"
                  value={confirmPassphrase}
                  onChange={(event) => setConfirmPassphrase(event.target.value)}
                />
              </Field>

              {error ? <Note tone="signal">{error}</Note> : null}

              <Button type="submit" disabled={busy}>
                {busy ? "Working…" : mode === "create" ? "Create wallet" : "Import wallet"}
              </Button>
            </form>
          </Panel>

          <Note tone="flag">
            This wallet lives in one browser profile. Clearing site data deletes it. Export the
            secret key and store it offline the moment you create it.
          </Note>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Custody" standfirst="One key, held in this browser, encrypted at rest.">
      <div className="grid max-w-6xl gap-11 lg:grid-cols-2">
        <Panel
          index="01"
          eyebrow="Account"
          title="Key"
          aside={keypair ? <Tag tone="verify">Open</Tag> : <Tag>Sealed</Tag>}
        >
          <dl className="space-y-2">
            <Datum label="Balance, SOL">{balanceSol === null ? "—" : balanceSol.toFixed(6)}</Datum>
            <Datum label="Network">{network === "devnet" ? "test" : "live"}</Datum>
            <Datum label="Created">
              {new Date(keystore.createdAt).toLocaleDateString()}
            </Datum>
          </dl>

          <div className="mt-6">
            <p className="eyebrow mb-1.5">Public key</p>
            <Copyable value={publicKey ?? ""} />
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            <Button variant="quiet" onClick={() => void refreshBalance()}>
              Refresh
            </Button>
            {keypair ? (
              <Button variant="quiet" onClick={lock}>
                Seal
              </Button>
            ) : null}
            {publicKey ? (
              <ExternalRef href={explorerUrl("address", publicKey, network)}>Solscan</ExternalRef>
            ) : null}
          </div>
        </Panel>

        {network === "devnet" ? (
          <Panel index="02" eyebrow="Faucet" title="Test SOL" note="Free, and worthless — the point.">
            <Button
              variant="quiet"
              onClick={() => void airdrop()}
              disabled={!keypair || airdropState === "requesting"}
            >
              {airdropState === "requesting" ? "Requesting…" : "Draw 1 SOL"}
            </Button>
            {!keypair ? (
              <p className="annot mt-4">Unlock the wallet first.</p>
            ) : null}
            {airdropState && airdropState !== "requesting" ? (
              <p className="mt-4 text-[12px] text-ink-soft">{airdropState}</p>
            ) : null}
          </Panel>
        ) : null}

        <Panel index="03" eyebrow="Export" title="Secret key" note="Paste into Phantom to use the same wallet there.">
          {revealed ? (
            <div className="space-y-4">
              <div className="sheet border-signal p-3.5">
                <p className="data break-all text-[11.5px]">{revealed}</p>
              </div>
              <div className="flex gap-2.5">
                <Button variant="quiet" onClick={() => void navigator.clipboard.writeText(revealed)}>
                  Copy
                </Button>
                <Button variant="quiet" onClick={() => setRevealed(null)}>
                  Hide
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={reveal} className="space-y-6">
              <Field label="Passphrase">
                <input
                  type="password"
                  className="ctl"
                  value={revealPassphrase}
                  onChange={(event) => setRevealPassphrase(event.target.value)}
                />
              </Field>
              {revealError ? <Note tone="signal">{revealError}</Note> : null}
              <Button variant="quiet" type="submit" disabled={!revealPassphrase}>
                Reveal
              </Button>
            </form>
          )}
        </Panel>

        <Panel index="04" eyebrow="Destructive" title="Remove" note="Deletes the encrypted key from this browser.">
          <Button
            variant="warn"
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
            Remove wallet
          </Button>
        </Panel>
      </div>
    </Shell>
  );
}
