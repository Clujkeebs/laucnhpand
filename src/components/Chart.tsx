"use client";

import { useId, useMemo, useState } from "react";

const W = 620;
const H = 250;
const PAD = { top: 14, right: 16, bottom: 30, left: 54 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

export type Point = { x: number; y: number };

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const span = max - min;
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= max + step * 1e-9; value += step) ticks.push(value);
  return ticks;
}

/**
 * Single-series line chart with a crosshair and tooltip. One series, so the
 * title carries identity and no legend is needed.
 */
export function LineChart({
  points,
  xLabel,
  yLabel,
  formatX,
  formatY,
  caption,
  series = 1,
}: {
  points: Point[];
  xLabel: string;
  yLabel: string;
  formatX: (value: number) => string;
  formatY: (value: number) => string;
  caption?: string;
  series?: 1 | 2 | 3 | 4;
}) {
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const bounds = useMemo(() => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys, 0),
      maxY: Math.max(...ys),
    };
  }, [points]);

  if (points.length < 2) return null;

  const sx = (x: number) =>
    PAD.left + ((x - bounds.minX) / (bounds.maxX - bounds.minX || 1)) * PLOT_W;
  const sy = (y: number) =>
    PAD.top + PLOT_H - ((y - bounds.minY) / (bounds.maxY - bounds.minY || 1)) * PLOT_H;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x)},${sy(p.y)}`).join(" ");
  const area = `${path} L${sx(points[points.length - 1].x)},${PAD.top + PLOT_H} L${sx(points[0].x)},${PAD.top + PLOT_H} Z`;

  const yTicks = niceTicks(bounds.minY, bounds.maxY);
  const xTicks = niceTicks(bounds.minX, bounds.maxX);
  const active = hover === null ? null : points[hover];
  const stroke = `var(--series-${series})`;

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = ((event.clientX - rect.left) / rect.width) * W;
    const xValue =
      bounds.minX + ((ratio - PAD.left) / PLOT_W) * (bounds.maxX - bounds.minX);
    let closest = 0;
    let best = Infinity;
    points.forEach((point, index) => {
      const distance = Math.abs(point.x - xValue);
      if (distance < best) {
        best = distance;
        closest = index;
      }
    });
    setHover(closest);
  }

  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`${yLabel} against ${xLabel}`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} />
            </clipPath>
          </defs>

          {yTicks.map((tick) => (
            <g key={`y${tick}`}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={sy(tick)}
                y2={sy(tick)}
                stroke="var(--grid)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={sy(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-[var(--ink-faint)] font-[family-name:var(--font-data)] text-[9px]"
              >
                {formatY(tick)}
              </text>
            </g>
          ))}

          {xTicks.map((tick) => (
            <text
              key={`x${tick}`}
              x={sx(tick)}
              y={H - 10}
              textAnchor="middle"
              className="fill-[var(--ink-faint)] font-[family-name:var(--font-data)] text-[9px]"
            >
              {formatX(tick)}
            </text>
          ))}

          <g clipPath={`url(#${clipId})`}>
            <path d={area} fill={stroke} opacity={0.08} />
            <path d={path} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
          </g>

          {active ? (
            <g>
              <line
                x1={sx(active.x)}
                x2={sx(active.x)}
                y1={PAD.top}
                y2={PAD.top + PLOT_H}
                stroke="var(--ink-faint)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <circle
                cx={sx(active.x)}
                cy={sy(active.y)}
                r={4.5}
                fill={stroke}
                stroke="var(--paper-raised)"
                strokeWidth={2}
              />
            </g>
          ) : null}

          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + PLOT_H}
            y2={PAD.top + PLOT_H}
            stroke="var(--rule)"
            strokeWidth={1}
          />
        </svg>

        {active ? (
          <div
            className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap border border-rule bg-paper-raised px-2 py-1.5"
            style={{ left: `${(sx(active.x) / W) * 100}%` }}
          >
            <p className="data text-[10px] text-ink-faint">
              {xLabel} {formatX(active.x)}
            </p>
            <p className="data text-[11px] font-bold">{formatY(active.y)}</p>
          </div>
        ) : null}
      </div>

      <figcaption className="mt-2 flex justify-between">
        <span className="eyebrow">{xLabel}</span>
        <span className="eyebrow">{yLabel}</span>
      </figcaption>
      {caption ? <p className="annot mt-2">{caption}</p> : null}
    </figure>
  );
}

export type Bar = { label: string; value: number; highlight?: boolean };

/** Horizontal bars for magnitude comparisons, with a per-bar hover tooltip. */
export function BarChart({
  bars,
  formatValue,
  max,
}: {
  bars: Bar[];
  formatValue: (value: number) => string;
  max?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const ceiling = max ?? (Math.max(...bars.map((bar) => bar.value), 0) || 1);

  return (
    <ul className="space-y-1.5">
      {bars.map((bar, index) => (
        <li
          key={`${bar.label}-${index}`}
          className="grid grid-cols-[auto_1fr_auto] items-center gap-3"
          onMouseEnter={() => setHover(index)}
          onMouseLeave={() => setHover(null)}
        >
          <span className="data w-14 shrink-0 truncate text-[11px] text-ink-soft">
            {bar.label}
          </span>
          <span className="relative block h-3.5 bg-paper-sunk">
            <span
              className="absolute inset-y-0 left-0 rounded-r-[3px] transition-[width] duration-300"
              style={{
                width: `${Math.max((bar.value / ceiling) * 100, 0.6)}%`,
                background: bar.highlight ? "var(--series-2)" : "var(--series-1)",
                opacity: hover === null || hover === index ? 1 : 0.45,
              }}
            />
          </span>
          <span className="data w-16 shrink-0 text-right text-[11px]">
            {formatValue(bar.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}
