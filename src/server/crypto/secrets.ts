import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption for secrets stored in the database (license keys, notification
 * credentials). AES-256-GCM; output is "v1.<iv>.<tag>.<ciphertext>" in base64url.
 * The key comes from the SECRET_KEY environment variable and never touches the database.
 */

const DEV_KEY_SOURCE = "itys-development-only-secret-key";

function loadKey(): Buffer {
  const source = process.env.SECRET_KEY;
  if (!source) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SECRET_KEY is not set. Generate one with: openssl rand -base64 32");
    }
    return deriveKey(DEV_KEY_SOURCE);
  }
  if (source.length < 32) throw new Error("SECRET_KEY must be at least 32 characters.");
  return deriveKey(source);
}

/** Any sufficiently long secret string becomes a 32-byte key. */
export function deriveKey(source: string): Buffer {
  return createHash("sha256").update(source).digest();
}

let cached: Buffer | undefined;
const defaultKey = () => (cached ??= loadKey());

export function encryptSecret(plain: string, key: Buffer = defaultKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** Throws if the value was tampered with or encrypted with a different key. */
export function decryptSecret(stored: string, key: Buffer = defaultKey()): string {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== "v1" || !iv || !tag || data === undefined) throw new Error("Unrecognised secret format.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
