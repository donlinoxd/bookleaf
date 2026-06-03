// Polyfill `crypto.getRandomValues` for React Native using expo-crypto's
// native module (which is already linked because other parts of the app
// import expo-crypto). This is what crypto-js's `cryptoSecureRandomInt`
// looks for when it tries to source entropy for WordArray.random(), which
// hashPin() and encryptBackup() depend on.
//
// Must be imported at the very top of the app entry (app/_layout.tsx),
// before any module that uses crypto-js.
import * as ExpoCrypto from 'expo-crypto';

const g = globalThis as { crypto?: { getRandomValues?: (typedArray: ArrayBufferView) => ArrayBufferView } };

if (!g.crypto || typeof g.crypto.getRandomValues !== 'function') {
  g.crypto = {
    ...(g.crypto || {}),
    // expo-crypto's signature matches the Web Crypto contract.
    getRandomValues: (ExpoCrypto as unknown as { getRandomValues: (a: ArrayBufferView) => ArrayBufferView }).getRandomValues,
  };
}
