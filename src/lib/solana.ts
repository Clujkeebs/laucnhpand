import { Connection, PublicKey } from "@solana/web3.js";
import {
  DEFAULT_DEVNET,
  DEFAULT_MAINNET,
  parseEndpoints,
  usingDefaults,
  withFallback,
} from "./rpc";

export type Network = "mainnet-beta" | "devnet";

const NETWORK_KEY = "launchpad.network";

export const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

/**
 * Public RPC endpoints are heavily rate-limited and will fail under real use.
 * Set NEXT_PUBLIC_MAINNET_RPC to a Helius/QuickNode/Triton URL before launching
 * anything on mainnet.
 */
/** Both variables accept a comma-separated list; calls fall through it in order. */
export function rpcEndpoints(network: Network): string[] {
  return network === "devnet"
    ? parseEndpoints(process.env.NEXT_PUBLIC_DEVNET_RPC, DEFAULT_DEVNET)
    : parseEndpoints(process.env.NEXT_PUBLIC_MAINNET_RPC, DEFAULT_MAINNET);
}

export function rpcEndpoint(network: Network): string {
  return rpcEndpoints(network)[0];
}

/**
 * Runs a read against each configured endpoint in turn, retrying rate limits
 * and network blips. Use this for reads; transaction sends stay on one
 * connection so a retry can never double-send.
 */
export function readWithFallback<T>(
  network: Network,
  call: (connection: Connection) => Promise<T>,
): Promise<T> {
  return withFallback({ endpoints: rpcEndpoints(network) }, (endpoint) =>
    call(new Connection(endpoint, { commitment: "confirmed" })),
  );
}

export function usingPublicRpc(network: Network): boolean {
  return usingDefaults(
    rpcEndpoints(network),
    network === "devnet" ? DEFAULT_DEVNET : DEFAULT_MAINNET,
  );
}

export function createConnection(network: Network): Connection {
  return new Connection(rpcEndpoint(network), { commitment: "confirmed" });
}

export function loadNetwork(): Network {
  if (typeof window === "undefined") return "devnet";
  const stored = window.localStorage.getItem(NETWORK_KEY);
  return stored === "mainnet-beta" ? "mainnet-beta" : "devnet";
}

export function saveNetwork(network: Network): void {
  window.localStorage.setItem(NETWORK_KEY, network);
}

export function explorerUrl(kind: "tx" | "address" | "token", value: string, network: Network): string {
  const suffix = network === "devnet" ? "?cluster=devnet" : "";
  return `https://solscan.io/${kind}/${value}${suffix}`;
}

export function shortAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 1) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}
