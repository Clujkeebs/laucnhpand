import assert from "node:assert/strict";
import { buy, sell, spotPrice, priceCurve, solToReachMultiple, summarize } from "../src/lib/amm.ts";
import { feesFromVolume, volumeForTarget } from "../src/lib/fees.ts";

let passed = 0;
const check = (name: string, fn: () => unknown) => { fn(); passed += 1; console.log(`  ok  ${name}`); };
const near = (a: number, b: number, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

// 800M tokens against 5 SOL — a typical small launch.
const pool = { tokenReserve: 800_000_000, solReserve: 5 };
const SUPPLY = 1_000_000_000;

check("spot price is SOL per token", () =>
  near(spotPrice(pool), 5 / 800_000_000));

check("buying moves the price up", () => {
  const r = buy(pool, 1);
  assert.ok(r.newPrice > spotPrice(pool));
  assert.ok(r.priceImpact > 0);
});

check("selling moves the price down", () => {
  const r = sell(pool, 10_000_000);
  assert.ok(r.newPrice < spotPrice(pool));
  assert.ok(r.priceImpact < 0);
});

check("constant product holds across a fee-free buy", () => {
  const free = { ...pool, feeRate: 0 };
  const k = free.tokenReserve * free.solReserve;
  const { tokensOut } = buy(free, 2);
  near((free.tokenReserve - tokensOut) * (free.solReserve + 2), k, 1e-9);
});

check("the fee makes a buyer strictly worse off", () => {
  const withFee = buy(pool, 1).tokensOut;
  const noFee = buy({ ...pool, feeRate: 0 }, 1).tokensOut;
  assert.ok(withFee < noFee);
});

check("average price paid is worse than the opening spot price", () => {
  const { avgPrice } = buy(pool, 1);
  assert.ok(avgPrice > spotPrice(pool));
});

check("a round trip loses money to fees (no free arbitrage)", () => {
  const bought = buy(pool, 1);
  const after = {
    tokenReserve: pool.tokenReserve - bought.tokensOut,
    solReserve: pool.solReserve + 1,
  };
  const back = sell(after, bought.tokensOut);
  assert.ok(back.solOut < 1, `round trip returned ${back.solOut}`);
});

check("thin liquidity moves further on the same buy", () => {
  const thin = buy({ tokenReserve: 800_000_000, solReserve: 1 }, 1).priceImpact;
  const deep = buy({ tokenReserve: 800_000_000, solReserve: 50 }, 1).priceImpact;
  assert.ok(thin > deep, `${thin} should exceed ${deep}`);
});

check("solToReachMultiple round-trips through buy()", () => {
  for (const multiple of [1.5, 2, 5, 10]) {
    const solNeeded = solToReachMultiple(pool, multiple);
    const reached = buy(pool, solNeeded).newPrice / spotPrice(pool);
    near(reached, multiple, 1e-9);
  }
});

check("with no fee it reduces to y*(sqrt(m)-1)", () => {
  const free = { ...pool, feeRate: 0 };
  for (const m of [2, 4, 9]) near(solToReachMultiple(free, m), 5 * (Math.sqrt(m) - 1), 1e-9);
});

check("the fee makes reaching a multiple cost more than the fee-free case", () => {
  assert.ok(solToReachMultiple(pool, 2) > solToReachMultiple({ ...pool, feeRate: 0 }, 2));
});

check("multiple <= 1 needs no SOL", () => {
  assert.equal(solToReachMultiple(pool, 1), 0);
  assert.equal(solToReachMultiple(pool, 0.5), 0);
});

check("the curve is monotonically increasing and starts at spot", () => {
  const points = priceCurve(pool, SUPPLY, 40);
  near(points[0].price, spotPrice(pool));
  near(points[0].multiple, 1);
  for (let i = 1; i < points.length; i += 1) {
    assert.ok(points[i].price > points[i - 1].price, `not monotonic at ${i}`);
    assert.ok(points[i].solIn > points[i - 1].solIn);
  }
});

check("FDV tracks price times supply", () => {
  const points = priceCurve(pool, SUPPLY, 10);
  for (const point of points) near(point.fdvSol, point.price * SUPPLY);
});

check("summary reports the pool's share of supply", () =>
  near(summarize(pool, SUPPLY).supplyInPool, 0.8));

check("degenerate pools return zeros instead of NaN", () => {
  for (const bad of [
    { tokenReserve: 0, solReserve: 5 },
    { tokenReserve: 800, solReserve: 0 },
  ]) {
    const r = buy(bad, 1);
    assert.ok(Number.isFinite(r.tokensOut) && r.tokensOut === 0);
    assert.ok(Number.isFinite(sell(bad, 1).solOut));
    assert.ok(Number.isFinite(spotPrice(bad)));
  }
});

check("zero and negative inputs are no-ops", () => {
  for (const amount of [0, -1]) {
    assert.equal(buy(pool, amount).tokensOut, 0);
    assert.equal(sell(pool, amount).solOut, 0);
  }
});

check("a buyer can never drain the pool", () => {
  const huge = buy(pool, 1e9);
  assert.ok(huge.tokensOut < pool.tokenReserve, "pool fully drained");
});

// --- creator fee economics ---
const rates = { tradeFeeRate: 0.01, creatorFeeRate: 0.001 };

check("fees are a straight cut of volume", () => {
  near(feesFromVolume(1000, rates), 1);
  near(feesFromVolume(2000, rates), 2, 1e-9);
});

check("volumeForTarget inverts feesFromVolume", () => {
  for (const target of [0.1, 1, 10]) {
    near(feesFromVolume(volumeForTarget(target, rates), rates), target, 1e-9);
  }
});

check("no volume means no fees", () => {
  assert.equal(feesFromVolume(0, rates), 0);
  assert.equal(feesFromVolume(-5, rates), 0);
});

check("a zero creator rate can never reach a target", () =>
  assert.equal(volumeForTarget(1, { tradeFeeRate: 0.01, creatorFeeRate: 0 }), Infinity));

console.log(`\n${passed} passed`);
