#!/usr/bin/env node
/**
 * fix-packages.mjs — Fix all @confused-ai/* package.json files for npm publishing.
 *
 * - Adds "files": ["dist"] where missing
 * - Adds/fixes "publishConfig" with dist/ paths
 * - Replaces "workspace:*" deps with "*" for npm compatibility
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, existsSync } from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(__dirname, '..');
const packagesDir = resolve(root, 'packages');

// ESM-only packages (no .cjs output)
const esmOnly = new Set([
  'agentic', 'background', 'eval', 'execution', 'guardrails',
  'learning', 'orchestration', 'plugins', 'sdk', 'video', 'voice',
]);

const packages = readdirSync(packagesDir).filter(d =>
  existsSync(resolve(packagesDir, d, 'package.json'))
);

let changed = 0;

for (const pkg of packages) {
  const pkgFile = resolve(packagesDir, pkg, 'package.json');
  const original = readFileSync(pkgFile, 'utf8');
  const d = JSON.parse(original);

  let dirty = false;

  // 1. Fix workspace:* → * in all dep fields
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    if (!d[field]) continue;
    for (const [dep, ver] of Object.entries(d[field])) {
      if (typeof ver === 'string' && ver.startsWith('workspace:')) {
        d[field][dep] = ver === 'workspace:*' ? '*' : ver.slice('workspace:'.length);
        dirty = true;
      }
    }
  }

  // 2. Add "files": ["dist"] if missing
  if (!d.files) {
    d.files = ['dist'];
    dirty = true;
  }

  // 3. Add/fix publishConfig
  const isEsmOnly = esmOnly.has(pkg);
  const wantedPublishConfig = isEsmOnly
    ? {
        main: './dist/index.js',
        module: './dist/index.js',
        types: './dist/index.d.ts',
        exports: {
          '.': {
            types: './dist/index.d.ts',
            import: './dist/index.js',
          },
        },
      }
    : {
        main: './dist/index.cjs',
        module: './dist/index.js',
        types: './dist/index.d.ts',
        exports: {
          '.': {
            types: './dist/index.d.ts',
            import: './dist/index.js',
            require: './dist/index.cjs',
          },
        },
      };

  if (!d.publishConfig) {
    d.publishConfig = wantedPublishConfig;
    dirty = true;
  } else {
    // Ensure types/main/module always point to dist (not src)
    if (d.publishConfig.types === './src/index.ts') {
      Object.assign(d.publishConfig, wantedPublishConfig);
      dirty = true;
    }
  }

  // 4. Fix "exports" inside publishConfig if they still reference src
  if (d.publishConfig?.exports) {
    for (const [key, val] of Object.entries(d.publishConfig.exports)) {
      if (val && typeof val === 'object') {
        for (const [cond, path] of Object.entries(val)) {
          if (typeof path === 'string' && path.startsWith('./src/')) {
            // already fixed above via wantedPublishConfig
          }
        }
      }
    }
  }

  if (dirty) {
    writeFileSync(pkgFile, JSON.stringify(d, null, 2) + '\n', 'utf8');
    console.log(`✔ fixed ${d.name}`);
    changed++;
  } else {
    console.log(`  ok    ${d.name}`);
  }
}

console.log(`\n${changed} packages updated, ${packages.length - changed} already ok.`);
