import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { rpcEndpoint, WSOL_MINT, type Network } from "./solana";

export type Holding = {
  mint: string;
  amount: number;
  decimals: number;
  symbol: string | null;
  name: string | null;
  logoURI: string | null;
  priceUsd: number | null;
  valueUsd: number | null;
};

export type Portfolio = {
  solBalance: number;
  solPriceUsd: number | null;
  solValueUsd: number | null;
  holdings: Holding[];
  totalUsd: number | null;
};

type PriceMap = Record<string, { price: number | null; symbol: string | null; name: string | null; logoURI: string | null }>;

async function fetchMarketData(mints: string[]): Promise<PriceMap> {
  if (mints.length === 0) return {};
  try {
    const response = await fetch("/api/market", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mints }),
    });
    if (!response.ok) return {};
    return (await response.json()) as PriceMap;
  } catch {
    return {};
  }
}

export async function fetchPortfolio(network: Network, owner: string): Promise<Portfolio> {
  const connection = new Connection(rpcEndpoint(network), "confirmed");
  const ownerKey = new PublicKey(owner);

  const [lamports, standard, token2022] = await Promise.all([
    connection.getBalance(ownerKey),
    connection.getParsedTokenAccountsByOwner(ownerKey, { programId: TOKEN_PROGRAM_ID }),
    connection
      .getParsedTokenAccountsByOwner(ownerKey, { programId: TOKEN_2022_PROGRAM_ID })
      .catch(() => ({ value: [] as never[] })),
  ]);

  const raw = [...standard.value, ...token2022.value]
    .map((account) => {
      const info = account.account.data.parsed.info as {
        mint: string;
        tokenAmount: { uiAmount: number | null; decimals: number };
      };
      return {
        mint: info.mint,
        amount: info.tokenAmount.uiAmount ?? 0,
        decimals: info.tokenAmount.decimals,
      };
    })
    .filter((entry) => entry.amount > 0);

  // Prices only exist for mainnet tokens; devnet mints have no market.
  const market =
    network === "mainnet-beta"
      ? await fetchMarketData([...raw.map((entry) => entry.mint), WSOL_MINT.toBase58()])
      : {};

  const holdings: Holding[] = raw
    .map((entry) => {
      const info = market[entry.mint];
      const priceUsd = info?.price ?? null;
      return {
        ...entry,
        symbol: info?.symbol ?? null,
        name: info?.name ?? null,
        logoURI: info?.logoURI ?? null,
        priceUsd,
        valueUsd: priceUsd === null ? null : priceUsd * entry.amount,
      };
    })
    .sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));

  const solBalance = lamports / LAMPORTS_PER_SOL;
  const solPriceUsd = market[WSOL_MINT.toBase58()]?.price ?? null;
  const solValueUsd = solPriceUsd === null ? null : solPriceUsd * solBalance;

  const holdingsUsd = holdings.reduce<number | null>((sum, holding) => {
    if (sum === null || holding.valueUsd === null) return sum;
    return sum + holding.valueUsd;
  }, 0);

  const totalUsd =
    solValueUsd === null || holdingsUsd === null ? null : solValueUsd + holdingsUsd;

  return { solBalance, solPriceUsd, solValueUsd, holdings, totalUsd };
}

export type HolderRow = { owner: string; amount: number; share: number };

/**
 * Top holders for a mint, straight from the RPC. Concentration is the number
 * buyers look at first: if a handful of wallets hold most of the supply, that
 * is what the chart is actually made of.
 */
export async function fetchTopHolders(
  network: Network,
  mint: string,
  limit = 20,
): Promise<{ rows: HolderRow[]; supply: number }> {
  const connection = new Connection(rpcEndpoint(network), "confirmed");
  const mintKey = new PublicKey(mint);

  const [largest, supply] = await Promise.all([
    connection.getTokenLargestAccounts(mintKey),
    connection.getTokenSupply(mintKey),
  ]);

  const total = supply.value.uiAmount ?? 0;
  const accounts = largest.value.slice(0, limit);

  const owners = await connection.getMultipleParsedAccounts(
    accounts.map((account) => account.address),
  );

  const rows: HolderRow[] = accounts.map((account, index) => {
    const data = owners.value[index]?.data;
    const parsedOwner =
      data && "parsed" in data ? ((data.parsed.info as { owner: string }).owner ?? "") : "";
    const amount = account.uiAmount ?? 0;
    return {
      owner: parsedOwner || account.address.toBase58(),
      amount,
      share: total > 0 ? amount / total : 0,
    };
  });

  return { rows, supply: total };
}
