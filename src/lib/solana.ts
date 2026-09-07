import { Connection, PublicKey } from "@solana/web3.js";

export type Network = "mainnet-beta" | "devnet";

const NETWORK_KEY = "launchpad.network";

export const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
export const LAMPORTS_PER_SOL_DECIMALS = 9;

/**
 * Public RPC endpoints are heavily rate-limited and will fail under real use.
 * Set NEXT_PUBLIC_MAINNET_RPC to a Helius/QuickNode/Triton URL before launching
 * anything on mainnet.
 */
export function rpcEndpoint(network: Network): string {
  if (network === "devnet") {
    return process.env.NEXT_PUBLIC_DEVNET_RPC || "https://api.devnet.solana.com";
  }
  return process.env.NEXT_PUBLIC_MAINNET_RPC || "https://api.mainnet-beta.solana.com";
}

export function usingPublicRpc(network: Network): boolean {
  return network === "devnet"
    ? !process.env.NEXT_PUBLIC_DEVNET_RPC
    : !process.env.NEXT_PUBLIC_MAINNET_RPC;
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
