import assert from "node:assert/strict";
import { canRun, isDue, usageToday, DEFAULT_CONFIG, type RunRecord } from "../src/lib/scheduler.ts";

let passed = 0;
const check = (name: string, fn: () => unknown) => { fn(); passed += 1; console.log(`  ok  ${name}`); };

const NOW = new Date("2026-09-07T12:00:00Z");
const armed = { ...DEFAULT_CONFIG, enabled: true, brief: "memecoins", maxRunsPerDay: 3, maxSolPerDay: 0.1 };

const run = (over: Partial<RunRecord> = {}): RunRecord => ({
  at: NOW.toISOString(),
  status: "launched",
  detail: "",
  network: "devnet",
  spentSol: 0.02,
  ...over,
});

check("an armed schedule with headroom may run", () =>
  assert.deepEqual(canRun(armed, [], "devnet", 1, NOW), { ok: true }));

check("automation off blocks everything", () => {
  const blocked = canRun({ ...armed, enabled: false }, [], "devnet", 1, NOW);
  assert.equal(blocked.ok, false);
});

check("an empty brief blocks the run", () => {
  const blocked = canRun({ ...armed, brief: "   " }, [], "devnet", 1, NOW);
  assert.equal(blocked.ok, false);
});

check("mainnet is blocked unless separately allowed", () => {
  assert.equal(canRun(armed, [], "mainnet-beta", 1, NOW).ok, false);
  assert.equal(canRun({ ...armed, allowMainnet: true }, [], "mainnet-beta", 1, NOW).ok, true);
});

check("the daily run cap is enforced", () => {
  const log = [run(), run(), run()];
  const blocked = canRun(armed, log, "devnet", 1, NOW);
  assert.equal(blocked.ok, false);
  assert.match((blocked as { reason: string }).reason, /Daily limit/);
});

check("the daily spend cap is enforced before the run cap is hit", () => {
  const log = [run({ spentSol: 0.09 }), run({ spentSol: 0.02 })];
  const blocked = canRun(armed, log, "devnet", 1, NOW);
  assert.equal(blocked.ok, false);
  assert.match((blocked as { reason: string }).reason, /spend cap/);
});

check("a balance below launch cost blocks the run", () =>
  assert.equal(canRun(armed, [], "devnet", 0.01, NOW).ok, false));

check("an unknown balance does not block", () =>
  assert.equal(canRun(armed, [], "devnet", null, NOW).ok, true));

check("yesterday's launches do not count against today", () => {
  const yesterday = run({ at: "2026-09-06T23:59:00Z", spentSol: 5 });
  assert.deepEqual(usageToday([yesterday], NOW), { runs: 0, spentSol: 0 });
  assert.equal(canRun(armed, [yesterday], "devnet", 1, NOW).ok, true);
});

check("skipped and failed runs cost nothing against the caps", () => {
  const log = [run({ status: "skipped", spentSol: 0 }), run({ status: "failed", spentSol: 0 })];
  assert.deepEqual(usageToday(log, NOW), { runs: 0, spentSol: 0 });
  assert.equal(canRun(armed, log, "devnet", 1, NOW).ok, true);
});

check("usage sums only today's launches", () => {
  const log = [run({ spentSol: 0.02 }), run({ spentSol: 0.03 }), run({ at: "2026-09-01T12:00:00Z", spentSol: 9 })];
  assert.deepEqual(usageToday(log, NOW), { runs: 2, spentSol: 0.05 });
});

check("a run is due when the log is empty", () => assert.equal(isDue([], 1440, NOW), true));

check("a run is not due before the interval elapses", () => {
  const recent = [run({ at: new Date(NOW.getTime() - 60_000).toISOString() })];
  assert.equal(isDue(recent, 1440, NOW), false);
});

check("a run is due once the interval has elapsed", () => {
  const old = [run({ at: new Date(NOW.getTime() - 1441 * 60_000).toISOString() })];
  assert.equal(isDue(old, 1440, NOW), true);
});

check("failed attempts still reset the interval, so failures cannot spin", () => {
  const recentFailure = [run({ status: "failed", at: new Date(NOW.getTime() - 60_000).toISOString() })];
  assert.equal(isDue(recentFailure, 1440, NOW), false);
});

check("defaults ship disarmed, single-run, devnet-only", () => {
  assert.equal(DEFAULT_CONFIG.enabled, false);
  assert.equal(DEFAULT_CONFIG.allowMainnet, false);
  assert.equal(DEFAULT_CONFIG.maxRunsPerDay, 1);
});

console.log(`\n${passed} passed`);
