/**
 * RPC endpoint selection and retry policy. Pure — no chain imports — so the
 * rules that decide where to send a call and whether to retry it are testable.
 *
 * Public Solana endpoints rate-limit aggressively, and a 429 halfway through a
 * multi-transaction launch is the most likely way a real launch breaks. Both
 * RPC variables accept a comma-separated list, and calls fall through the list
 * before giving up.
 */

export const PUBLIC_MAINNET = "https://api.mainnet-beta.solana.com";
export const PUBLIC_DEVNET = "https://api.devnet.solana.com";

/**
 * Free, keyless public nodes used when nothing is configured. Several, not one:
 * any single free endpoint will throttle, but they rarely throttle at the same
 * moment, and reads fall through the list. This is a floor, not a substitute
 * for a dedicated endpoint.
 */
export const DEFAULT_MAINNET = [
  PUBLIC_MAINNET,
  "https://solana-rpc.publicnode.com",
  "https://solana.drpc.org",
];

export const DEFAULT_DEVNET = [
  PUBLIC_DEVNET,
  "https://solana-devnet-rpc.publicnode.com",
];

/** Parses a comma-separated endpoint list, keeping only usable http(s) URLs. */
export function parseEndpoints(value: string | undefined, fallback: string | string[]): string[] {
  const parsed = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => /^https?:\/\/\S+$/i.test(entry));

  const unique = [...new Set(parsed)];
  if (unique.length > 0) return unique;
  return Array.isArray(fallback) ? [...fallback] : [fallback];
}

/**
 * True when nothing was configured, so the app is running on shared free nodes.
 * Distinct from "only one endpoint" — a single dedicated endpoint is fine.
 */
export function usingDefaults(endpoints: string[], defaults: string[]): boolean {
  return (
    endpoints.length === defaults.length &&
    endpoints.every((endpoint, index) => endpoint === defaults[index])
  );
}

/** True when the endpoint list is just the rate-limited public node. */
export function isPublicOnly(endpoints: string[], publicUrl: string): boolean {
  return endpoints.length === 1 && endpoints[0] === publicUrl;
}

const TRANSIENT = [
  /\b429\b/,
  /\b5\d\d\b/,
  /rate.?limit/i,
  /too many requests/i,
  /timed? ?out/i,
  /timeout/i,
  /fetch failed/i,
  /failed to fetch/i,
  /network ?error/i,
  /socket hang up/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /service unavailable/i,
  /blockhash not found/i,
  /node is behind/i,
];

/**
 * Whether a failure is worth retrying. A rejected transaction or a bad
 * parameter is not — retrying those wastes time and can double-send.
 */
export function isTransient(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!message) return false;
  // A simulation failure or explicit rejection is a real answer, not a blip.
  if (/insufficient|invalid|already in use|custom program error|signature verification/i.test(message)) {
    return false;
  }
  return TRANSIENT.some((pattern) => pattern.test(message));
}

/** Exponential backoff with a ceiling, in milliseconds. */
export function backoffMs(attempt: number, base = 400, ceiling = 4000): number {
  return Math.min(base * 2 ** Math.max(attempt, 0), ceiling);
}

export type RetryOptions = {
  endpoints: string[];
  attemptsPerEndpoint?: number;
  sleep?: (ms: number) => Promise<void>;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `call` against each endpoint in turn, retrying transient failures before
 * moving on. A non-transient failure aborts immediately — it will fail the same
 * way everywhere.
 */
export async function withFallback<T>(
  { endpoints, attemptsPerEndpoint = 2, sleep = wait }: RetryOptions,
  call: (endpoint: string) => Promise<T>,
): Promise<T> {
  if (endpoints.length === 0) throw new Error("No RPC endpoint configured.");
  let lastError: unknown = new Error("No RPC endpoint configured.");

  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt < attemptsPerEndpoint; attempt += 1) {
      try {
        return await call(endpoint);
      } catch (error) {
        lastError = error;
        if (!isTransient(error)) throw error;
        if (attempt < attemptsPerEndpoint - 1) await sleep(backoffMs(attempt));
      }
    }
  }

  throw lastError;
}
