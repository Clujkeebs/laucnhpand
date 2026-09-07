/**
 * The seal: a ruled circle with an ascending series and a baseline. Uses
 * currentColor so it inherits ink in both themes; the leading mark takes the
 * signal colour, the same accent the report stamp uses.
 */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden
      className="shrink-0 text-ink"
    >
      <circle cx="16" cy="16" r="11.25" fill="none" stroke="currentColor" strokeWidth={1.4} />
      <g fill="currentColor">
        <rect x="9.4" y="17.2" width="2.6" height="5.2" />
        <rect x="14.7" y="13.6" width="2.6" height="8.8" />
      </g>
      <rect x="20" y="9.6" width="2.6" height="12.8" fill="var(--signal)" />
      <rect x="8.2" y="24.1" width="15.6" height="1.3" fill="currentColor" />
    </svg>
  );
}
