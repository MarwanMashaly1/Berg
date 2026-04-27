import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const PEPPER = process.env.SERVER_PEPPER ?? 'dev-pepper-change-in-production';
const ENCRYPTION_KEY_HEX = process.env.PHONE_ENCRYPTION_KEY ?? '0'.repeat(64); // 32 bytes
const ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_HEX, 'hex');
const ALGORITHM = 'aes-256-gcm';

// Fail fast in production if weak default keys are used
if (process.env.NODE_ENV === 'production') {
  if (!process.env.SERVER_PEPPER) {
    throw new Error('SERVER_PEPPER environment variable must be set in production');
  }
  if (!process.env.PHONE_ENCRYPTION_KEY) {
    throw new Error('PHONE_ENCRYPTION_KEY environment variable must be set in production');
  }
  if (ENCRYPTION_KEY_HEX === '0'.repeat(64)) {
    throw new Error('PHONE_ENCRYPTION_KEY is not a valid key in production');
  }
}

/**
 * Hash a phone number for contact matching.
 * Output: SHA-256(E.164_phone + SERVER_PEPPER) as hex string.
 */
export function hashPhone(e164Phone: string): string {
  return createHash('sha256')
    .update(e164Phone + PEPPER)
    .digest('hex');
}

/**
 * Encrypt a phone number for storage.
 * Format: iv:authTag:ciphertext (all hex).
 */
export function encryptPhone(phone: string): string {
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a phone number for display (account owner only).
 */
export function decryptPhone(encrypted: string): string {
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
