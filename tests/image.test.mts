import assert from "node:assert/strict";
import { buildPrompt, imageProvider, imageProviderLabel } from "../src/lib/image.ts";

let passed = 0;
const check = (name: string, fn: () => unknown) => { fn(); passed += 1; console.log(`  ok  ${name}`); };
const reset = () => { delete process.env.FAL_KEY; delete process.env.TOGETHER_API_KEY; };

check("with no keys it falls back to the keyless provider", () => {
  reset();
  assert.equal(imageProvider(), "pollinations");
  assert.match(imageProviderLabel(), /no key/);
});

check("Together is used when its key is present", () => {
  reset();
  process.env.TOGETHER_API_KEY = "x";
  assert.equal(imageProvider(), "together");
  reset();
});

check("fal takes precedence over Together", () => {
  reset();
  process.env.TOGETHER_API_KEY = "x";
  process.env.FAL_KEY = "y";
  assert.equal(imageProvider(), "fal");
  reset();
});

check("the prompt steers toward a legible small coin mark", () => {
  const p = buildPrompt("a frog wearing sunglasses");
  assert.match(p, /^a frog wearing sunglasses\./);
  assert.match(p, /square coin logo/i);
  assert.match(p, /legible when small/i);
});

check("surrounding whitespace in the subject is trimmed", () =>
  assert.match(buildPrompt("   neon cat   "), /^neon cat\./));

console.log(`\n${passed} passed`);
