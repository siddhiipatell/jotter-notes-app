import { decryptBytes, decryptText, encryptBytes, encryptText, isEncrypted } from "@/lib/core/crypto";
import { base64ToBytes, bytesToBase64, fromUtf8, utf8 } from "./bytes";

const HEADER = "JOTTER-ENC1\n";

export const isEncryptedText = (t: string): boolean => isEncrypted(t);
export const isEncryptedBytes = (b: Uint8Array): boolean =>
  b.length > HEADER.length && fromUtf8(b.subarray(0, HEADER.length)) === HEADER;

export const encText = (key: CryptoKey, s: string): Promise<string> => encryptText(key, s);
export const decText = (key: CryptoKey, s: string): Promise<string> => decryptText(key, s);

/** Attachments use the same armored text format as notes. */
export async function encAttachment(key: CryptoKey, bytes: Uint8Array): Promise<Uint8Array> {
  return utf8(HEADER + bytesToBase64(await encryptBytes(key, bytes)));
}
export async function decAttachment(key: CryptoKey, file: Uint8Array): Promise<Uint8Array> {
  return decryptBytes(key, base64ToBytes(fromUtf8(file).slice(HEADER.length)));
}
