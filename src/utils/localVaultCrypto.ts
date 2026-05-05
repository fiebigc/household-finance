const PBKDF2_ITERATIONS = 150_000;

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type EncryptedHouseholdEnvelope = {
  format: "encrypted-household-v1";
  salt: string;
  iv: string;
  ciphertext: string;
};

export function isEncryptedEnvelope(v: unknown): v is EncryptedHouseholdEnvelope {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.format === "encrypted-household-v1" &&
    typeof o.salt === "string" &&
    typeof o.iv === "string" &&
    typeof o.ciphertext === "string"
  );
}

export async function deriveVaultKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const saltBuf = new Uint8Array(salt);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuf,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function decryptEnvelope(envelope: EncryptedHouseholdEnvelope, password: string): Promise<string> {
  const salt = new Uint8Array(b64ToBytes(envelope.salt));
  const iv = new Uint8Array(b64ToBytes(envelope.iv));
  const ciphertext = new Uint8Array(b64ToBytes(envelope.ciphertext));
  const key = await deriveVaultKey(password, salt);
  const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(buf);
}

export async function decryptWithKey(ciphertextB64: string, ivB64: string, key: CryptoKey): Promise<string> {
  const iv = new Uint8Array(b64ToBytes(ivB64));
  const ciphertext = new Uint8Array(b64ToBytes(ciphertextB64));
  const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(buf);
}

/** Encrypt UTF-8 JSON; reuse `salt` from existing vault so password unlock stays consistent. */
export async function encryptWithKey(plaintextUtf8: string, key: CryptoKey): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintextUtf8));
  return {
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(new Uint8Array(buf)),
  };
}

export function randomSaltB64(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return bytesToB64(salt);
}

export function saltB64ToBytes(saltB64: string): Uint8Array {
  return b64ToBytes(saltB64);
}
