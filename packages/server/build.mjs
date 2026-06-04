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
  });
  console.log('✓ packages/server desktop bundle → dist/desktop/server.js');
}
