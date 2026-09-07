"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { Button, Field, Note, Panel } from "./ui";

/**
 * Renders children only when the wallet is unlocked in memory. Everything that
 * signs a transaction sits behind this.
 */
export function WalletGate({ children }: { children: ReactNode }) {
  const { ready, keystore, keypair, unlock } = useWallet();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return null;
  if (keypair) return <>{children}</>;

  if (!keystore) {
    return (
      <div className="max-w-xl">
        <Panel index="—" eyebrow="Blocked" title="No wallet on this device">
          <p className="mb-6 text-[13.5px] text-ink-soft">
            Nothing can be signed until a key exists here.
          </p>
          <Link href="/wallet">
            <Button>Set up custody</Button>
          </Link>
        </Panel>
      </div>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unlock(passphrase);
      setPassphrase("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md">
      <Panel
        index="—"
        eyebrow="Sealed"
        title="Wallet locked"
        note="The key is decrypted into memory for this session only."
      >
        <form onSubmit={submit} className="space-y-6">
          <Field label="Passphrase">
            <input
              type="password"
              autoFocus
              className="ctl"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          </Field>
          {error ? <Note tone="signal">{error}</Note> : null}
          <Button type="submit" disabled={busy || !passphrase}>
            {busy ? "Decrypting…" : "Unlock"}
          </Button>
        </form>
      </Panel>
    </div>
  );
}
