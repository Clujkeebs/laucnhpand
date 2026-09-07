"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, RefreshCw } from "lucide-react";
import { Button, Datum, ExternalRef, Note, Panel, Spinner, Tag } from "./ui";
import { useWallet } from "@/lib/wallet";
import { explorerUrl } from "@/lib/solana";
import { netRecovery, reclaimRent, scanForRent, type ReclaimScan } from "@/lib/reclaim";

/**
 * Rent sitting in empty token accounts. The only screen in the app that hands
 * SOL back rather than spending it, which is why it leads the ledger when the
 * balance is low.
 */
export function Reclaim() {
  const { keypair, publicKey, network, refreshBalance } = useWallet();
  const [scan, setScan] = useState<ReclaimScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ closed: number; recoveredSol: number; signature: string } | null>(
    null,
  );

  const rescan = useCallback(async () => {
    if (!publicKey) return;
    setScanning(true);
    setError(null);
    try {
      setScan(await scanForRent(network, publicKey));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read your token accounts.");
    } finally {
      setScanning(false);
    }
  }, [network, publicKey]);

  useEffect(() => {
    void rescan();
  }, [rescan]);

  async function reclaim() {
    if (!keypair || !scan || scan.empty.length === 0) return;
    setWorking("0");
    setError(null);
    try {
      const result = await reclaimRent(network, keypair, scan.empty, (closed, total) =>
        setWorking(`${closed}/${total}`),
      );
      setDone({
        closed: result.closed,
        recoveredSol: result.recoveredSol,
        signature: result.signatures[result.signatures.length - 1],
      });
      void refreshBalance();
      void rescan();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reclaim failed.");
    } finally {
      setWorking(null);
    }
  }

  const recoverable = scan?.recoverableSol ?? 0;
  const net = scan ? netRecovery(recoverable, scan.empty.length) : 0;
  const worthIt = scan !== null && scan.empty.length > 0 && net > 0;

  return (
    <Panel
      index="—"
      eyebrow="Recovery"
      title="Locked rent"
      note="Every token account you have ever used holds ~0.002 SOL. Empty ones can be closed and the rent returned."
      aside={worthIt ? <Tag tone="verify">{scan.empty.length} closable</Tag> : null}
    >
      {done ? (
        <div className="space-y-4">
          <dl className="space-y-2">
            <Datum label="Accounts closed">{done.closed}</Datum>
            <Datum label="SOL recovered">{done.recoveredSol.toFixed(6)}</Datum>
          </dl>
          <ExternalRef href={explorerUrl("tx", done.signature, network)}>Transaction</ExternalRef>
          <Note tone="verify">
            That SOL is back in your wallet and spendable. At current rent it covers roughly{" "}
            {Math.floor(done.recoveredSol / 0.025)} more launches.
          </Note>
          <Button variant="quiet" onClick={() => setDone(null)}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <dl className="space-y-2">
            <Datum label="Empty accounts">
              {scan === null ? (scanning ? "scanning…" : "—") : scan.empty.length}
            </Datum>
            <Datum label="Rent locked, SOL">{recoverable.toFixed(6)}</Datum>
            <Datum label="After fees, SOL">{scan === null ? "—" : net.toFixed(6)}</Datum>
            {scan && scan.nonEmpty.length > 0 ? (
              <Datum label="Held back (still hold tokens)">{scan.nonEmpty.length}</Datum>
            ) : null}
          </dl>

          {error ? <Note tone="signal">{error}</Note> : null}

          {scan !== null && scan.empty.length === 0 && !scanning ? (
            <Note>
              Nothing to recover — no empty token accounts. This fills up as you trade and
              close positions, so it is worth checking again later.
            </Note>
          ) : null}

          <div className="flex flex-wrap gap-2.5">
            <Button variant="quiet" onClick={() => void rescan()} disabled={scanning}>
              {scanning ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />}
              Rescan
            </Button>
            <Button onClick={() => void reclaim()} disabled={!worthIt || !keypair || Boolean(working)}>
              {working ? <Spinner /> : <Coins className="h-3.5 w-3.5" />}
              {working ? `Closing ${working}…` : "Reclaim rent"}
            </Button>
          </div>

          {!keypair && worthIt ? (
            <Note tone="signal">Unlock the wallet to reclaim.</Note>
          ) : null}

          {scan && scan.nonEmpty.length > 0 ? (
            <Note>
              {scan.nonEmpty.length} account{scan.nonEmpty.length === 1 ? "" : "s"} still hold
              tokens and are left alone. Closing one would burn what is in it, so this screen
              will not touch them.
            </Note>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
