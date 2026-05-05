/**
 * build-dts.mjs — Generate self-contained .d.ts files for all entry points.
 *
 * Uses dts-bundle-generator to inline all transitive types so that
 * @confused-ai/* workspace packages are NOT needed by consumers.
 */

import { generateDtsBundle } from 'dts-bundle-generator';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(__dirname, '..');
const tsconfig = resolve(root, 'tsconfig.build.json');

// Map: [source entry, output flat .d.ts path]
const entries = [
  // ── Root flat files ───────────────────────────────────────────────────────
  ['src/index.ts',          'dist/index.d.ts'],
  ['src/model.ts',          'dist/model.d.ts'],
  ['src/tool.ts',           'dist/tool.d.ts'],
  ['src/workflow.ts',       'dist/workflow.d.ts'],
  ['src/guard.ts',          'dist/guard.d.ts'],
  ['src/serve.ts',          'dist/serve.d.ts'],
  ['src/observe.ts',        'dist/observe.d.ts'],
  ['src/test.ts',           'dist/test.d.ts'],
  ['src/create-agent.ts',   'dist/create-agent.d.ts'],
  ['src/playground.ts',     'dist/playground.d.ts'],
  // ── Directory index files ─────────────────────────────────────────────────
  ['src/core/index.ts',           'dist/core.d.ts'],
  ['src/memory/index.ts',         'dist/memory.d.ts'],
  ['src/providers/index.ts',      'dist/providers.d.ts'],
  ['src/tools/index.ts',          'dist/tools.d.ts'],
  ['src/planner/index.ts',        'dist/planner.d.ts'],
  ['src/execution/index.ts',      'dist/execution.d.ts'],
  ['src/orchestration/index.ts',  'dist/orchestration.d.ts'],
  ['src/observability/index.ts',  'dist/observability.d.ts'],
  ['src/agentic/index.ts',        'dist/agentic.d.ts'],
  ['src/session/index.ts',        'dist/session.d.ts'],
  ['src/guardrails/index.ts',     'dist/guardrails.d.ts'],
  ['src/knowledge/index.ts',      'dist/knowledge.d.ts'],
  ['src/storage/index.ts',        'dist/storage.d.ts'],
  ['src/production/index.ts',     'dist/production.d.ts'],
  ['src/artifacts/index.ts',      'dist/artifacts.d.ts'],
  ['src/voice/index.ts',          'dist/voice.d.ts'],
  ['src/runtime/index.ts',        'dist/runtime.d.ts'],
  ['src/shared/index.ts',         'dist/shared.d.ts'],
  ['src/contracts/index.ts',      'dist/contracts.d.ts'],
  ['src/plugins/index.ts',        'dist/plugins.d.ts'],
  ['src/adapters/index.ts',       'dist/adapters.d.ts'],
  ['src/background/index.ts',     'dist/background.d.ts'],
  ['src/testing/index.ts',        'dist/testing.d.ts'],
  ['src/learning/index.ts',       'dist/learning.d.ts'],
  ['src/video/index.ts',          'dist/video.d.ts'],
  ['src/config/index.ts',         'dist/config.d.ts'],
  ['src/dx/index.ts',             'dist/dx.d.ts'],
  ['src/sdk/index.ts',            'dist/sdk.d.ts'],
  ['src/graph/index.ts',          'dist/graph.d.ts'],
  ['src/cli/index.ts',            'dist/cli.d.ts'],
  ['src/create-agent/index.ts',   'dist/create-agent/index.d.ts'],
  // ── tools/* sub-entries ───────────────────────────────────────────────────
  ['src/tools/utils/shell-entry.ts',      'dist/tools/shell.d.ts'],
  ['src/tools/core/index.ts',             'dist/tools/core.d.ts'],
  ['src/tools/mcp/index.ts',              'dist/tools/mcp.d.ts'],
  ['src/tools/utils/index.ts',            'dist/tools/utils.d.ts'],
  ['src/tools/communication/index.ts',    'dist/tools/communication.d.ts'],
  ['src/tools/productivity/index.ts',     'dist/tools/productivity.d.ts'],
  ['src/tools/devtools/index.ts',         'dist/tools/devtools.d.ts'],
  ['src/tools/crm/index.ts',              'dist/tools/crm.d.ts'],
  ['src/tools/search/index.ts',           'dist/tools/search.d.ts'],
  ['src/tools/scraping/index.ts',         'dist/tools/scraping.d.ts'],
  ['src/tools/media/index.ts',            'dist/tools/media.d.ts'],
  ['src/tools/memory/index.ts',           'dist/tools/memory.d.ts'],
  ['src/tools/ai/index.ts',               'dist/tools/ai.d.ts'],
  ['src/tools/data/index.ts',             'dist/tools/data.d.ts'],
  ['src/tools/finance/index.ts',          'dist/tools/finance.d.ts'],
  ['src/tools/social/index.ts',           'dist/tools/social.d.ts'],
];

// Cache: avoid re-running dts-bundle-generator for identical source entries
const cache = new Map();

let passed = 0;
let failed = 0;
const total = entries.length;

for (const [relEntry, relOut] of entries) {
  const entry = resolve(root, relEntry);
  const out = resolve(root, relOut);

  if (!existsSync(entry)) {
    console.warn(`[SKIP] ${relEntry} — file not found`);
    continue;
  }

  process.stdout.write(`[${passed + failed + 1}/${total}] ${relOut} ... `);
  const startMs = Date.now();

  try {
    let content;
    if (cache.has(relEntry)) {
      content = cache.get(relEntry);
    } else {
      const [result] = generateDtsBundle(
        [{ filePath: entry, output: { noBanner: true } }],
        { preferredConfigPath: tsconfig },
      );
      content = result;
      cache.set(relEntry, content);
    }

    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, content, 'utf8');
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    console.log(`done (${elapsed}s, ${(content.length / 1024).toFixed(0)}KB)`);
    passed++;
  } catch (err) {
    console.error(`FAILED`);
    console.error(`  ${err.message}`);
    failed++;
  }
}

console.log(`\nDTS generation: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
