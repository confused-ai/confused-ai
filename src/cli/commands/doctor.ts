import type { Command } from 'commander';
import { createRequire } from 'node:module';

const require = createRequire(`${process.cwd()}/package.json`);

function checkEnv(key: string): { set: boolean; value: string } {
    const val = process.env[key];
    return { set: Boolean(val?.trim()), value: val ? `${val.slice(0, 4)}****` : '(not set)' };
}

function checkPackage(name: string): boolean {
    try {
        require.resolve(name);
        return true;
    } catch {
        return false;
    }
}

export function registerDoctorCommand(program: Command): void {
    program
        .command('doctor')
        .description('Check environment, API keys, and optional dependencies')
        .action(async () => {
            let allGood = true;
            const warn = (msg: string) => { console.warn(`  ⚠  ${msg}`); allGood = false; };
            const ok = (msg: string) => console.log(`  ✓  ${msg}`);
            const info = (msg: string) => console.log(`  ℹ  ${msg}`);

            console.log('\n── Runtime ───────────────────────────────────────────');
            info(`Node.js: ${process.version}`);
            info(`Platform: ${process.platform} ${process.arch}`);
            info(`Working directory: ${process.cwd()}`);

            const nodeMajor = parseInt(process.version.slice(1), 10);
            if (nodeMajor < 18) {
                warn(`Node.js 18+ required; found ${process.version}`);
            } else {
                ok(`Node.js version OK (${process.version})`);
            }

            console.log('\n── LLM Provider Keys ─────────────────────────────────');
            const providers = [
                { key: 'OPENAI_API_KEY', name: 'OpenAI' },
                { key: 'ANTHROPIC_API_KEY', name: 'Anthropic' },
                { key: 'GOOGLE_AI_API_KEY', name: 'Google Gemini' },
                { key: 'OPENROUTER_API_KEY', name: 'OpenRouter' },
                { key: 'AWS_ACCESS_KEY_ID', name: 'AWS Bedrock (access key)' },
            ];
            let anyKey = false;
            for (const { key, name } of providers) {
                const { set, value } = checkEnv(key);
                if (set) { ok(`${name}: ${value}`); anyKey = true; }
                else info(`${name} (${key}): not set`);
            }
            if (!anyKey) {
                warn('No LLM provider API key found. Set at least one (e.g. OPENAI_API_KEY).');
            }

            console.log('\n── Optional Dependencies ─────────────────────────────');
            const optionalPkgs = [
                { name: 'openai', purpose: 'OpenAI provider' },
                { name: 'better-sqlite3', purpose: 'SQLite stores (session, audit, checkpoint)' },
                { name: 'ioredis', purpose: 'Redis session store & distributed rate limiter' },
                { name: 'playwright', purpose: 'Browser tool (PlaywrightPageTitleTool)' },
                { name: 'bullmq', purpose: 'BullMQ background queue' },
                { name: 'kafkajs', purpose: 'Kafka background queue' },
                { name: '@aws-sdk/client-bedrock-runtime', purpose: 'Amazon Bedrock provider' },
            ];
            for (const pkg of optionalPkgs) {
                if (checkPackage(pkg.name)) {
                    ok(`${pkg.name} (${pkg.purpose})`);
                } else {
                    info(`${pkg.name} not installed — optional (${pkg.purpose})`);
                }
            }

            console.log('\n── Network Connectivity ──────────────────────────────');
            try {
                const { default: https } = await import('node:https');
                await new Promise<void>((resolve, reject) => {
                    const req = https.request({ hostname: 'api.openai.com', path: '/v1/models', method: 'HEAD' }, (res) => {
                        if ((res.statusCode ?? 0) < 500) resolve();
                        else reject(new Error(`HTTP ${res.statusCode ?? 'unknown'}`));
                        res.resume();
                    });
                    req.setTimeout(5000, () => req.destroy(new Error('timeout')));
                    req.on('error', reject);
                    req.end();
                });
                ok('Reachable: api.openai.com');
            } catch (err) {
                warn(`Cannot reach api.openai.com: ${err instanceof Error ? err.message : String(err)}`);
            }

            console.log('');
            if (allGood) {
                console.log('✅  All checks passed. Ready to build agents!');
            } else {
                console.log('⚠  Some checks failed. Review warnings above.');
                process.exit(1);
            }
        });
}
