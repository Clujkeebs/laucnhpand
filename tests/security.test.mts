import assert from "node:assert/strict";
import { encryptKeystore, decryptKeystore } from "../src/lib/keystore.ts";

process.env.AUTH_SECRET = "test-secret";
process.env.APP_PASSWORD = "hunter2hunter2";
const auth = await import("../src/lib/auth.ts");

let passed = 0;
const check = async (name: string, fn: () => unknown | Promise<unknown>) => {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

console.log("keystore");
const secret = new Uint8Array(64).map((_, i) => (i * 7 + 3) % 256);

await check("encrypt/decrypt round-trips the secret key", async () => {
  const store = await encryptKeystore(secret, "pubkey", "correct horse battery");
  const out = await decryptKeystore(store, "correct horse battery");
  assert.deepEqual([...out], [...secret]);
});

await check("wrong passphrase is rejected", async () => {
  const store = await encryptKeystore(secret, "pubkey", "correct horse battery");
  await assert.rejects(() => decryptKeystore(store, "wrong passphrase"), /Wrong passphrase/);
});

await check("each encryption uses a fresh salt and iv", async () => {
  const a = await encryptKeystore(secret, "pubkey", "same passphrase");
  const b = await encryptKeystore(secret, "pubkey", "same passphrase");
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
});

await check("ciphertext does not contain the plaintext", async () => {
  const store = await encryptKeystore(secret, "pubkey", "pass phrase here");
  const raw = Buffer.from(store.ciphertext, "base64");
  assert.ok(!raw.includes(Buffer.from(secret)));
});

console.log("auth");

await check("a fresh token verifies", async () => {
  assert.equal(await auth.verifySessionToken(await auth.createSessionToken()), true);
});

await check("a tampered signature fails", async () => {
  const token = await auth.createSessionToken();
  const [payload, sig] = token.split(".");
  const flipped = sig.slice(0, -1) + (sig.at(-1) === "a" ? "b" : "a");
  assert.equal(await auth.verifySessionToken(`${payload}.${flipped}`), false);
});

await check("an extended expiry fails (payload is signed)", async () => {
  const token = await auth.createSessionToken();
  const [, sig] = token.split(".");
  assert.equal(await auth.verifySessionToken(`${Date.now() + 10 ** 12}.${sig}`), false);
});

await check("an expired token fails", async () => {
  assert.equal(await auth.verifySessionToken("1.deadbeef"), false);
});

await check("garbage and empty tokens fail", async () => {
  assert.equal(await auth.verifySessionToken(undefined), false);
  assert.equal(await auth.verifySessionToken(""), false);
  assert.equal(await auth.verifySessionToken("nodot"), false);
});

await check("password check accepts only the exact password", async () => {
  assert.equal(await auth.checkPassword("hunter2hunter2"), true);
  assert.equal(await auth.checkPassword("hunter2hunter"), false);
  assert.equal(await auth.checkPassword(""), false);
});

console.log(`\n${passed} passed`);
