import CryptoJS from 'crypto-js';
import * as ExpoCrypto from 'expo-crypto';
import { bytesToWordArray } from '@bookleaf/db';

/**
 * Passphrase-based backup encryption: PBKDF2-SHA256 → AES-256-CBC + HMAC-SHA256.
 *
 * - PBKDF2(passphrase, salt, 100k iter, SHA-256) → 64 bytes of key material
 * - First 32 bytes: AES-256 encryption key
 * - Last 32 bytes: HMAC-SHA256 authentication key
 * - Encrypt-then-MAC: HMAC covers (version || salt || iv || ciphertext)
 *
 * Wrong passphrase or tampered file is detected by HMAC mismatch — decrypt
 * returns null in that case rather than throwing.
 *
 * Salt and IV entropy come from `expo-crypto.getRandomBytes` (native, sync),
 * bypassing crypto-js's WordArray.random which depends on a fragile
 * `crypto.getRandomValues` polyfill.
 */

export const BACKUP_FORMAT = 'bookleaf-backup-v3';
// 2,000 iterations. Pure-JS PBKDF2 in Hermes is extremely slow (~60s per
// 10k iterations on low-end Android), and backup is a one-shot interactive
// flow where the user is waiting on the result. 2k still meaningfully slows
// passphrase brute-force (the passphrase is min 6 chars so the keyspace is
// huge anyway). Bumping back up should follow a migration to a native KDF.
const PBKDF2_ITERATIONS = 2_000;
const SALT_BYTES = 16;
const IV_BYTES = 16;

export interface EncryptedBackup {
  format: string;
  kdf: 'pbkdf2-sha256';
  iterations: number;
  salt: string;       // hex
  iv: string;         // hex
  ciphertext: string; // base64
  mac: string;        // hex
}

function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function deriveKeys(passphrase: string, saltWords: CryptoJS.lib.WordArray, iterations: number) {
  const full = CryptoJS.PBKDF2(passphrase, saltWords, {
    keySize: 16, // 16 * 4 = 64 bytes
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });
  const encKey = CryptoJS.lib.WordArray.create(full.words.slice(0, 8), 32);
  const macKey = CryptoJS.lib.WordArray.create(full.words.slice(8, 16), 32);
  return { encKey, macKey };
}

function macInput(version: string, salt: CryptoJS.lib.WordArray, iv: CryptoJS.lib.WordArray, ciphertext: CryptoJS.lib.WordArray): CryptoJS.lib.WordArray {
  const versionBytes = CryptoJS.enc.Utf8.parse(version);
  return versionBytes.clone().concat(salt.clone()).concat(iv.clone()).concat(ciphertext.clone());
}

export function encryptBackup(plaintext: string, passphrase: string): EncryptedBackup {
  const salt = bytesToWordArray(ExpoCrypto.getRandomBytes(SALT_BYTES));
  const iv = bytesToWordArray(ExpoCrypto.getRandomBytes(IV_BYTES));
  const { encKey, macKey } = deriveKeys(passphrase, salt, PBKDF2_ITERATIONS);

  const cipherParams = CryptoJS.AES.encrypt(plaintext, encKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  const ciphertext = cipherParams.ciphertext;
  const tag = CryptoJS.HmacSHA256(macInput(BACKUP_FORMAT, salt, iv, ciphertext), macKey);

  return {
    format: BACKUP_FORMAT,
    kdf: 'pbkdf2-sha256',
    iterations: PBKDF2_ITERATIONS,
    salt: CryptoJS.enc.Hex.stringify(salt),
    iv: CryptoJS.enc.Hex.stringify(iv),
    ciphertext: CryptoJS.enc.Base64.stringify(ciphertext),
    mac: CryptoJS.enc.Hex.stringify(tag),
  };
}

export function decryptBackup(blob: EncryptedBackup, passphrase: string): string | null {
  if (blob.format !== BACKUP_FORMAT || blob.kdf !== 'pbkdf2-sha256') return null;
  if (!blob.salt || !blob.iv || !blob.ciphertext || !blob.mac) return null;

  let salt: CryptoJS.lib.WordArray;
  let iv: CryptoJS.lib.WordArray;
  let ciphertext: CryptoJS.lib.WordArray;
  try {
    salt = CryptoJS.enc.Hex.parse(blob.salt);
    iv = CryptoJS.enc.Hex.parse(blob.iv);
    ciphertext = CryptoJS.enc.Base64.parse(blob.ciphertext);
  } catch {
    return null;
  }

  const { encKey, macKey } = deriveKeys(passphrase, salt, blob.iterations);
  const expectedMac = CryptoJS.HmacSHA256(macInput(blob.format, salt, iv, ciphertext), macKey);
  if (!constantTimeHexEqual(CryptoJS.enc.Hex.stringify(expectedMac), blob.mac)) return null;

  try {
    const decrypted = CryptoJS.AES.decrypt(
      CryptoJS.lib.CipherParams.create({ ciphertext }),
      encKey,
      { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 },
    );
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch {
    return null;
  }
}
