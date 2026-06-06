import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

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

  // pkg must run from the monorepo root so snapshot paths match what the
  // compiled binary expects (C:\snapshot\bookleaf\...). The --config flag
  // ensures pkg reads pkg.assets from packages/server/package.json.
  const monorepoRoot = resolve(__dirname, '../..');
  const serverPkg = resolve(__dirname, 'package.json');
  const entryJs = resolve(__dirname, 'dist/desktop/server.js');
  const outExe = resolve(
    __dirname,
    '../../apps/desktop/src-tauri/binaries/bookleaf-server-x86_64-pc-windows-msvc.exe',
  );

  console.log('→ packaging with pkg...');
  execSync(
    `node node_modules/@yao-pkg/pkg/lib-es5/bin.js --config "${serverPkg}" -t node22-win-x64 "${entryJs}" -o "${outExe}"`,
    { cwd: monorepoRoot, stdio: 'inherit' },
  );
  console.log('✓ binary → apps/desktop/src-tauri/binaries/bookleaf-server-x86_64-pc-windows-msvc.exe');
}
