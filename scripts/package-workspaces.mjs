import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { resolve, relative } from 'path';
import { fileURLToPath } from 'url';

export const scriptsDir = fileURLToPath(new URL('.', import.meta.url));
export const root = resolve(scriptsDir, '..');
export const packagesDir = resolve(root, 'packages');

export const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function scanPackageDirs(baseDir, depth, maxDepth, dirs) {
  for (const entry of readdirSync(baseDir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;

    const entryPath = resolve(baseDir, entry);
    if (!isDirectory(entryPath)) continue;

    if (existsSync(resolve(entryPath, 'package.json'))) {
      dirs.push(entryPath);
      continue;
    }

    if (depth < maxDepth) {
      scanPackageDirs(entryPath, depth + 1, maxDepth, dirs);
    }
  }
}

export function discoverPackageDirs({ includePrivate = true } = {}) {
  const dirs = [];
  if (existsSync(packagesDir)) scanPackageDirs(packagesDir, 0, 2, dirs);

  return dirs
    .filter((dir) => includePrivate || readPackageJson(dir).private !== true)
    .sort((a, b) => readPackageJson(a).name.localeCompare(readPackageJson(b).name));
}

export function readPackageJson(pkgDir) {
  return readJson(resolve(pkgDir, 'package.json'));
}

export function packageJsonPath(pkgDir) {
  return resolve(pkgDir, 'package.json');
}

export function relativeToRoot(path) {
  return relative(root, path).replaceAll('\\', '/');
}

export function localPackageVersions() {
  const versions = new Map();
  for (const dir of discoverPackageDirs()) {
    const pkg = readPackageJson(dir);
    versions.set(pkg.name, pkg.version);
  }
  return versions;
}

export function tsupBuildsCjs(pkgDir) {
  const configPath = resolve(pkgDir, 'tsup.config.ts');
  if (!existsSync(configPath)) return false;

  const config = readFileSync(configPath, 'utf8');
  const format = config.match(/format\s*:\s*\[([^\]]+)\]/s)?.[1] ?? '';
  return /['"]cjs['"]/.test(format);
}

export function walkExportTargets(exportsField) {
  const targets = [];

  function visit(value) {
    if (typeof value === 'string') {
      targets.push(value);
      return;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) return;

    for (const nested of Object.values(value)) {
      visit(nested);
    }
  }

  visit(exportsField);
  return targets;
}
