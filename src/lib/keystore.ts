/**
 * Client-side encrypted keystore.
 *
 * The secret key never leaves the browser and is never sent to the server.
 * It lives in localStorage encrypted with AES-256-GCM under a key derived
 * from your passphrase via PBKDF2-SHA256. Losing the passphrase means losing
 * the wallet — there is no recovery path, by design.
 */

const STORAGE_KEY = "launchpad.keystore.v1";
const PBKDF2_ITERATIONS = 600_000;

export type Keystore = {
  version: 1;
  publicKey: string;
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

const enc = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptKeystore(
  secretKey: Uint8Array,
  publicKey: string,
  passphrase: string,
): Promise<Keystore> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    secretKey as BufferSource,
  );
  return {
    version: 1,
    publicKey,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  };
}

export async function decryptKeystore(keystore: Keystore, passphrase: string): Promise<Uint8Array> {
  const key = await deriveKey(passphrase, fromBase64(keystore.salt));
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(keystore.iv) as BufferSource },
      key,
      fromBase64(keystore.ciphertext) as BufferSource,
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new Error("Wrong passphrase.");
  }
}

export function loadKeystore(): Keystore | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Keystore;
    return parsed.version === 1 && parsed.ciphertext ? parsed : null;
  } catch {
    return null;
  }
}

export function saveKeystore(keystore: Keystore): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keystore));
}

export function clearKeystore(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
