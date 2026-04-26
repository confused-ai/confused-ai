import { Command } from 'commander';
import { registerCreateCommand } from './commands/create.js';
import { registerRunCommand } from './commands/run-cmd.js';
import { registerTestCommand } from './commands/test-cmd.js';
import { registerValidateCommand } from './commands/validate-cmd.js';
import { registerPlanCommand } from './commands/plan-cmd.js';
import { registerExecuteCommand } from './commands/execute-cmd.js';
import { registerListTemplatesCommand } from './commands/list-templates.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerServeCommand } from './commands/serve-cmd.js';
import { registerEvalCommand } from './commands/eval-cmd.js';
import { registerReplayCommand } from './commands/replay-cmd.js';
import { registerInspectCommand } from './commands/inspect-cmd.js';
import { registerExportCommand } from './commands/export-cmd.js';
import { registerDiffCommand } from './commands/diff-cmd.js';
import { VERSION } from '../shared/version.js';

/**
 * Composes the CLI: one `Command` root, subcommands in `commands/`.
 */
export function buildProgram(): Command {
    const program = new Command();
    program
        .name('fluxion')
        .description('CLI for Fluxion — production-grade TypeScript agents')
        .version(VERSION);

    registerCreateCommand(program);
    registerRunCommand(program);
    registerServeCommand(program);
    registerEvalCommand(program);
    registerTestCommand(program);
    registerValidateCommand(program);
    registerPlanCommand(program);
    registerExecuteCommand(program);
    registerListTemplatesCommand(program);
    registerDoctorCommand(program);
    registerReplayCommand(program);
    registerInspectCommand(program);
    registerExportCommand(program);
    registerDiffCommand(program);

    return program;
}
