import type { Network } from "./solana";

const KEY = "launchpad.launches.v1";

export type LaunchRecord = {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  supply: string;
  network: Network;
  createdAt: string;
  poolId?: string;
  lpMint?: string;
};

export function listLaunches(): LaunchRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as LaunchRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberLaunch(record: LaunchRecord): void {
  const existing = listLaunches().filter((entry) => entry.mint !== record.mint);
  window.localStorage.setItem(KEY, JSON.stringify([record, ...existing].slice(0, 200)));
}

export function updateLaunch(mint: string, patch: Partial<LaunchRecord>): void {
  const updated = listLaunches().map((entry) =>
    entry.mint === mint ? { ...entry, ...patch } : entry,
  );
  window.localStorage.setItem(KEY, JSON.stringify(updated));
}

export function forgetLaunch(mint: string): void {
  window.localStorage.setItem(
    KEY,
    JSON.stringify(listLaunches().filter((entry) => entry.mint !== mint)),
  );
}
