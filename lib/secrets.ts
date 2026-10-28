/**
 * App-level encryption for per-client secrets stored in Postgres
 * (`client_integrations.secret_ciphertext`, see
 * db/migrations/006_client_settings.sql) — the OpenPanel client secret and
 * the per-client leads ingest secret. AES-256-GCM, keyed by the
 * `CONFIG_ENCRYPTION_KEY` env var (32 random bytes, base64), so a DB dump
 * or a read-only DB credential alone can't recover them.
 *
 * Losing CONFIG_ENCRYPTION_KEY doesn't lose any data, only those secrets:
 * they'd have to be re-entered from each dashboard's Configuración page.
 * Rotating it means decrypting every row with the old key and re-encrypting
 * with the new one — not built, do it by hand if it's ever needed.
 *
 * Stored format: `v1:<iv b64>:<auth tag b64>:<ciphertext b64>`.
 *
 * Server-only. Never import from a Client Component.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function getKey(): Buffer {
  const raw = process.env.CONFIG_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "Missing CONFIG_ENCRYPTION_KEY — generate one with `openssl rand -base64 32` and add it to .env.local (and Coolify).",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CONFIG_ENCRYPTION_KEY must be 32 bytes, base64-encoded (`openssl rand -base64 32`).");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, ciphertext] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error("Unrecognized encrypted secret format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** JSON object of secret fields → one ciphertext, so each integration row has a single secret column. */
export function encryptSecretFields(fields: Record<string, string>): string {
  return encryptSecret(JSON.stringify(fields));
}

export function decryptSecretFields(stored: string | null): Record<string, string> {
  if (!stored) return {};
  const parsed: unknown = JSON.parse(decryptSecret(stored));
  return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
}

/** "abcd1234wxyz" → "••••wxyz" — the only form a stored secret is ever shown in the UI. */
export function maskSecret(value: string | undefined): string | null {
  if (!value) return null;
  return `••••${value.slice(-4)}`;
}
