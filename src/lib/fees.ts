/**
 * Creator fee economics. Pure arithmetic, no chain dependencies.
 *
 * The whole earnings model of a curve launch is here: your fee is a fixed cut
 * of trading volume. There is no leverage in it, so twice the volume is exactly
 * twice the fee, and no volume is no fee.
 */

export type FeeRates = {
  /** Total trade fee taken on every buy and sell, as a fraction. */
  tradeFeeRate: number;
  /** The creator's share of the trade, as a fraction of volume. */
  creatorFeeRate: number;
};

/** What a given amount of trading volume pays the creator. */
export function feesFromVolume(volumeSol: number, rates: FeeRates): number {
  if (!Number.isFinite(volumeSol) || volumeSol <= 0) return 0;
  return volumeSol * rates.creatorFeeRate;
}

/** Trading volume required to earn a target amount in creator fees. */
export function volumeForTarget(targetSol: number, rates: FeeRates): number {
  if (rates.creatorFeeRate <= 0) return Infinity;
  if (!Number.isFinite(targetSol) || targetSol <= 0) return 0;
  return targetSol / rates.creatorFeeRate;
}
