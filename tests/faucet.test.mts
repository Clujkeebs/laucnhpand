import assert from "node:assert/strict";
import { explainAirdropError, isRetryableAirdropError, AIRDROP_AMOUNTS } from "../src/lib/faucet.ts";

let passed = 0;
const check = (name: string, fn: () => unknown) => { fn(); passed += 1; console.log(`  ok  ${name}`); };

check("the reported 'Internal error' gets a useful explanation", () => {
  const text = explainAirdropError(new Error("airdrop to EWx5... failed: Internal error"));
  assert.match(text, /throttled or out of funds/);
  assert.doesNotMatch(text, /^Internal error$/);
});

check("rate limiting is named as such", () =>
  assert.match(explainAirdropError(new Error("429 Too Many Requests")), /rate-limiting/));

check("a dry faucet is distinguished", () =>
  assert.match(explainAirdropError(new Error("faucet has run dry")), /dry/i));

check("an invalid address is not blamed on the faucet", () =>
  assert.match(explainAirdropError(new Error("Invalid base58 string")), /invalid/i));

check("network failures point at the RPC setting", () =>
  assert.match(explainAirdropError(new Error("fetch failed")), /NEXT_PUBLIC_DEVNET_RPC/));

check("an unknown error is passed through rather than swallowed", () =>
  assert.match(explainAirdropError(new Error("weird upstream thing")), /weird upstream thing/));

check("a non-Error still yields a message", () => {
  assert.ok(explainAirdropError(undefined).length > 0);
  assert.ok(explainAirdropError({}).length > 0);
});

check("throttling and outages are retryable", () => {
  for (const m of ["Internal error", "429", "503 unavailable", "timed out", "fetch failed"]) {
    assert.equal(isRetryableAirdropError(new Error(m)), true, m);
  }
});

check("an invalid address is never retried", () =>
  assert.equal(isRetryableAirdropError(new Error("Invalid base58 string")), false));

check("amounts step down so a large request cannot block a small one", () => {
  assert.deepEqual([...AIRDROP_AMOUNTS], [1, 0.5]);
  assert.ok(AIRDROP_AMOUNTS.every((a, i) => i === 0 || a < AIRDROP_AMOUNTS[i - 1]));
});

console.log(`\n${passed} passed`);
