/** Shared utility — generates a unique task id without external deps. */
export function generateTaskId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 9);
    return `bg-${ts}-${rand}`;
}
