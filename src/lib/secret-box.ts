import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Authenticated encryption (AES-256-GCM) under a key derived from a secret, for small values such as OAuth tokens.
 * Output is base64 of iv | tag | ciphertext.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(secret: string, purpose: string) {
    if (secret.length < 16)
      throw new Error("The secret must be at least 16 characters.");
    this.key = Buffer.from(
      hkdfSync("sha256", secret, "hei", purpose, 32) as ArrayBuffer,
    );
  }

  seal(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
      "base64",
    );
  }

  /** Throws when the value was sealed under another secret or has been altered. */
  open(sealed: string): string {
    const bytes = Buffer.from(sealed, "base64");
    const iv = bytes.subarray(0, IV_BYTES);
    const tag = bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
  }
}
