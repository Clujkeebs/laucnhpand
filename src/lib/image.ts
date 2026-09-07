/**
 * Text-to-image generation.
 *
 * Three providers, chosen by whichever key is present. The last needs no key at
 * all, so image generation works on a wallet with nothing in it — which is the
 * whole point for a first launch.
 *
 * Each provider enforces its own content policy; this passes the prompt through
 * and reports what comes back rather than adding or removing filtering.
 */

export type ImageProvider = "fal" | "together" | "pollinations";

export function imageProvider(): ImageProvider {
  if (process.env.FAL_KEY) return "fal";
  if (process.env.TOGETHER_API_KEY) return "together";
  return "pollinations";
}

export function imageProviderLabel(): string {
  return {
    fal: "fal.ai · FLUX schnell",
    together: "Together · FLUX.1-schnell",
    pollinations: "Pollinations · free, no key",
  }[imageProvider()];
}

export class ImageError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ImageError";
    this.status = status;
  }
}

const SIZE = 512;

/** Coin art is square and read at ~40px, so the prompt is steered accordingly. */
export function buildPrompt(subject: string): string {
  return `${subject.trim()}. Square coin logo, bold simple shapes, high contrast, centred subject, clean flat background, legible when small.`;
}

async function viaFal(prompt: string): Promise<Buffer> {
  const response = await fetch("https://fal.run/fal-ai/flux/schnell", {
    method: "POST",
    headers: {
      Authorization: `Key ${process.env.FAL_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ prompt, image_size: "square", num_images: 1 }),
  });
  if (!response.ok) {
    throw new ImageError(`fal.ai returned ${response.status}.`, response.status === 401 ? 401 : 502);
  }
  const body = (await response.json()) as { images?: { url?: string }[] };
  const url = body.images?.[0]?.url;
  if (!url) throw new ImageError("fal.ai returned no image.", 502);
  const image = await fetch(url);
  if (!image.ok) throw new ImageError("Could not download the generated image.", 502);
  return Buffer.from(await image.arrayBuffer());
}

async function viaTogether(prompt: string): Promise<Buffer> {
  const response = await fetch("https://api.together.xyz/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.TOGETHER_IMAGE_MODEL || "black-forest-labs/FLUX.1-schnell-Free",
      prompt,
      width: SIZE,
      height: SIZE,
      n: 1,
      response_format: "b64_json",
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ImageError(
      `Together returned ${response.status}. ${detail.slice(0, 200)}`,
      response.status === 401 ? 401 : response.status === 429 ? 429 : 502,
    );
  }
  const body = (await response.json()) as { data?: { b64_json?: string; url?: string }[] };
  const entry = body.data?.[0];
  if (entry?.b64_json) return Buffer.from(entry.b64_json, "base64");
  if (entry?.url) {
    const image = await fetch(entry.url);
    if (!image.ok) throw new ImageError("Could not download the generated image.", 502);
    return Buffer.from(await image.arrayBuffer());
  }
  throw new ImageError("Together returned no image.", 502);
}

async function viaPollinations(prompt: string, seed: number): Promise<Buffer> {
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${SIZE}&height=${SIZE}&nologo=true&seed=${seed}`;

  // Free and unauthenticated, so it can be slow; give it room before failing.
  const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!response.ok) {
    throw new ImageError(
      `The free image service returned ${response.status}. It is shared and sometimes busy — try again.`,
      502,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1000) throw new ImageError("The free image service returned nothing usable.", 502);
  return bytes;
}

export async function generateImage(subject: string, seed = Date.now() % 100000): Promise<Buffer> {
  const prompt = buildPrompt(subject);
  const provider = imageProvider();

  try {
    if (provider === "fal") return await viaFal(prompt);
    if (provider === "together") return await viaTogether(prompt);
    return await viaPollinations(prompt, seed);
  } catch (error) {
    if (error instanceof ImageError) throw error;
    if (error instanceof Error && /abort|timeout/i.test(error.message)) {
      throw new ImageError("The image service timed out. Try again, or use a generated mark.", 504);
    }
    throw new ImageError("Could not reach the image service.", 502);
  }
}
