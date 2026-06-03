import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [resolve(__dirname, 'src/index.android.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  // Output directly to nodejs-assets so Expo picks it up on the next android build.
  outfile: resolve(__dirname, '../../apps/server/nodejs-assets/nodejs-project/main.js'),
  external: ['rn-bridge'],
  minify: false,
});

console.log('✓ packages/server bundled to apps/server/nodejs-assets/nodejs-project/main.js');
