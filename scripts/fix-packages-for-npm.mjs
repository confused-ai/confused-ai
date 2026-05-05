/**
 * fix-packages-for-npm.mjs
 * 
 * Moves publishConfig.{main,module,types,exports} to top-level package.json fields
 * so npm publish picks them up correctly. npm does NOT support publishConfig.exports.
 *
 * Also removes publishConfig entirely if only those fields were in it (leaves
 * publishConfig.access if present).
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(__dirname, '..');
const packagesDir = resolve(root, 'packages');

const packages = readdirSync(packagesDir).filter(d =>
  existsSync(resolve(packagesDir, d, 'package.json'))
);

let updated = 0;

for (const pkg of packages) {
  const pkgPath = resolve(packagesDir, pkg, 'package.json');
  const raw = readFileSync(pkgPath, 'utf8');
  const json = JSON.parse(raw);

  const pc = json.publishConfig || {};
  let changed = false;

  // Move publishConfig.{main,module,types,exports} → top level
  for (const field of ['main', 'module', 'types', 'exports']) {
    if (pc[field] !== undefined) {
      json[field] = pc[field];
      delete pc[field];
      changed = true;
    }
  }

  // Clean up publishConfig if now empty, or keep if has other keys (e.g. access, registry)
  if (Object.keys(pc).length === 0) {
    delete json.publishConfig;
  } else {
    json.publishConfig = pc;
  }

  if (changed) {
    writeFileSync(pkgPath, JSON.stringify(json, null, 2) + '\n', 'utf8');
    console.log(`  ✔ ${json.name}`);
    updated++;
  } else {
    console.log(`  – ${json.name} (no publishConfig to migrate)`);
  }
}

console.log(`\nDone: ${updated} packages updated`);
