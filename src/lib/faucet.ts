/**
 * Devnet airdrops.
 *
 * The public devnet faucet is heavily rate-limited and answers with a bare
 * "Internal error" when it is throttled or dry, which tells you nothing. This
 * retries sensibly, falls back to smaller amounts, and translates whatever
 * comes back into something you can act on.
 */

export const AIRDROP_AMOUNTS = [1, 0.5] as const;

/** The official hosted faucet, which works when the RPC one is exhausted. */
export const WEB_FAUCET = "https://faucet.solana.com";

/**
 * Turns a faucet failure into plain language. The RPC returns the same opaque
 * "Internal error" for throttling, exhaustion and per-address caps, so the
 * guidance has to cover all three.
 */
export function explainAirdropError(error: unknown): string {
  const message = (
    error instanceof Error ? error.message : typeof error === "string" ? error : ""
  ).toLowerCase();

  if (/429|rate|too many/.test(message)) {
    return "The devnet faucet is rate-limiting you. It allows only a couple of requests per address per day.";
  }
  if (/internal error|500|502|503|unavailable/.test(message)) {
    return "The public devnet faucet is throttled or out of funds — this is its normal state under load, not a problem with your wallet.";
  }
  if (/airdrop request failed|faucet has run dry|dry/.test(message)) {
    return "The devnet faucet is dry right now.";
  }
  if (/invalid|not a valid|base58/.test(message)) {
    return "That address was rejected as invalid.";
  }
  if (/fetch|network|timeout|timed out/.test(message)) {
    return "Could not reach the devnet RPC. Check your connection, or set NEXT_PUBLIC_DEVNET_RPC.";
  }
  return error instanceof Error && error.message
    ? `The faucet refused: ${error.message}`
    : "The faucet refused the request.";
}

/** Whether another attempt is worth making, or the caller should stop and explain. */
export function isRetryableAirdropError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  if (/invalid|not a valid|base58/.test(message)) return false;
  return /429|rate|too many|internal error|500|502|503|unavailable|timeout|timed out|fetch|dry/.test(
    message,
  );
}
