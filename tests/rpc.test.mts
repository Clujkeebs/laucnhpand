import assert from "node:assert/strict";
import {
  parseEndpoints, isPublicOnly, usingDefaults, isTransient, backoffMs, withFallback,
  PUBLIC_MAINNET, DEFAULT_MAINNET, DEFAULT_DEVNET,
} from "../src/lib/rpc.ts";

let passed = 0;
const check = async (name: string, fn: () => unknown) => { await fn(); passed += 1; console.log(`  ok  ${name}`); };
const noSleep = async () => {};

await check("an unset variable falls back to every default node, not just one", () => {
  assert.deepEqual(parseEndpoints(undefined, DEFAULT_MAINNET), DEFAULT_MAINNET);
  assert.ok(DEFAULT_MAINNET.length > 1, "a single default defeats the fallback");
  assert.ok(DEFAULT_DEVNET.length > 1);
});

await check("the defaults are distinct, https, and lead with the canonical node", () => {
  for (const list of [DEFAULT_MAINNET, DEFAULT_DEVNET]) {
    assert.equal(new Set(list).size, list.length, "duplicate default endpoint");
    assert.ok(list.every((u) => u.startsWith("https://")));
  }
  assert.equal(DEFAULT_MAINNET[0], PUBLIC_MAINNET);
});

await check("a configured endpoint replaces the defaults entirely", () =>
  assert.deepEqual(parseEndpoints("https://mine.example", DEFAULT_MAINNET), ["https://mine.example"]));

await check("usingDefaults distinguishes unconfigured from a single dedicated node", () => {
  assert.equal(usingDefaults(DEFAULT_MAINNET, DEFAULT_MAINNET), true);
  assert.equal(usingDefaults(["https://mine.example"], DEFAULT_MAINNET), false);
  assert.equal(usingDefaults([...DEFAULT_MAINNET].reverse(), DEFAULT_MAINNET), false);
});

await check("a comma-separated list is split and trimmed", () =>
  assert.deepEqual(parseEndpoints(" https://a.co , https://b.co ", PUBLIC_MAINNET),
    ["https://a.co", "https://b.co"]));

await check("a string fallback still works alongside the list form", () =>
  assert.deepEqual(parseEndpoints(undefined, PUBLIC_MAINNET), [PUBLIC_MAINNET]));

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
