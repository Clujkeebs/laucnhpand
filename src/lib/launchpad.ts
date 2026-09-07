/**
 * Raydium LaunchLab — bonding-curve issuance.
 *
 * This is the honest version of "launch without putting money in". You create
 * the token against a bonding curve instead of funding a pool, so your only
 * outlay is account rent. Buyers trade against the curve, a disclosed trade fee
 * is taken on every trade, and the creator's share of that fee accrues to a
 * vault you can claim from. When the curve raises its target the pool migrates
 * to a normal Raydium pool automatically.
 *
 * The money comes from trading volume, not from anyone being misled: the fee
 * rate is on chain and every buyer can read it before they trade. No volume,
 * no fees.
 */

import {
  Curve,
  DEV_LAUNCHPAD_PROGRAM,
  LAUNCHPAD_PROGRAM,
  LaunchpadConfig,
  LaunchpadPool,
  PlatformConfig,
  Raydium,
  TxVersion,
  getPdaCreatorVault,
  getPdaLaunchpadConfigId,
  getPdaLaunchpadPoolId,
  getPdaPlatformId,
} from "@raydium-io/raydium-sdk-v2";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { rpcEndpoint, type Network } from "./solana";
import type { FeeRates } from "./fees";

export { feesFromVolume, volumeForTarget, type FeeRates } from "./fees";

/** Raydium expresses every fee rate against this denominator. */
export const FEE_DENOMINATOR = 1_000_000;

function programs(network: Network) {
  return network === "devnet"
    ? { programId: DEV_LAUNCHPAD_PROGRAM }
    : { programId: LAUNCHPAD_PROGRAM };
}

async function load(network: Network, owner: Keypair): Promise<Raydium> {
  return Raydium.load({
    connection: new Connection(rpcEndpoint(network), "confirmed"),
    owner,
    cluster: network === "devnet" ? "devnet" : "mainnet",
    disableFeatureCheck: true,
    disableLoadToken: true,
    blockhashCommitment: "confirmed",
  });
}

export type FreeLaunchParams = {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  /**
   * SOL the creator spends buying their own tokens at creation. Zero is
   * allowed and is the point of this flow.
   */
  initialBuySol: number;
};

export type FreeLaunchResult = {
  mint: string;
  poolId: string;
  signature: string;
};

export async function createFreeLaunch(
  network: Network,
  payer: Keypair,
  params: FreeLaunchParams,
  onProgress: (step: string) => void = () => {},
): Promise<FreeLaunchResult> {
  const raydium = await load(network, payer);
  const { programId } = programs(network);
  const mintKeypair = Keypair.generate();

  const configId = getPdaLaunchpadConfigId(programId, NATIVE_MINT, 0, 0).publicKey;

  onProgress("Creating the bonding curve…");
  const { execute } = await raydium.launchpad.createLaunchpad({
    programId,
    mintA: mintKeypair.publicKey,
    decimals: params.decimals,
    name: params.name,
    symbol: params.symbol,
    uri: params.uri,
    migrateType: "cpmm",
    configId,
    buyAmount: new BN(Math.round(params.initialBuySol * LAMPORTS_PER_SOL)),
    createOnly: params.initialBuySol <= 0,
    extraSigners: [mintKeypair],
    txVersion: TxVersion.V0,
    slippage: new BN(100),
  });

  onProgress("Confirming…");
  // createLaunchpad can span several transactions; they must land in order.
  const { txIds } = await execute({ sequentially: true, sendAndConfirm: true });

  return {
    mint: mintKeypair.publicKey.toBase58(),
    poolId: getPdaLaunchpadPoolId(programId, mintKeypair.publicKey, NATIVE_MINT).publicKey.toBase58(),
    signature: txIds[txIds.length - 1],
  };
}

export type CurveState = {
  mint: string;
  poolId: string;
  /** Effective reserves, in whole units — feed straight into the AMM math. */
  tokenReserve: number;
  solReserve: number;
  /** SOL actually raised so far. */
  raisedSol: number;
  /** SOL that must be raised before the curve migrates to a real pool. */
  targetSol: number;
  progress: number;
  priceSol: number;
  migrated: boolean;
};

export async function fetchCurveState(
  network: Network,
  mint: string,
): Promise<CurveState> {
  const connection = new Connection(rpcEndpoint(network), "confirmed");
  const { programId } = programs(network);
  const mintKey = new PublicKey(mint);
  const poolId = getPdaLaunchpadPoolId(programId, mintKey, NATIVE_MINT).publicKey;

  const account = await connection.getAccountInfo(poolId);
  if (!account) throw new Error("No bonding curve exists for that mint on this network.");

  const pool = LaunchpadPool.decode(account.data);
  const decimalsA = pool.mintDecimalsA;
  const decimalsB = pool.mintDecimalsB;

  const tokenReserve =
    Number(pool.virtualA.sub(pool.realA).toString()) / 10 ** decimalsA;
  const solReserve = Number(pool.virtualB.add(pool.realB).toString()) / 10 ** decimalsB;
  const raisedSol = Number(pool.realB.toString()) / 10 ** decimalsB;
  const targetSol = Number(pool.totalFundRaisingB.toString()) / 10 ** decimalsB;

  const price = Curve.getPrice({
    poolInfo: pool,
    curveType: 0,
    decimalA: decimalsA,
    decimalB: decimalsB,
  });

  return {
    mint,
    poolId: poolId.toBase58(),
    tokenReserve,
    solReserve,
    raisedSol,
    targetSol,
    progress: targetSol > 0 ? Math.min(raisedSol / targetSol, 1) : 0,
    priceSol: price.toNumber(),
    migrated: pool.status !== 0,
  };
}

/**
 * Live fee rates, read from the on-chain config rather than assumed. These are
 * what decide whether the fee side of a launch is worth anything.
 */
export async function fetchFeeRates(network: Network): Promise<FeeRates> {
  const connection = new Connection(rpcEndpoint(network), "confirmed");
  const { programId } = programs(network);

  const configId = getPdaLaunchpadConfigId(programId, NATIVE_MINT, 0, 0).publicKey;
  const platformId = getPdaPlatformId(programId, NATIVE_MINT).publicKey;

  const [configAccount, platformAccount] = await connection.getMultipleAccountsInfo([
    configId,
    platformId,
  ]);

  const tradeFeeRate = configAccount
    ? Number(LaunchpadConfig.decode(configAccount.data).tradeFeeRate.toString()) / FEE_DENOMINATOR
    : 0.01;

  let creatorFeeRate = 0;
  if (platformAccount) {
    const platform = PlatformConfig.decode(platformAccount.data);
    creatorFeeRate =
      Number(platform.creatorFeeRate.toString()) / FEE_DENOMINATOR ||
      (tradeFeeRate * Number(platform.creatorScale.toString())) / FEE_DENOMINATOR;
  }

  return { tradeFeeRate, creatorFeeRate };
}

/** SOL sitting in your creator fee vault, waiting to be claimed. */
export async function fetchClaimableFees(
  network: Network,
  owner: string,
): Promise<number> {
  const connection = new Connection(rpcEndpoint(network), "confirmed");
  const { programId } = programs(network);
  const vault = getPdaCreatorVault(programId, new PublicKey(owner), NATIVE_MINT).publicKey;

  const account = await connection.getAccountInfo(vault);
  if (!account) return 0;

  // The vault is rent-exempt, so only the surplus above rent is actually yours.
  const rent = await connection.getMinimumBalanceForRentExemption(account.data.length);
  return Math.max(account.lamports - rent, 0) / LAMPORTS_PER_SOL;
}

export async function claimCreatorFees(network: Network, payer: Keypair): Promise<string> {
  const raydium = await load(network, payer);
  const { programId } = programs(network);

  const { execute } = await raydium.launchpad.claimCreatorFee({
    programId,
    mintB: NATIVE_MINT,
    txVersion: TxVersion.V0,
  });

  const { txId } = await execute({ sendAndConfirm: true });
  return txId;
}

