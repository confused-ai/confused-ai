import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';

export function registerExecuteCommand(program: Command): void {
    program
        .command('execute')
        .description('Execute a plan file (dry-run)')
        .argument('<file>', 'Plan file path')
        .option('-p, --parallel', 'Enable parallel execution', false)
        .option('-c, --concurrency <number>', 'Max concurrency', '4')
        .action((file, options) => {
            const resolved = path.resolve(file);
            const raw = fs.readFileSync(resolved, 'utf8');
            const plan = JSON.parse(raw) as { steps?: Array<{ id?: string; description?: string }> };
            const steps = plan.steps ?? [];
            console.log(`Executing plan: ${resolved}`);
            console.log(`Parallel: ${options.parallel}`);
            console.log(`Concurrency: ${options.concurrency}`);
            for (const step of steps) {
                console.log(`- [${step.id ?? 'step'}] ${step.description ?? ''}`);
            }
            console.log(`Executed ${steps.length} plan steps (dry-run).`);
        });
}
