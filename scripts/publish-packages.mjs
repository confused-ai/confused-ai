/**
 * publish-packages.mjs — Publish all @confused-ai/* sub-packages to npm.
 *
 * Usage:
 *   node scripts/publish-packages.mjs           # publish all
 *   node scripts/publish-packages.mjs --dry-run  # dry run
 *   node scripts/publish-packages.mjs --access public
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync } from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(__dirname, '..');
const packagesDir = resolve(root, 'packages');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const access = args.includes('--access') ? args[args.indexOf('--access') + 1] : 'public';

const packages = readdirSync(packagesDir).filter(d =>
  existsSync(resolve(packagesDir, d, 'package.json')) &&
  existsSync(resolve(packagesDir, d, 'dist'))
);

console.log(`Publishing ${packages.length} packages (access=${access}, dryRun=${dryRun})\n`);

let ok = 0;
let failed = 0;
const failures = [];

for (const pkg of packages) {
  const pkgDir = resolve(packagesDir, pkg);
  const pkgJson = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf8'));
  const name = pkgJson.name;
  const version = pkgJson.version;

  console.log(`\n─── Publishing ${name}@${version} ───`);

  const cmd = [
    'npm publish',
    `--access ${access}`,
    dryRun ? '--dry-run' : '',
  ].filter(Boolean).join(' ');

  try {
    // Use 'inherit' so interactive prompts (2FA, browser auth) work in terminal
    execSync(cmd, { cwd: pkgDir, stdio: 'inherit' });
    ok++;
  } catch (err) {
    const stdout = err.stdout?.toString() || '';
    const stderr = err.stderr?.toString() || '';
    const combined = stdout + stderr;
    if (combined.includes('cannot publish over') || combined.includes('E403')) {
      console.log('⚠ already published (skipping)');
      ok++;
    } else {
      console.log('✗ FAILED');
      const errLine = stderr.split('\n').find(l => l.trim() && !l.includes('npm warn')) || stderr.split('\n')[0] || '';
      console.error(`    ${errLine}`);
      failures.push({ name, err: errLine });
      failed++;
    }
  }
}

console.log(`\nResults: ${ok} published, ${failed} failed`);
if (failures.length) {
  console.error('\nFailures:');
  for (const f of failures) console.error(`  ${f.name}: ${f.err}`);
  process.exit(1);
}
