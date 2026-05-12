#!/usr/bin/env node
/**
 * CLI entry — see `build-program.ts` and `commands/`.
 */
import { buildProgram } from './build-program.js';

buildProgram().parse();
