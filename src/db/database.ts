import CryptoJS from 'crypto-js';
import * as ExpoCrypto from 'expo-crypto';

/**
 * PIN hashing — salted SHA-256, no PBKDF2.
 *
 * Stored format: `sha256s$<salt-hex>$<hash-hex>` where hash = SHA256(salt_hex || pin).
 *
 * Salt is 16 random bytes from expo-crypto (native, sync). Verify is
 * sub-millisecond, so login feels instant.
 *
 * Legacy formats accepted by verifyPin for backwards compatibility:
 *   - `pbkdf2$<iter>$<salt>$<hash>` (older, slow PBKDF2)
 *   - bare 64-hex SHA-256 (oldest, unsalted)
 * Both are flagged by `isLegacyHash` and get opportunistically re-hashed at
 * the salted-SHA-256 format on next successful login.
 *
 * Threat model: 4-digit numeric PINs make brute-force trivial regardless of
 * KDF strength. PBKDF2 was theatre for short PINs in pure JS. The actual
 * defenses are bearer-token sessions (A1), server-side login rate limiting
 * (A2b), and encrypted backups (A3). Salted SHA-256 still beats unsalted:
 * defeats rainbow tables, reveals nothing across identical PINs, and is
 * fast enough that the UI doesn't lock. See README "Security note" for the
 * documented residual risk.
 */
const SALT_BYTES = 16;
const HASH_PREFIX = 'sha256s$';

// Legacy support — these prefixes are recognised so old accounts can still
// log in once; isLegacyHash returns true for both so call sites re-hash to
// the new format opportunistically.
const PBKDF2_PREFIX = 'pbkdf2$';

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Convert a Uint8Array of bytes into a CryptoJS WordArray (big-endian 32-bit words). */
function bytesToWordArray(bytes: Uint8Array): CryptoJS.lib.WordArray {
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    words[i >>> 2] |= bytes[i] << (24 - (i % 4) * 8);
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function saltedSha256(saltHex: string, pin: string): string {
  return CryptoJS.SHA256(saltHex + pin).toString(CryptoJS.enc.Hex);
}

export function hashPin(pin: string): string {
  const saltBytes = ExpoCrypto.getRandomBytes(SALT_BYTES);
  const saltHex = bytesToHex(saltBytes);
  const hashHex = saltedSha256(saltHex, pin);
  return `${HASH_PREFIX}${saltHex}$${hashHex}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  if (!stored) return false;

  // Current format: salted SHA-256.
  if (stored.startsWith(HASH_PREFIX)) {
    const parts = stored.slice(HASH_PREFIX.length).split('$');
    if (parts.length !== 2) return false;
    const [saltHex, expectedHash] = parts;
    return constantTimeEqual(saltedSha256(saltHex, pin), expectedHash);
  }

  // Legacy PBKDF2 — accept once so the account can log in and be re-hashed.
  if (stored.startsWith(PBKDF2_PREFIX)) {
    const parts = stored.slice(PBKDF2_PREFIX.length).split('$');
    if (parts.length !== 3) return false;
    const iterations = parseInt(parts[0], 10);
    if (!Number.isFinite(iterations) || iterations < 1) return false;
    const [, saltHex, expectedHash] = parts;
    const salt = CryptoJS.enc.Hex.parse(saltHex);
    const key = CryptoJS.PBKDF2(pin, salt, {
      keySize: 8, // 32 bytes
      iterations,
      hasher: CryptoJS.algo.SHA256,
    });
    return constantTimeEqual(CryptoJS.enc.Hex.stringify(key), expectedHash);
  }

  // Oldest: bare unsalted SHA-256.
  const legacy = CryptoJS.SHA256(pin).toString(CryptoJS.enc.Hex);
  return constantTimeEqual(legacy, stored);
}

/** True for any hash format other than the current salted-SHA-256 format. */
export function isLegacyHash(stored: string): boolean {
  return !!stored && !stored.startsWith(HASH_PREFIX);
}

/** Exported for backupCrypto and other entropy consumers — sync, native-backed. */
export { bytesToWordArray };
