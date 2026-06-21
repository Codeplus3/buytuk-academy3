/* ─── OfflineMediaEngine — Crypto Layer (AES-GCM via SubtleCrypto) ─── */

import type { EncryptedBlob } from "./types";

const subtle = globalThis.crypto?.subtle;

/** Derive a CryptoKey from a password using PBKDF2 → AES-GCM */
export async function deriveKey(password: string, salt?: Uint8Array): Promise<{ key: CryptoKey; salt: Uint8Array; keyId: string }> {
  if (!subtle) throw new Error("SubtleCrypto not available");

  const enc      = new TextEncoder();
  const usedSalt: Uint8Array<ArrayBuffer> = salt
    ? new Uint8Array(salt.buffer instanceof ArrayBuffer ? salt.buffer : salt.buffer.slice(0)) as Uint8Array<ArrayBuffer>
    : globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const keyId    = Array.from(usedSalt).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 12);

  const baseKey = await subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
  );

  const key = await subtle.deriveKey(
    { name: "PBKDF2", salt: usedSalt, iterations: 100_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  return { key, salt: usedSalt, keyId };
}

/** Generate a fresh random AES-GCM key (for ephemeral session encryption) */
export async function generateKey(): Promise<{ key: CryptoKey; keyId: string }> {
  const key   = await subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const keyId = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(16).padStart(2, "0")).join("");
  return { key, keyId };
}

/** Encrypt plaintext → EncryptedBlob */
export async function encrypt(plaintext: string, key: CryptoKey, keyId: string): Promise<EncryptedBlob> {
  const enc  = new TextEncoder();
  const iv   = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const buf  = await subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));

  return {
    iv:        btoa(String.fromCharCode(...iv)),
    data:      btoa(String.fromCharCode(...new Uint8Array(buf))),
    keyId,
    algorithm: "AES-GCM",
  };
}

/** Decrypt EncryptedBlob → plaintext */
export async function decrypt(blob: EncryptedBlob, key: CryptoKey): Promise<string> {
  const iv   = Uint8Array.from(atob(blob.iv),   c => c ? c.charCodeAt(0) : 0);
  const data = Uint8Array.from(atob(blob.data), c => c ? c.charCodeAt(0) : 0);
  const buf  = await subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(buf);
}

/** Quick hash of a string using SHA-256 → hex */
export async function sha256hex(input: string): Promise<string> {
  const buf  = await subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export const CryptoAvailable = !!globalThis.crypto?.subtle;
