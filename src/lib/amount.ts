/**
 * Convert a human-entered amount ("1,000,000" or "0.5") into integer base units
 * for a mint with the given decimals. All on-chain amounts are integers, so
 * getting this wrong mints the wrong supply.
 */
export function toBaseUnits(amount: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error("Decimals must be an integer between 0 and 18.");
  }
  const cleaned = amount.replace(/[,_\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) throw new Error("Amount must be a positive number.");

  const [whole, fraction = ""] = cleaned.split(".");
  if (fraction.length > decimals) {
    throw new Error(
      decimals === 0
        ? "This token has 0 decimals, so the amount must be a whole number."
        : `Amount has more than ${decimals} decimal places.`,
    );
  }
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

/** Format integer base units back into a human-readable decimal string. */
export function fromBaseUnits(base: bigint, decimals: number): string {
  if (decimals === 0) return base.toString();
  const negative = base < 0n;
  const digits = (negative ? -base : base).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
