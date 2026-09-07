import { NextResponse } from "next/server";

const PRICE_API = "https://lite-api.jup.ag/price/v3";
const TOKEN_API = "https://lite-api.jup.ag/tokens/v2/search";

type MarketEntry = {
  price: number | null;
  symbol: string | null;
  name: string | null;
  logoURI: string | null;
};

/**
 * Proxy for Jupiter's public price + token metadata APIs. Runs server-side so
 * the browser isn't making cross-origin calls on every dashboard render.
 */
export async function POST(request: Request) {
  let mints: string[] = [];
  try {
    ({ mints } = (await request.json()) as { mints: string[] });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const unique = [...new Set(mints)].filter(Boolean).slice(0, 100);
  if (unique.length === 0) return NextResponse.json({});

  const result: Record<string, MarketEntry> = {};
  for (const mint of unique) {
    result[mint] = { price: null, symbol: null, name: null, logoURI: null };
  }

  // Jupiter caps each request, so page through in batches.
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += 50) batches.push(unique.slice(i, i + 50));

  await Promise.all(
    batches.map(async (batch) => {
      const query = batch.join(",");
      const [prices, tokens] = await Promise.all([
        fetch(`${PRICE_API}?ids=${query}`, { next: { revalidate: 30 } })
          .then((r) => (r.ok ? r.json() : {}))
          .catch(() => ({})),
        fetch(`${TOKEN_API}?query=${query}`, { next: { revalidate: 300 } })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
      ]);

      const priceMap = prices as Record<string, { usdPrice?: number }>;
      for (const [mint, value] of Object.entries(priceMap)) {
        if (result[mint] && typeof value?.usdPrice === "number") {
          result[mint].price = value.usdPrice;
        }
      }

      const tokenList = Array.isArray(tokens)
        ? (tokens as { id: string; symbol?: string; name?: string; icon?: string }[])
        : [];
      for (const token of tokenList) {
        const entry = result[token.id];
        if (!entry) continue;
        entry.symbol = token.symbol ?? null;
        entry.name = token.name ?? null;
        entry.logoURI = token.icon ?? null;
      }
    }),
  );

  return NextResponse.json(result);
}
