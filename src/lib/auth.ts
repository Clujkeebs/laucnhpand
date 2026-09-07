/**
 * Single-user session auth. Uses Web Crypto only, so the same code runs in
 * middleware (edge runtime) and in route handlers.
 */

export const SESSION_COOKIE = "launchpad_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const enc = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set.");
  return value;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(payload) as BufferSource));
}

/** Constant-time comparison so a wrong guess leaks nothing through timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(): Promise<string> {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = String(expires);
  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expires = Number(payload);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  return safeEqual(signature, await sign(payload));
}

export async function checkPassword(candidate: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) throw new Error("APP_PASSWORD is not set.");
  // Hash both sides first so the comparison length doesn't reveal the real length.
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(candidate) as BufferSource),
    crypto.subtle.digest("SHA-256", enc.encode(expected) as BufferSource),
  ]);
  return safeEqual(toHex(a), toHex(b));
}

export const SESSION_MAX_AGE = SESSION_TTL_MS / 1000;
