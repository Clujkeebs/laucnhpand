import assert from "node:assert/strict";
import {
  partitionAccounts,
  batchAccounts,
  netRecovery,
  CLOSE_PER_TX,
  type ClosableAccount,
} from "../src/lib/rent.ts";

let passed = 0;
const check = (name: string, fn: () => unknown) => { fn(); passed += 1; console.log(`  ok  ${name}`); };
const near = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

const acct = (over: Partial<ClosableAccount> = {}): ClosableAccount => ({
  address: "Acc1",
  mint: "Mint1",
  rentSol: 0.00203928,
  amount: 0,
  programId: "Tokenkeg",
  ...over,
});

check("empty accounts are recoverable", () => {
  const scan = partitionAccounts([acct(), acct({ address: "Acc2" })]);
  assert.equal(scan.empty.length, 2);
  assert.equal(scan.nonEmpty.length, 0);
  near(scan.recoverableSol, 0.00407856);
});

check("accounts holding tokens are never recoverable", () => {
  const scan = partitionAccounts([acct({ amount: 5 }), acct({ address: "B", amount: 0.0001 })]);
  assert.equal(scan.empty.length, 0);
  assert.equal(scan.nonEmpty.length, 2);
  assert.equal(scan.recoverableSol, 0);
});

check("a mixed wallet is split correctly and only empties are counted", () => {
  const scan = partitionAccounts([
    acct({ address: "A" }),
    acct({ address: "B", amount: 1000 }),
    acct({ address: "C" }),
  ]);
  assert.deepEqual(scan.empty.map((a) => a.address), ["A", "C"]);
  assert.deepEqual(scan.nonEmpty.map((a) => a.address), ["B"]);
  near(scan.recoverableSol, 0.00407856);
});

check("an empty wallet recovers nothing without erroring", () => {
  const scan = partitionAccounts([]);
  assert.deepEqual(scan, { empty: [], nonEmpty: [], recoverableSol: 0 });
});

check("batching preserves every account exactly once", () => {
  const accounts = Array.from({ length: 47 }, (_, i) => acct({ address: `A${i}` }));
  const batches = batchAccounts(accounts);
  assert.equal(batches.length, Math.ceil(47 / CLOSE_PER_TX));
  assert.deepEqual(batches.flat().map((a) => a.address), accounts.map((a) => a.address));
  assert.ok(batches.every((b) => b.length <= CLOSE_PER_TX));
});

check("batching handles empty and exact-multiple inputs", () => {
  assert.deepEqual(batchAccounts([]), []);
  assert.equal(batchAccounts(Array.from({ length: CLOSE_PER_TX }, () => acct())).length, 1);
  assert.equal(batchAccounts(Array.from({ length: CLOSE_PER_TX * 2 }, () => acct())).length, 2);
});

check("a batch size below 1 is rejected rather than looping forever", () =>
  assert.throws(() => batchAccounts([acct()], 0), /at least 1/));

check("net recovery subtracts one signature fee per batch", () => {
  // 20 accounts -> 2 batches -> 10000 lamports of fees.
  near(netRecovery(0.04, 20), 0.04 - 10000 / 1e9);
  near(netRecovery(0.002, 1), 0.002 - 5000 / 1e9);
});

check("recovering nothing costs nothing", () => near(netRecovery(0, 0), 0));

check("net recovery stays positive for a single typical account", () =>
  assert.ok(netRecovery(0.00203928, 1) > 0));

console.log(`\n${passed} passed`);
