import { describe, expect, it } from "vitest";
import { WrongPassphraseError } from "../../lib/types";
import { createVaultConfig, decryptBytes, decryptText, deriveKey, encryptBytes, encryptText, isEncrypted, plainVaultConfig, unlockVault } from "../../lib/core/crypto";

describe("crypto", () => {
  it("createVaultConfig makes a random salt, >=600000 iterations, and unlockVault accepts the right passphrase", async () => {
    const a = await createVaultConfig("correct horse");
    const b = await createVaultConfig("correct horse");
    expect(a.config.encryption!.iterations).toBeGreaterThanOrEqual(600000);
    expect(a.config.encryption!.saltB64).not.toBe(b.config.encryption!.saltB64);
    const key = await unlockVault("correct horse", a.config);
    expect(await decryptText(key, await encryptText(a.key, "hi"))).toBe("hi");
  });
  it("unlockVault throws WrongPassphraseError for a wrong passphrase", async () => {
    const { config } = await createVaultConfig("right");
    await expect(unlockVault("wrong", config)).rejects.toBeInstanceOf(WrongPassphraseError);
  });
  it("text round-trips including unicode, with the JOTTER-ENC1 single-line armor and fresh IV each time", async () => {
    const { key } = await createVaultConfig("pw");
    const text = "# Héllo 🌍\n\nbody [[link]]";
    const a = await encryptText(key, text);
    const b = await encryptText(key, text);
    expect(a.startsWith("JOTTER-ENC1\n")).toBe(true);
    expect(a.split("\n").length).toBe(2);
    expect(isEncrypted(a)).toBe(true);
    expect(isEncrypted(text)).toBe(false);
    expect(a).not.toBe(b);
    expect(await decryptText(key, a)).toBe(text);
  });
  it("bytes round-trip and the layout is iv(12)||ciphertext+tag(16)", async () => {
    const { key } = await createVaultConfig("pw");
    const bytes = new Uint8Array([0, 1, 2, 255, 254]);
    const enc = await encryptBytes(key, bytes);
    expect(enc.length).toBe(12 + bytes.length + 16);
    expect([...(await decryptBytes(key, enc))]).toEqual([...bytes]);
  });
  it("tampered ciphertext and wrong keys throw WrongPassphraseError", async () => {
    const { key } = await createVaultConfig("pw");
    const other = await deriveKey("other", btoa("saltsaltsaltsalt"), 1000);
    const armored = await encryptText(key, "secret");
    await expect(decryptText(other, armored)).rejects.toBeInstanceOf(WrongPassphraseError);
    const bad = armored.slice(0, -6) + (armored.endsWith("AAAA==") ? "BBBB==" : "AAAA==");
    await expect(decryptText(key, bad)).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(decryptText(key, "plain text")).rejects.toBeInstanceOf(WrongPassphraseError);
  });
  it("derived keys are non-extractable", async () => {
    const { key } = await createVaultConfig("pw");
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toBeTruthy();
  });
  it("plainVaultConfig has no encryption", () => {
    expect(plainVaultConfig()).toEqual({ version: 1, encryption: null });
  });
});
