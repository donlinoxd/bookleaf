import SHA256 from 'crypto-js/sha256';

export function hashPin(pin: string): string {
  return SHA256(pin).toString();
}

export function verifyPin(pin: string, hash: string): boolean {
  return hashPin(pin) === hash;
}
