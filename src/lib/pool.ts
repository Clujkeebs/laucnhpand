import {
  CREATE_CPMM_POOL_FEE_ACC,
  CREATE_CPMM_POOL_PROGRAM,
  DEVNET_PROGRAM_ID,
  getCpmmPdaAmmConfigId,
  Raydium,
  TxVersion,
  type ApiCpmmConfigInfo,
  type ApiV3PoolInfoStandardItemCpmm,
  type CpmmKeys,
} from "@raydium-io/raydium-sdk-v2";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { rpcEndpoint, WSOL_MINT, type Network } from "./solana";
import { toBaseUnits } from "./token";

export type PoolParams = {
  /** Your token's mint address. */
  mint: string;
  decimals: number;
  /** How many of your tokens to seed the pool with, in human units. */
  tokenAmount: string;
  /** How much SOL to pair against them, in human units. */
  solAmount: string;
};

export type PoolResult = {
  poolId: string;
  lpMint: string;
  signature: string;
};

async function loadRaydium(network: Network, owner: Keypair): Promise<Raydium> {
  const connection = new Connection(rpcEndpoint(network), "confirmed");
  return Raydium.load({
    connection,
    owner,
    cluster: network === "devnet" ? "devnet" : "mainnet",
    disableFeatureCheck: true,
    disableLoadToken: true,
    blockhashCommitment: "confirmed",
  });
}

function cpmmProgramIds(network: Network) {
  return network === "devnet"
    ? {
        programId: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
        poolFeeAccount: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC,
      }
    : { programId: CREATE_CPMM_POOL_PROGRAM, poolFeeAccount: CREATE_CPMM_POOL_FEE_ACC };
}

async function resolveFeeConfig(
  raydium: Raydium,
  network: Network,
): Promise<ApiCpmmConfigInfo> {
  const configs = await raydium.api.getCpmmConfigs();
  if (!configs.length) throw new Error("Raydium returned no CPMM fee configs.");
  if (network === "devnet") {
    // Devnet uses a different program, so the API's mainnet config ids don't apply.
    for (const config of configs) {
      config.id = getCpmmPdaAmmConfigId(
        DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
        config.index,
      ).publicKey.toBase58();
    }
  }
  return configs[0];
}

/**
 * Create a Raydium CPMM pool pairing your token against SOL. Whatever you put
 * in here is real, spendable liquidity — treat the SOL side as committed capital,
 * not a deposit you plan to take back out.
 */
export async function createLiquidityPool(
  network: Network,
  owner: Keypair,
  params: PoolParams,
): Promise<PoolResult> {
  const raydium = await loadRaydium(network, owner);
  const feeConfig = await resolveFeeConfig(raydium, network);
  const { programId, poolFeeAccount } = cpmmProgramIds(network);

  const mintA = {
    address: params.mint,
    decimals: params.decimals,
    programId: (await raydium.token.getTokenInfo(params.mint)).programId,
  };
  const mintB = {
    address: WSOL_MINT.toBase58(),
    decimals: 9,
    programId: (await raydium.token.getTokenInfo(WSOL_MINT.toBase58())).programId,
  };

  const { execute, extInfo } = await raydium.cpmm.createPool({
    programId,
    poolFeeAccount,
    mintA,
    mintB,
    mintAAmount: new BN(toBaseUnits(params.tokenAmount, params.decimals).toString()),
    mintBAmount: new BN(toBaseUnits(params.solAmount, 9).toString()),
    startTime: new BN(0),
    feeConfig,
    associatedOnly: false,
    ownerInfo: { useSOLBalance: true },
    txVersion: TxVersion.V0,
  });

  const { txId } = await execute({ sendAndConfirm: true });

  return {
    poolId: extInfo.address.poolId.toBase58(),
    lpMint: extInfo.address.lpMint.toBase58(),
    signature: txId,
  };
}

/**
 * Burn LP tokens by locking them permanently with no fee-claim NFT recipient
 * you can act on later. Once LP is locked or burned the liquidity cannot be
 * withdrawn — by you or anyone else. This is the single most important signal
 * to a buyer that the pool is not going to disappear.
 */
export async function lockLiquidity(
  network: Network,
  owner: Keypair,
  poolId: string,
  lpAmount: string,
): Promise<string> {
  const raydium = await loadRaydium(network, owner);

  let poolInfo: ApiV3PoolInfoStandardItemCpmm;
  let poolKeys: CpmmKeys | undefined;

  if (network === "devnet") {
    const data = await raydium.cpmm.getPoolInfoFromRpc(poolId);
    poolInfo = data.poolInfo;
    poolKeys = data.poolKeys;
  } else {
    const data = await raydium.api.fetchPoolById({ ids: poolId });
    poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm;
  }

  const { execute } = await raydium.cpmm.lockLp({
    poolInfo,
    poolKeys,
    lpAmount: new BN(toBaseUnits(lpAmount, poolInfo.lpMint.decimals).toString()),
    withMetadata: true,
    txVersion: TxVersion.V0,
  });

  const { txId } = await execute({ sendAndConfirm: true });
  return txId;
}

export type PoolSummary = {
  poolId: string;
  mintA: string;
  mintB: string;
  price: number;
  tvl: number;
  lpMint: string;
  lpAmount: number;
};

export async function fetchPool(
  network: Network,
  owner: Keypair,
  poolId: string,
): Promise<PoolSummary> {
  const raydium = await loadRaydium(network, owner);
  const { poolInfo } = await raydium.cpmm.getPoolInfoFromRpc(poolId);
  return {
    poolId,
    mintA: poolInfo.mintA.address,
    mintB: poolInfo.mintB.address,
    price: poolInfo.price,
    tvl: poolInfo.tvl,
    lpMint: poolInfo.lpMint.address,
    lpAmount: poolInfo.lpAmount,
  };
}

export function isValidMint(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}
