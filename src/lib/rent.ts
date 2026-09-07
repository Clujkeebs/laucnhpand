/**
 * Rent-recovery arithmetic and safety rules. Pure — no chain imports — so the
 * logic that decides what may be closed can be tested directly.
 */

/** Close instructions are small; this many fit comfortably in one transaction. */
export const CLOSE_PER_TX = 18;

const LAMPORTS_PER_SOL = 1_000_000_000;
const SIGNATURE_FEE_LAMPORTS = 5000;

export type ClosableAccount = {
  address: string;
  mint: string;
  /** Rent locked in this account, in SOL. */
  rentSol: number;
  /** Token balance in whole units. A non-zero balance is never closable. */
  amount: number;
  programId: string;
};

export type ReclaimScan = {
  empty: ClosableAccount[];
  /** Accounts holding a balance. Closing one of these would burn the tokens. */
  nonEmpty: ClosableAccount[];
  recoverableSol: number;
};

export function partitionAccounts(accounts: ClosableAccount[]): ReclaimScan {
  const empty = accounts.filter((account) => account.amount === 0);
  const nonEmpty = accounts.filter((account) => account.amount > 0);
  return {
    empty,
    nonEmpty,
    recoverableSol: empty.reduce((total, account) => total + account.rentSol, 0),
  };
}

export function batchAccounts<T>(accounts: T[], size = CLOSE_PER_TX): T[][] {
  if (size < 1) throw new Error("Batch size must be at least 1.");
  const batches: T[][] = [];
  for (let i = 0; i < accounts.length; i += size) {
    batches.push(accounts.slice(i, i + size));
  }
  return batches;
}

/** Net SOL after paying one signature fee per batch. */
export function netRecovery(
  recoverableSol: number,
  accountCount: number,
  size = CLOSE_PER_TX,
): number {
  const batches = Math.ceil(accountCount / size);
  return recoverableSol - (batches * SIGNATURE_FEE_LAMPORTS) / LAMPORTS_PER_SOL;
}
