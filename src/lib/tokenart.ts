/**
 * Deterministic token artwork.
 *
 * Generates a coin mark from a seed string — no API key, no network, no cost,
 * and the same seed always produces the same image. Output is an SVG string
 * that the browser rasterises to PNG before upload.
 */

export const ART_STYLES = ["seal", "prism", "orbit", "strata"] as const;
export type ArtStyle = (typeof ART_STYLES)[number];

const SIZE = 512;

/** FNV-1a — small, fast, and stable across runs. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — deterministic PRNG seeded from the hash. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Palette = { ink: string; ground: string; accents: string[] };

/**
 * Harmonious palette from one seed hue. Accents are spaced deliberately rather
 * than randomly, so every result reads as designed instead of arbitrary.
 */
function palette(random: () => number): Palette {
  const base = Math.floor(random() * 360);
  const scheme = random();

  const offsets =
    scheme < 0.34
      ? [0, 32, -28] // analogous
      : scheme < 0.67
        ? [0, 150, 210] // triadic
        : [0, 180, 24]; // complementary + neighbour

  const dark = random() < 0.42;
  const ground = dark
    ? `hsl(${base} 32% 12%)`
    : `hsl(${(base + 40) % 360} 42% 94%)`;
  const ink = dark ? `hsl(${base} 24% 92%)` : `hsl(${base} 46% 14%)`;

  const accents = offsets.map((offset, index) => {
    const hue = (base + offset + 360) % 360;
    const saturation = 62 + index * 6;
    const lightness = dark ? 58 + index * 5 : 46 + index * 6;
    return `hsl(${hue} ${saturation}% ${lightness}%)`;
  });

  return { ink, ground, accents };
}

/** Up to two initials from the token name or symbol. */
function monogram(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function seal(random: () => number, colors: Palette, label: string): string {
  const rings = 3 + Math.floor(random() * 3);
  const teeth = 24 + Math.floor(random() * 24);
  const parts: string[] = [];

  for (let i = 0; i < rings; i += 1) {
    const r = 236 - i * (18 + random() * 22);
    parts.push(
      `<circle cx="256" cy="256" r="${r.toFixed(1)}" fill="none" stroke="${
        colors.accents[i % colors.accents.length]
      }" stroke-width="${(2 + random() * 5).toFixed(1)}" opacity="${(0.5 + random() * 0.5).toFixed(2)}"/>`,
    );
  }

  for (let i = 0; i < teeth; i += 1) {
    const angle = (i / teeth) * Math.PI * 2;
    const inner = 196;
    const outer = 196 + 14 + random() * 16;
    parts.push(
      `<line x1="${(256 + Math.cos(angle) * inner).toFixed(1)}" y1="${(256 + Math.sin(angle) * inner).toFixed(1)}" x2="${(256 + Math.cos(angle) * outer).toFixed(1)}" y2="${(256 + Math.sin(angle) * outer).toFixed(1)}" stroke="${colors.accents[0]}" stroke-width="3" opacity="0.75"/>`,
    );
  }

  parts.push(
    `<circle cx="256" cy="256" r="132" fill="${colors.accents[1]}" opacity="0.16"/>`,
    `<text x="256" y="256" text-anchor="middle" dominant-baseline="central" font-family="Georgia, 'Times New Roman', serif" font-size="132" fill="${colors.ink}">${monogram(label)}</text>`,
  );

  return parts.join("");
}

function prism(random: () => number, colors: Palette): string {
  const shapes = 5 + Math.floor(random() * 4);
  const parts: string[] = [];

  for (let i = 0; i < shapes; i += 1) {
    const cx = 120 + random() * 272;
    const cy = 120 + random() * 272;
    const size = 90 + random() * 170;
    const rotation = random() * 360;
    const color = colors.accents[i % colors.accents.length];
    const sides = 3 + Math.floor(random() * 4);

    const points: string[] = [];
    for (let s = 0; s < sides; s += 1) {
      const angle = (s / sides) * Math.PI * 2 - Math.PI / 2;
      points.push(
        `${(cx + Math.cos(angle) * size).toFixed(1)},${(cy + Math.sin(angle) * size).toFixed(1)}`,
      );
    }
    parts.push(
      `<polygon points="${points.join(" ")}" fill="${color}" opacity="0.5" transform="rotate(${rotation.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})" style="mix-blend-mode:multiply"/>`,
    );
  }
  return parts.join("");
}

function orbit(random: () => number, colors: Palette): string {
  const arcs = 4 + Math.floor(random() * 4);
  const parts: string[] = [];

  for (let i = 0; i < arcs; i += 1) {
    const radius = 70 + i * (28 + random() * 22);
    const dots = 6 + Math.floor(random() * 14);
    const phase = random() * Math.PI * 2;
    const color = colors.accents[i % colors.accents.length];

    parts.push(
      `<circle cx="256" cy="256" r="${radius.toFixed(1)}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.34"/>`,
    );
    for (let d = 0; d < dots; d += 1) {
      const angle = phase + (d / dots) * Math.PI * 2;
      parts.push(
        `<circle cx="${(256 + Math.cos(angle) * radius).toFixed(1)}" cy="${(256 + Math.sin(angle) * radius).toFixed(1)}" r="${(3 + random() * 9).toFixed(1)}" fill="${color}"/>`,
      );
    }
  }
  parts.push(`<circle cx="256" cy="256" r="34" fill="${colors.ink}"/>`);
  return parts.join("");
}

function strata(random: () => number, colors: Palette): string {
  const bands = 7 + Math.floor(random() * 9);
  const parts: string[] = [];
  let y = 0;

  for (let i = 0; i < bands && y < SIZE; i += 1) {
    const height = 18 + random() * 62;
    const color = colors.accents[i % colors.accents.length];
    const inset = random() * 90;
    parts.push(
      `<rect x="${inset.toFixed(1)}" y="${y.toFixed(1)}" width="${(SIZE - inset * 2).toFixed(1)}" height="${height.toFixed(1)}" fill="${color}" opacity="${(0.35 + random() * 0.55).toFixed(2)}"/>`,
    );
    y += height + random() * 14;
  }
  return parts.join("");
}

export type ArtOptions = {
  /** Usually the token name; drives every deterministic choice. */
  seed: string;
  style: ArtStyle;
  /** Text used for the monogram in the seal style. Defaults to the seed. */
  label?: string;
};

export function generateTokenArt({ seed, style, label }: ArtOptions): string {
  const random = rng(hash(`${style}:${seed}`));
  const colors = palette(random);

  const body =
    style === "seal"
      ? seal(random, colors, label || seed)
      : style === "prism"
        ? prism(random, colors)
        : style === "orbit"
          ? orbit(random, colors)
          : strata(random, colors);

  // Every style is masked to a circle so it reads as a coin at any size.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
<defs><clipPath id="coin"><circle cx="256" cy="256" r="256"/></clipPath></defs>
<g clip-path="url(#coin)">
<rect width="${SIZE}" height="${SIZE}" fill="${colors.ground}"/>
${body}
</g>
</svg>`;
}

/** Rasterise an SVG string to a PNG File, ready for the metadata upload. */
export async function svgToPngFile(svg: string, filename: string): Promise<File> {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Could not render the artwork."));
      element.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable in this browser.");
    context.drawImage(image, 0, 0, SIZE, SIZE);

    const png = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!png) throw new Error("Could not encode the artwork.");
    return new File([png], filename, { type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
