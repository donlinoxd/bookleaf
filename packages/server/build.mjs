import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = process.argv.includes('--target')
  ? process.argv[process.argv.indexOf('--target') + 1]
  : 'android';

if (target === 'android') {
  await build({
    entryPoints: [resolve(__dirname, 'src/index.android.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: resolve(__dirname, '../../apps/server/nodejs-assets/nodejs-project/main.js'),
    external: ['rn-bridge'],
    minify: false,
  });
  console.log('✓ packages/server bundled to apps/server/nodejs-assets/nodejs-project/main.js');
} else if (target === 'desktop') {
  // Shim for expo-crypto: replace with Node.js crypto so the desktop bundle
  // has no dependency on React Native / expo-modules-core.
  const expoCryptoShimPlugin = {
    name: 'expo-crypto-shim',
    setup(build) {
      build.onResolve({ filter: /^expo-crypto$/ }, (args) => ({
        path: args.path,
        namespace: 'expo-crypto-shim',
      }));
      build.onLoad({ filter: /.*/, namespace: 'expo-crypto-shim' }, () => ({
        contents: `
const { randomBytes } = require('node:crypto');
function getRandomBytes(count) {
  const buf = randomBytes(count);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}
function getRandomBytesAsync(count) {
  return Promise.resolve(getRandomBytes(count));
}
module.exports = { getRandomBytes, getRandomBytesAsync };
`,
        loader: 'js',
      }));
    },
  };

  await build({
    entryPoints: [resolve(__dirname, 'src/index.desktop.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile: resolve(__dirname, 'dist/desktop/server.js'),
    // better-sqlite3 is a native addon — cannot be bundled by esbuild, handled by pkg
    external: ['better-sqlite3'],
    // Bundle .sql files as plain text strings
    loader: { '.sql': 'text' },
    minify: false,
    plugins: [expoCryptoShimPlugin],
  });
  console.log('✓ packages/server desktop bundle → dist/desktop/server.js');
}
