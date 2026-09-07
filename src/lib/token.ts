import {
  createUmi,
} from "@metaplex-foundation/umi-bundle-defaults";
import {
  generateSigner,
  keypairIdentity,
  percentAmount,
  publicKey as toUmiPublicKey,
  type Umi,
} from "@metaplex-foundation/umi";
import {
  createFungible,
  mintV1,
  mplTokenMetadata,
  TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  AuthorityType,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { rpcEndpoint, type Network } from "./solana";

/** Fixed on-chain size of a Token Metadata account. */
const METADATA_ACCOUNT_SIZE = 679;
const TOKEN_ACCOUNT_SIZE = 165;

export type TokenParams = {
  name: string;
  symbol: string;
  decimals: number;
  supply: string;
  uri: string;
  revokeMintAuthority: boolean;
  revokeFreezeAuthority: boolean;
};

export type LaunchCost = {
  mintRent: number;
  metadataRent: number;
  tokenAccountRent: number;
  fees: number;
  total: number;
};

/**
 * Real cost of a launch, in SOL. There is no free mint on Solana: every account
 * you create has to be rent-exempt, and that SOL is locked until the account is
 * closed.
 */
export async function estimateLaunchCost(connection: Connection): Promise<LaunchCost> {
  const [mintRent, metadataRent, tokenAccountRent] = await Promise.all([
    connection.getMinimumBalanceForRentExemption(MINT_SIZE),
    connection.getMinimumBalanceForRentExemption(METADATA_ACCOUNT_SIZE),
    connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE),
  ]);
  // A handful of signatures across create + mint + revoke transactions.
  const fees = 5000 * 6;
  const total = mintRent + metadataRent + tokenAccountRent + fees;
  return {
    mintRent: mintRent / LAMPORTS_PER_SOL,
    metadataRent: metadataRent / LAMPORTS_PER_SOL,
    tokenAccountRent: tokenAccountRent / LAMPORTS_PER_SOL,
    fees: fees / LAMPORTS_PER_SOL,
    total: total / LAMPORTS_PER_SOL,
  };
}

function umiFor(network: Network, payer: Keypair): Umi {
  const umi = createUmi(rpcEndpoint(network)).use(mplTokenMetadata());
  const signer = umi.eddsa.createKeypairFromSecretKey(payer.secretKey);
  return umi.use(keypairIdentity(signer));
}

/** Convert a human supply ("1000000") into base units for the given decimals. */
export function toBaseUnits(supply: string, decimals: number): bigint {
  const cleaned = supply.replace(/[,_\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) throw new Error("Supply must be a positive number.");
  const [whole, fraction = ""] = cleaned.split(".");
  if (fraction.length > decimals) {
    throw new Error(`Supply has more than ${decimals} decimal places.`);
  }
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

export type LaunchResult = {
  mint: string;
  createSignature: string;
  revokeSignature: string | null;
};

export type LaunchProgress = (step: string) => void;

export async function launchToken(
  network: Network,
  payer: Keypair,
  params: TokenParams,
  onProgress: LaunchProgress = () => {},
): Promise<LaunchResult> {
  const amount = toBaseUnits(params.supply, params.decimals);
  if (amount <= 0n) throw new Error("Supply must be greater than zero.");

  const umi = umiFor(network, payer);
  const mintSigner = generateSigner(umi);

  onProgress("Creating mint and on-chain metadata…");
  const builder = createFungible(umi, {
    mint: mintSigner,
    name: params.name,
    symbol: params.symbol,
    uri: params.uri,
    sellerFeeBasisPoints: percentAmount(0),
    decimals: params.decimals,
  }).add(
    mintV1(umi, {
      mint: mintSigner.publicKey,
      authority: umi.identity,
      amount,
      tokenOwner: umi.identity.publicKey,
      tokenStandard: TokenStandard.Fungible,
    }),
  );

  const { signature } = await builder.sendAndConfirm(umi, {
    confirm: { commitment: "confirmed" },
  });
  const createSignature = bs58.encode(signature);
  const mint = new PublicKey(mintSigner.publicKey.toString());

  let revokeSignature: string | null = null;
  if (params.revokeMintAuthority || params.revokeFreezeAuthority) {
    onProgress("Revoking authorities…");
    revokeSignature = await revokeAuthorities(network, payer, mint, {
      mint: params.revokeMintAuthority,
      freeze: params.revokeFreezeAuthority,
    });
  }

  return { mint: mint.toBase58(), createSignature, revokeSignature };
}

/**
 * Permanently give up the ability to mint more supply and/or to freeze holder
 * accounts. This is irreversible, and it is the strongest signal you can give
 * buyers that the supply they see is the supply that exists.
 */
export async function revokeAuthorities(
  network: Network,
  payer: Keypair,
  mint: PublicKey,
  which: { mint: boolean; freeze: boolean },
): Promise<string> {
  const connection = new Connection(rpcEndpoint(network), "confirmed");
  const transaction = new Transaction();

  if (which.mint) {
    transaction.add(
      createSetAuthorityInstruction(
        mint,
        payer.publicKey,
        AuthorityType.MintTokens,
        null,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );
  }
  if (which.freeze) {
    transaction.add(
      createSetAuthorityInstruction(
        mint,
        payer.publicKey,
        AuthorityType.FreezeAccount,
        null,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );
  }
  if (transaction.instructions.length === 0) throw new Error("Nothing to revoke.");

  return sendAndConfirmTransaction(connection, transaction, [payer], {
    commitment: "confirmed",
  });
}

export type MintStatus = {
  mint: string;
  decimals: number;
  supply: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  name?: string;
  symbol?: string;
  uri?: string;
};

/** Read the live authority + supply state of a mint, plus its metadata if present. */
export async function fetchMintStatus(
  network: Network,
  mintAddress: string,
): Promise<MintStatus> {
  const connection = new Connection(rpcEndpoint(network), "confirmed");
  const mint = new PublicKey(mintAddress);
  const info = await connection.getParsedAccountInfo(mint);
  const data = info.value?.data;
  if (!data || !("parsed" in data)) throw new Error("Not a token mint on this network.");

  const parsed = data.parsed.info as {
    decimals: number;
    supply: string;
    mintAuthority: string | null;
    freezeAuthority: string | null;
  };

  const status: MintStatus = {
    mint: mintAddress,
    decimals: parsed.decimals,
    supply: parsed.supply,
    mintAuthority: parsed.mintAuthority,
    freezeAuthority: parsed.freezeAuthority,
  };

  try {
    const umi = createUmi(rpcEndpoint(network)).use(mplTokenMetadata());
    const { fetchMetadataFromSeeds } = await import("@metaplex-foundation/mpl-token-metadata");
    const metadata = await fetchMetadataFromSeeds(umi, { mint: toUmiPublicKey(mintAddress) });
    status.name = metadata.name.replace(/\0/g, "").trim();
    status.symbol = metadata.symbol.replace(/\0/g, "").trim();
    status.uri = metadata.uri.replace(/\0/g, "").trim();
  } catch {
    // Mint exists but has no Token Metadata account — fine, leave the fields unset.
  }

  return status;
}

export function associatedTokenAddress(mint: string, owner: string): string {
  return getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(owner)).toBase58();
}
