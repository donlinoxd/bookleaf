import CryptoJS from 'crypto-js';

/**
 * PIN hashing — PBKDF2-SHA256 with a per-PIN random salt.
 *
 * Stored format: `pbkdf2$<iterations>$<salt-hex>$<hash-hex>`
 *
 * Legacy format (pre-A2 fix): bare 64-char SHA-256 hex. `verifyPin` still
 * accepts these so old accounts work; call sites should detect a legacy hash
 * (via `isLegacyHash`) after a successful verify and re-hash with the new
 * format for opportunistic upgrade.
 */
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_KEY_BYTES = 32;
const PBKDF2_PREFIX = 'pbkdf2$';

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function pbkdf2Derive(pin: string, saltHex: string, iterations: number): string {
  const salt = CryptoJS.enc.Hex.parse(saltHex);
  const key = CryptoJS.PBKDF2(pin, salt, {
    keySize: PBKDF2_KEY_BYTES / 4, // keySize is in 32-bit words
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });
  return CryptoJS.enc.Hex.stringify(key);
}

export function hashPin(pin: string): string {
  const saltWords = CryptoJS.lib.WordArray.random(PBKDF2_SALT_BYTES);
  const saltHex = CryptoJS.enc.Hex.stringify(saltWords);
  const hashHex = pbkdf2Derive(pin, saltHex, PBKDF2_ITERATIONS);
  return `${PBKDF2_PREFIX}${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  if (!stored) return false;
  if (stored.startsWith(PBKDF2_PREFIX)) {
    const parts = stored.slice(PBKDF2_PREFIX.length).split('$');
    if (parts.length !== 3) return false;
    const iterations = parseInt(parts[0], 10);
    if (!Number.isFinite(iterations) || iterations < 1) return false;
    const saltHex = parts[1];
    const expectedHash = parts[2];
    const actualHash = pbkdf2Derive(pin, saltHex, iterations);
    return constantTimeEqual(actualHash, expectedHash);
  }
  // Legacy bare SHA-256 — accept for backwards compatibility.
  const legacy = CryptoJS.SHA256(pin).toString(CryptoJS.enc.Hex);
  return constantTimeEqual(legacy, stored);
}

export function isLegacyHash(stored: string): boolean {
  return !!stored && !stored.startsWith(PBKDF2_PREFIX);
}
