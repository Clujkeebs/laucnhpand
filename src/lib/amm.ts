/**
 * Constant-product pool math (x * y = k), matching Raydium CPMM.
 *
 * This is what your launch actually looks like to a buyer: how far the price
 * moves when someone buys, and how much SOL it takes to move it. It needs no
 * market data — only the two reserves you seed the pool with — so it works
 * before the token has ever traded.
 */

/** Raydium CPMM standard fee: 0.25% of the input, taken before the swap. */
export const DEFAULT_FEE_RATE = 0.0025;

export type Pool = {
  /** Token reserve, in whole tokens. */
  tokenReserve: number;
  /** SOL reserve, in whole SOL. */
  solReserve: number;
  feeRate?: number;
};

export function spotPrice(pool: Pool): number {
  if (pool.tokenReserve <= 0) return 0;
  return pool.solReserve / pool.tokenReserve;
}

/** Tokens received for spending `solIn` SOL, and where that leaves the price. */
export function buy(pool: Pool, solIn: number) {
  const fee = pool.feeRate ?? DEFAULT_FEE_RATE;
  if (solIn <= 0 || pool.tokenReserve <= 0 || pool.solReserve <= 0) {
    return { tokensOut: 0, newPrice: spotPrice(pool), avgPrice: 0, priceImpact: 0 };
  }

  const k = pool.tokenReserve * pool.solReserve;
  const effectiveIn = solIn * (1 - fee);
  const newSol = pool.solReserve + effectiveIn;
  const newToken = k / newSol;
  const tokensOut = pool.tokenReserve - newToken;

  const before = spotPrice(pool);
  // Price after the trade uses the real SOL added, fee included — the fee stays
  // in the pool, so it moves the quoted price too.
  const newPrice = (pool.solReserve + solIn) / newToken;
  const avgPrice = solIn / tokensOut;

  return {
    tokensOut,
    newPrice,
    avgPrice,
    priceImpact: before > 0 ? newPrice / before - 1 : 0,
  };
}

/** SOL received for selling `tokensIn` tokens. */
export function sell(pool: Pool, tokensIn: number) {
  const fee = pool.feeRate ?? DEFAULT_FEE_RATE;
  if (tokensIn <= 0 || pool.tokenReserve <= 0 || pool.solReserve <= 0) {
    return { solOut: 0, newPrice: spotPrice(pool), priceImpact: 0 };
  }

  const k = pool.tokenReserve * pool.solReserve;
  const effectiveIn = tokensIn * (1 - fee);
  const newToken = pool.tokenReserve + effectiveIn;
  const newSol = k / newToken;
  const solOut = pool.solReserve - newSol;

  const before = spotPrice(pool);
  const newPrice = (pool.solReserve - solOut) / (pool.tokenReserve + tokensIn);

  return { solOut, newPrice, priceImpact: before > 0 ? newPrice / before - 1 : 0 };
}

export type CurvePoint = {
  /** Cumulative SOL spent buying into the pool. */
  solIn: number;
  /** Marginal price after that much buying, in SOL per token. */
  price: number;
  /** Multiple of the opening price. */
  multiple: number;
  /** Fully-diluted valuation at that price, in SOL. */
  fdvSol: number;
};

/**
 * The pool's price curve: what the price does as buy pressure accumulates.
 * `maxSolIn` defaults to four times the SOL side, which is enough to show the
 * shape without running off into the asymptote.
 */
export function priceCurve(
  pool: Pool,
  totalSupply: number,
  steps = 60,
  maxSolIn?: number,
): CurvePoint[] {
  const limit = maxSolIn ?? pool.solReserve * 4;
  const open = spotPrice(pool);
  const points: CurvePoint[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const solIn = (limit * i) / steps;
    const price = i === 0 ? open : buy(pool, solIn).newPrice;
    points.push({
      solIn,
      price,
      multiple: open > 0 ? price / open : 0,
      fdvSol: price * totalSupply,
    });
  }
  return points;
}

/**
 * How much SOL a buyer must spend to move the price by `multiple`.
 *
 * Exact, not approximate. The swap fee stays in the pool, so it lifts the SOL
 * reserve as well as the quoted price. Writing m for the multiple:
 *
 *   (y + s)·(y + s(1-f)) = m·y²
 *
 * which is a quadratic in s with a = (1-f), b = y(2-f), c = y²(1-m).
 */
export function solToReachMultiple(pool: Pool, multiple: number): number {
  if (multiple <= 1 || pool.solReserve <= 0) return 0;
  const f = pool.feeRate ?? DEFAULT_FEE_RATE;
  const y = pool.solReserve;

  const a = 1 - f;
  const b = y * (2 - f);
  const c = y * y * (1 - multiple);

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return Infinity;
  return (-b + Math.sqrt(discriminant)) / (2 * a);
}

export type PoolSummary = {
  openPrice: number;
  openFdvSol: number;
  /** Price impact of a 1 SOL buy, as a fraction. */
  impactOneSol: number;
  /** SOL required to double the price. */
  solToDouble: number;
  /** Share of total supply sitting in the pool. */
  supplyInPool: number;
};

export function summarize(pool: Pool, totalSupply: number): PoolSummary {
  return {
    openPrice: spotPrice(pool),
    openFdvSol: spotPrice(pool) * totalSupply,
    impactOneSol: buy(pool, 1).priceImpact,
    solToDouble: solToReachMultiple(pool, 2),
    supplyInPool: totalSupply > 0 ? pool.tokenReserve / totalSupply : 0,
  };
}
