import { newId } from '../contracts/index.js';

/** Shared utility — generates a unique task id without external deps. */
export function generateTaskId(): string {
    return newId('task');
}
