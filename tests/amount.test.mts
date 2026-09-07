import assert from "node:assert/strict";
import { toBaseUnits, fromBaseUnits } from "../src/lib/amount.ts";

let passed = 0;
const check = (name: string, fn: () => unknown) => { fn(); passed += 1; console.log(`  ok  ${name}`); };

check("whole number at 9 decimals", () =>
  assert.equal(toBaseUnits("1000000000", 9), 1_000_000_000_000_000_000n));

check("fractional amount pads correctly", () =>
  assert.equal(toBaseUnits("1.5", 6), 1_500_000n));

check("0 decimals passes through", () =>
  assert.equal(toBaseUnits("42", 0), 42n));

check("commas, underscores and spaces are stripped", () => {
  assert.equal(toBaseUnits("1,000,000", 2), 100_000_000n);
  assert.equal(toBaseUnits("1_000 000", 2), 100_000_000n);
});

check("supply beyond Number.MAX_SAFE_INTEGER stays exact", () =>
  assert.equal(toBaseUnits("18446744073709551615", 9),
    18_446_744_073_709_551_615_000_000_000n));

check("more decimal places than the mint allows is rejected", () =>
  assert.throws(() => toBaseUnits("1.0000001", 6), /more than 6 decimal places/));

check("0-decimal mint rejects a fractional amount", () =>
  assert.throws(() => toBaseUnits("1.5", 0), /whole number/));

check("negative, empty and non-numeric input is rejected", () => {
  for (const bad of ["-1", "", "abc", "1.2.3", "1e9", ".", "0x10"]) {
    assert.throws(() => toBaseUnits(bad, 9), /positive number/, `accepted ${JSON.stringify(bad)}`);
  }
});

check("out-of-range decimals are rejected", () => {
  assert.throws(() => toBaseUnits("1", -1), /between 0 and 18/);
  assert.throws(() => toBaseUnits("1", 19), /between 0 and 18/);
  assert.throws(() => toBaseUnits("1", 1.5), /between 0 and 18/);
});

check("zero is allowed by the parser", () =>
  assert.equal(toBaseUnits("0", 9), 0n));

check("fromBaseUnits inverts toBaseUnits", () => {
  for (const [amount, decimals] of [["1000000000", 9], ["1.5", 6], ["42", 0], ["0.000001", 6]] as const) {
    assert.equal(fromBaseUnits(toBaseUnits(amount, decimals), decimals), String(Number(amount)));
  }
});

console.log(`\n${passed} passed`);
