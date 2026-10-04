import { WrongPassphraseError, type VaultConfig } from "../types";

const HEADER = "JOTTER-ENC1\n";
const CHECK_PLAINTEXT = "jotter-vault-check-v1";
export const DEFAULT_ITERATIONS = 600_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("WebCrypto is unavailable");
  return s;
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}
export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64.trim());
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function isEncrypted(text: string): boolean {
  return text.startsWith(HEADER);
}

export async function deriveKey(passphrase: string, saltB64: string, iterations: number): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(saltB64) as BufferSource, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable
    ["encrypt", "decrypt"],
  );
}

export async function encryptBytes(key: CryptoKey, bytes: Uint8Array): Promise<Uint8Array> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv }, key, bytes as BufferSource));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return out;
}

export async function decryptBytes(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  if (data.length < 12 + 16) throw new WrongPassphraseError();
  try {
    const pt = await subtle().decrypt(
      { name: "AES-GCM", iv: data.subarray(0, 12) as BufferSource },
      key,
      data.subarray(12) as BufferSource,
    );
    return new Uint8Array(pt);
  } catch {
    throw new WrongPassphraseError();
  }
}

export async function encryptText(key: CryptoKey, plaintext: string): Promise<string> {
  return HEADER + toBase64(await encryptBytes(key, enc.encode(plaintext)));
}

export async function decryptText(key: CryptoKey, armored: string): Promise<string> {
  if (!isEncrypted(armored)) throw new WrongPassphraseError();
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(armored.slice(HEADER.length));
  } catch {
    throw new WrongPassphraseError();
  }
  return dec.decode(await decryptBytes(key, bytes));
}

export function plainVaultConfig(): VaultConfig {
  return { version: 1, encryption: null };
}

export async function createVaultConfig(
  passphrase: string,
  iterations: number = DEFAULT_ITERATIONS,
): Promise<{ config: VaultConfig; key: CryptoKey }> {
  const its = Math.max(iterations, DEFAULT_ITERATIONS);
  const saltB64 = toBase64(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveKey(passphrase, saltB64, its);
  const checkB64 = await encryptText(key, CHECK_PLAINTEXT);
  return { config: { version: 1, encryption: { kdf: "PBKDF2-SHA256", iterations: its, saltB64, checkB64 } }, key };
}

export async function unlockVault(passphrase: string, config: VaultConfig): Promise<CryptoKey> {
  const e = config.encryption;
  if (!e) throw new Error("Vault is not encrypted");
  const key = await deriveKey(passphrase, e.saltB64, e.iterations);
  const check = await decryptText(key, e.checkB64); // throws WrongPassphraseError
  if (check !== CHECK_PLAINTEXT) throw new WrongPassphraseError();
  return key;
}
