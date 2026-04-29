import { createHmac, timingSafeEqual, randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getEncryptionKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Verifies the Shopify OAuth callback HMAC.
 * Removes the `hmac` param, sorts remaining params lexicographically,
 * joins as key=value pairs, and compares HMAC-SHA256 with timing-safe equality.
 */
export function verifyOAuthHmac(query: Record<string, string>, secret: string): boolean {
  const { hmac, ...rest } = query;
  if (!hmac) return false;

  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('&');

  const digest = createHmac('sha256', secret).update(message).digest('hex');

  try {
    return timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(hmac, 'hex'));
  } catch {
    // Buffers of different length — invalid hmac
    return false;
  }
}

/**
 * Verifies the Shopify webhook HMAC.
 * Expects the raw request body (Buffer) and the base64-encoded header value.
 */
export function verifyWebhookHmac(rawBody: Buffer, headerValue: string, secret: string): boolean {
  if (!headerValue) return false;

  const digest = createHmac('sha256', secret).update(rawBody).digest('base64');

  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(headerValue));
  } catch {
    return false;
  }
}

/**
 * Encrypts a plaintext token using AES-256-GCM.
 * Output format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a token encrypted by encryptToken.
 */
export function decryptToken(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted token format');

  const [ivHex, tagHex, ciphertextHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}

/**
 * Generates a cryptographically random state nonce for OAuth CSRF protection.
 */
export function generateStateNonce(): string {
  return randomBytes(32).toString('hex');
}
