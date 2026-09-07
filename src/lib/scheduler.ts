import type { Network } from "./solana";

/**
 * Configuration and audit log for unattended runs.
 *
 * Everything here lives in the browser, and so does the key that signs — which
 * means automation only runs while the tab is open. There is no server-side
 * cron, because a scheduled job on the server would need your private key
 * sitting in an environment variable.
 */

const CONFIG_KEY = "launchpad.schedule.v1";
const LOG_KEY = "launchpad.schedule.log.v1";
const MAX_LOG = 200;

export type ScheduleConfig = {
  enabled: boolean;
  brief: string;
  intervalMinutes: number;
  maxRunsPerDay: number;
  maxSolPerDay: number;
  /** Live runs must be acknowledged separately from arming the schedule. */
  allowMainnet: boolean;
};

export const DEFAULT_CONFIG: ScheduleConfig = {
  enabled: false,
  brief: "",
  intervalMinutes: 1440,
  maxRunsPerDay: 1,
  maxSolPerDay: 0.1,
  allowMainnet: false,
};

export type RunStatus = "launched" | "skipped" | "failed";

export type RunRecord = {
  at: string;
  status: RunStatus;
  detail: string;
  network: Network;
  mint?: string;
  spentSol?: number;
};

export function loadConfig(): ScheduleConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as ScheduleConfig) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: ScheduleConfig): void {
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function loadLog(): RunRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOG_KEY) ?? "[]") as RunRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendLog(record: RunRecord): RunRecord[] {
  const next = [record, ...loadLog()].slice(0, MAX_LOG);
  window.localStorage.setItem(LOG_KEY, JSON.stringify(next));
  return next;
}

export function clearLog(): void {
  window.localStorage.removeItem(LOG_KEY);
}

function isToday(iso: string, now = new Date()): boolean {
  const then = new Date(iso);
  return (
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate()
  );
}

export type DailyUsage = { runs: number; spentSol: number };

/** Only launches count against the caps — a skipped or failed run spends nothing. */
export function usageToday(log: RunRecord[], now = new Date()): DailyUsage {
  return log
    .filter((entry) => entry.status === "launched" && isToday(entry.at, now))
    .reduce<DailyUsage>(
      (total, entry) => ({
        runs: total.runs + 1,
        spentSol: total.spentSol + (entry.spentSol ?? 0),
      }),
      { runs: 0, spentSol: 0 },
    );
}

export type Blocker =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Decides whether an unattended run may proceed. Every gate is checked before
 * anything is signed, and the caller must respect a refusal.
 */
export function canRun(
  config: ScheduleConfig,
  log: RunRecord[],
  network: Network,
  balanceSol: number | null,
  now = new Date(),
): Blocker {
  if (!config.enabled) return { ok: false, reason: "Automation is off." };
  if (!config.brief.trim()) return { ok: false, reason: "No brief set." };
  if (network === "mainnet-beta" && !config.allowMainnet) {
    return { ok: false, reason: "Live runs are not enabled." };
  }

  const usage = usageToday(log, now);
  if (usage.runs >= config.maxRunsPerDay) {
    return { ok: false, reason: `Daily limit reached (${config.maxRunsPerDay}).` };
  }
  if (usage.spentSol >= config.maxSolPerDay) {
    return {
      ok: false,
      reason: `Daily spend cap reached (${config.maxSolPerDay} SOL).`,
    };
  }
  if (balanceSol !== null && balanceSol < 0.03) {
    return { ok: false, reason: "Balance is below the cost of a launch." };
  }

  return { ok: true };
}

/** Whether enough time has passed since the last attempt of any kind. */
export function isDue(log: RunRecord[], intervalMinutes: number, now = new Date()): boolean {
  const last = log[0];
  if (!last) return true;
  return now.getTime() - new Date(last.at).getTime() >= intervalMinutes * 60_000;
}
