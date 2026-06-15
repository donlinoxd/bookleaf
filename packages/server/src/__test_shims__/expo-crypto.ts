import { randomBytes } from 'node:crypto';

export function getRandomBytes(count: number): Uint8Array {
  return new Uint8Array(randomBytes(count));
}

export function getRandomBytesAsync(count: number): Promise<Uint8Array> {
  return Promise.resolve(new Uint8Array(randomBytes(count)));
}
