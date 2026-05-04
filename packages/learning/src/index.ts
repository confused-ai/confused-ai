/**
 * Learning module: user profiles, memories across sessions, learning modes.
 */

export * from './types.js';
export { InMemoryUserProfileStore } from './in-memory-store.js';
export { SqliteUserProfileStore, createSqliteUserProfileStore } from './sqlite-profile-store.js';
export { LearningMachine } from './machine.js';
export type { LearningMachineConfig, LearningRecallResult } from './machine.js';
export {
    InMemoryUserMemoryStore,
    InMemorySessionContextStore,
    InMemoryLearnedKnowledgeStore,
    InMemoryEntityMemoryStore,
} from './extended-stores.js';
