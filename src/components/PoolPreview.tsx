"use client";

import { useMemo } from "react";
import { LineChart } from "./Chart";
import { Datum, Note } from "./ui";
import { priceCurve, summarize } from "@/lib/amm";

const compact = (value: number) => {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (abs >= 1) return value.toFixed(2);
  if (abs === 0) return "0";
  return value.toPrecision(3);
};

/**
 * What the pool will do once it exists, computed from the two reserves alone —
 * no market data needed, so it works before the token has ever traded.
 */
export function PoolPreview({
  tokenAmount,
  solAmount,
  totalSupply,
}: {
  tokenAmount: number;
  solAmount: number;
  totalSupply: number;
}) {
  const valid = tokenAmount > 0 && solAmount > 0;

  const { curve, stats } = useMemo(() => {
    if (!valid) return { curve: [], stats: null };
    const pool = { tokenReserve: tokenAmount, solReserve: solAmount };
    const supply = totalSupply > 0 ? totalSupply : tokenAmount;
    return {
      curve: priceCurve(pool, supply).map((point) => ({
        x: point.solIn,
        y: point.multiple,
      })),
      stats: summarize(pool, supply),
    };
  }, [valid, tokenAmount, solAmount, totalSupply]);

  if (!valid || !stats) {
    return (
      <p className="annot">
        Enter both sides of the pool to see what the price will do.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <LineChart
        points={curve}
        xLabel="SOL bought"
        yLabel="Price, × opening"
        formatX={(value) => `${compact(value)}`}
        formatY={(value) => `${value.toFixed(1)}×`}
        caption="Every buy walks the price up this curve, and every sell walks it back down. The thinner the SOL side, the steeper it is."
      />

      <dl className="space-y-2">
        <Datum label="Opening price, SOL">{stats.openPrice.toPrecision(4)}</Datum>
        <Datum label="Opening FDV, SOL">{compact(stats.openFdvSol)}</Datum>
        <Datum label="Price move on a 1 SOL buy">
          {(stats.impactOneSol * 100).toFixed(2)}%
        </Datum>
        <Datum label="SOL needed to double the price">{stats.solToDouble.toFixed(3)}</Datum>
        <Datum label="Supply in the pool">{(stats.supplyInPool * 100).toFixed(1)}%</Datum>
      </dl>

      {stats.impactOneSol > 0.25 ? (
        <Note tone="flag">
          A single 1 SOL buy moves this price {(stats.impactOneSol * 100).toFixed(0)}%. That
          cuts both ways — the first seller moves it just as far in the other direction, and
          a chart that jumps on every trade reads as an empty pool.
        </Note>
      ) : null}

      {stats.supplyInPool < 0.5 ? (
        <Note tone="flag">
          Only {(stats.supplyInPool * 100).toFixed(0)}% of supply is in the pool. The rest sits
          in your wallet, where anyone checking holder concentration will see it.
        </Note>
      ) : null}
    </div>
  );
}
