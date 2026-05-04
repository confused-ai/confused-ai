import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';

export function registerPlanCommand(program: Command): void {
    program
        .command('plan')
        .description('Generate execution plan for a goal')
        .argument('<goal>', 'Goal to plan')
        .option('-p, --planner <planner>', 'Planner type', 'classical')
        .option('-o, --output <output>', 'Output file')
        .action((goal, options) => {
            const plan = {
                goal,
                planner: options.planner,
                steps: [
                    { id: 'analyze', description: `Analyze goal: ${goal}` },
                    { id: 'implement', description: 'Implement smallest end-to-end vertical slice' },
                    { id: 'validate', description: 'Run tests and quality checks' },
                ],
            };
            if (options.output) {
                fs.writeFileSync(path.resolve(options.output), JSON.stringify(plan, null, 2), 'utf8');
                console.log(`Plan written: ${path.resolve(options.output)}`);
            } else {
                console.log(JSON.stringify(plan, null, 2));
            }
        });
}
