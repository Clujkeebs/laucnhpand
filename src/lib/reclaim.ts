/**
 * Rent recovery.
 *
 * Every SPL token account you have ever held locks ~0.002 SOL as rent. When the
 * balance goes to zero the account stays open and the rent stays locked — a
 * wallet that has traded for a while is usually sitting on real SOL it cannot
 * see. Closing an empty account returns that rent to you in full.
 *
 * This is the one place in the app that produces SOL rather than spending it,
 * which makes it the right first stop when the balance is near nothing.
 */

import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { readWithFallback, rpcEndpoint, type Network } from "./solana";
import { batchAccounts, partitionAccounts, type ClosableAccount, type ReclaimScan } from "./rent";

export {
  batchAccounts,
  netRecovery,
  partitionAccounts,
  CLOSE_PER_TX,
  type ClosableAccount,
  type ReclaimScan,
} from "./rent";

export async function scanForRent(network: Network, owner: string): Promise<ReclaimScan> {
  const ownerKey = new PublicKey(owner);

  const [standard, token2022] = await readWithFallback(network, (connection) =>
    Promise.all([
      connection.getParsedTokenAccountsByOwner(ownerKey, { programId: TOKEN_PROGRAM_ID }),
      connection
        .getParsedTokenAccountsByOwner(ownerKey, { programId: TOKEN_2022_PROGRAM_ID })
        .catch(() => ({ value: [] as never[] })),
    ]),
  );

  const accounts: ClosableAccount[] = [...standard.value, ...token2022.value].map((entry) => {
    const info = entry.account.data.parsed.info as {
      mint: string;
      tokenAmount: { uiAmount: number | null };
    };
    return {
      address: entry.pubkey.toBase58(),
      mint: info.mint,
      rentSol: entry.account.lamports / LAMPORTS_PER_SOL,
      amount: info.tokenAmount.uiAmount ?? 0,
      programId: entry.account.owner.toBase58(),
    };
  });

  return partitionAccounts(accounts);
}

export type ReclaimResult = { signatures: string[]; closed: number; recoveredSol: number };

/**
 * Closes the given accounts and returns their rent to the owner. Refuses any
 * account still holding tokens — closing one of those would burn them.
 */
export async function reclaimRent(
  network: Network,
  payer: Keypair,
  accounts: ClosableAccount[],
  onProgress: (done: number, total: number) => void = () => {},
): Promise<ReclaimResult> {
  const unsafe = accounts.find((account) => account.amount > 0);
  if (unsafe) {
    throw new Error(
      `Refusing to close ${unsafe.address.slice(0, 8)}… — it still holds tokens, and closing it would burn them.`,
    );
  }
  if (accounts.length === 0) throw new Error("Nothing to close.");

  const connection = new Connection(rpcEndpoint(network), "confirmed");
  const batches = batchAccounts(accounts);
  const signatures: string[] = [];
  let closed = 0;

  for (const batch of batches) {
    const transaction = new Transaction();
    for (const account of batch) {
      transaction.add(
        createCloseAccountInstruction(
          new PublicKey(account.address),
          payer.publicKey,
          payer.publicKey,
          [],
          new PublicKey(account.programId),
        ),
      );
    }
    signatures.push(
      await sendAndConfirmTransaction(connection, transaction, [payer], {
        commitment: "confirmed",
      }),
    );
    closed += batch.length;
    onProgress(closed, accounts.length);
  }

  return {
    signatures,
    closed,
    recoveredSol: accounts.reduce((total, account) => total + account.rentSol, 0),
  };
}
