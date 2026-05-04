import type { Command } from 'commander';
import fs from 'node:fs';

export function registerTestCommand(program: Command): void {
    program
        .command('test')
        .description('Run agent tests')
        .argument('[pattern]', 'Test file pattern')
        .option('-w, --watch', 'Watch mode', false)
        .option('-c, --coverage', 'Generate coverage report', false)
        .action((pattern, options) => {
            const testFiles = fs.readdirSync(process.cwd()).filter((f) => f.includes('test'));
            console.log('Test command is available. Use your test runner directly for full features.');
            console.log(`Pattern: ${pattern ?? 'all'}`);
            console.log(`Watch: ${Boolean(options.watch)}, Coverage: ${Boolean(options.coverage)}`);
            console.log(`Detected test-like files in cwd: ${testFiles.length}`);
            if (pattern) {
                console.log(`Filtered pattern: ${pattern}`);
            }
        });
}
