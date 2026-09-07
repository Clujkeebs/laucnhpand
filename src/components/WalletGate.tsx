"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { Alert, Button, Card, Field } from "./ui";

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
      <Card title="No wallet yet" description="Create or import one before you can sign anything.">
        <Link href="/wallet">
          <Button>Set up wallet</Button>
        </Link>
      </Card>
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
    <Card
      title="Wallet locked"
      description="Enter your passphrase to decrypt the key for this session."
    >
      <form onSubmit={submit} className="max-w-sm space-y-4">
        <Field label="Passphrase">
          <input
            type="password"
            autoFocus
            className="field font-mono"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
          />
        </Field>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button type="submit" disabled={busy || !passphrase}>
          <span className="flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5" />
            {busy ? "Decrypting…" : "Unlock"}
          </span>
        </Button>
      </form>
    </Card>
  );
}
