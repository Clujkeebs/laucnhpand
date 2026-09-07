import assert from "node:assert/strict";
import {
  parseEndpoints, isPublicOnly, isTransient, backoffMs, withFallback,
  PUBLIC_MAINNET,
} from "../src/lib/rpc.ts";

let passed = 0;
const check = async (name: string, fn: () => unknown) => { await fn(); passed += 1; console.log(`  ok  ${name}`); };
const noSleep = async () => {};

await check("an unset variable falls back to the public node", () =>
  assert.deepEqual(parseEndpoints(undefined, PUBLIC_MAINNET), [PUBLIC_MAINNET]));

await check("a comma-separated list is split and trimmed", () =>
  assert.deepEqual(parseEndpoints(" https://a.co , https://b.co ", PUBLIC_MAINNET),
    ["https://a.co", "https://b.co"]));

await check("duplicates are collapsed", () =>
  assert.deepEqual(parseEndpoints("https://a.co,https://a.co", PUBLIC_MAINNET), ["https://a.co"]));

await check("junk entries are dropped, and an all-junk list falls back", () => {
  assert.deepEqual(parseEndpoints("https://a.co,not-a-url,,ftp://x", PUBLIC_MAINNET), ["https://a.co"]);
  assert.deepEqual(parseEndpoints("nonsense,,,", PUBLIC_MAINNET), [PUBLIC_MAINNET]);
});

await check("public-only detection", () => {
  assert.equal(isPublicOnly([PUBLIC_MAINNET], PUBLIC_MAINNET), true);
  assert.equal(isPublicOnly(["https://paid.co"], PUBLIC_MAINNET), false);
  assert.equal(isPublicOnly([PUBLIC_MAINNET, "https://paid.co"], PUBLIC_MAINNET), false);
});

await check("rate limits and network blips are transient", () => {
  for (const m of ["429 Too Many Requests", "503 Service Unavailable", "fetch failed",
                   "socket hang up", "ETIMEDOUT", "Blockhash not found"]) {
    assert.equal(isTransient(new Error(m)), true, m);
  }
});

await check("real rejections are not transient", () => {
  for (const m of ["Insufficient funds", "invalid account owner",
                   "custom program error: 0x1", "signature verification failed"]) {
    assert.equal(isTransient(new Error(m)), false, m);
  }
});

await check("a 429 inside an insufficient-funds message is still not retried", () =>
  assert.equal(isTransient(new Error("Insufficient funds; server said 429")), false));

await check("unknown and empty errors are not retried", () => {
  assert.equal(isTransient(new Error("")), false);
  assert.equal(isTransient(undefined), false);
  assert.equal(isTransient({}), false);
});

await check("backoff grows and is capped", () => {
  assert.equal(backoffMs(0), 400);
  assert.equal(backoffMs(1), 800);
  assert.equal(backoffMs(10), 4000);
  assert.equal(backoffMs(-5), 400);
});

await check("the first working endpoint is used and returns its value", async () => {
  const seen: string[] = [];
  const value = await withFallback({ endpoints: ["a", "b"], sleep: noSleep }, async (e) => {
    seen.push(e); return `ok:${e}`;
  });
  assert.equal(value, "ok:a");
  assert.deepEqual(seen, ["a"]);
});

await check("a transient failure retries, then moves to the next endpoint", async () => {
  const seen: string[] = [];
  const value = await withFallback({ endpoints: ["a", "b"], sleep: noSleep }, async (e) => {
    seen.push(e);
    if (e === "a") throw new Error("429 rate limit");
    return "ok";
  });
  assert.equal(value, "ok");
  assert.deepEqual(seen, ["a", "a", "b"]);
});

await check("a non-transient failure aborts immediately without trying others", async () => {
  const seen: string[] = [];
  await assert.rejects(
    () => withFallback({ endpoints: ["a", "b"], sleep: noSleep }, async (e) => {
      seen.push(e); throw new Error("Insufficient funds");
    }),
    /Insufficient funds/,
  );
  assert.deepEqual(seen, ["a"]);
});

await check("when every endpoint fails the last error surfaces", async () => {
  await assert.rejects(
    () => withFallback({ endpoints: ["a", "b"], sleep: noSleep }, async () => {
      throw new Error("503 Service Unavailable");
    }),
    /503/,
  );
});

await check("an empty endpoint list is rejected rather than silently passing", async () => {
  await assert.rejects(
    () => withFallback({ endpoints: [], sleep: noSleep }, async () => "x"),
    /No RPC endpoint/,
  );
});

console.log(`\n${passed} passed`);
