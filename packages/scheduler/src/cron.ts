/**
 * Cron Utilities
 * ==============
 * Pure-TypeScript 5-field cron parser and next-run calculator.
 * No external dependencies. Supports:
 *   - Wildcards: *
 *   - Lists: 1,3,5
 *   - Ranges: 1-5
 *   - Steps: * /5, 1-30/2
 *
 * Fields: minute  hour  dayOfMonth  month  dayOfWeek
 * Ranges: 0-59    0-23  1-31        1-12   0-6 (0=Sunday)
 *
 * Usage:
 *   computeNextRun('* /5 * * * *')        // next run from now
 *   computeNextRun('0 9 * * 1-5', 'UTC')  // weekdays at 09:00 UTC
 *   validateCronExpr('bad expr')          // false
 */

// ── Parsing ───────────────────────────────────────────────────────────────────

function parseCronField(field: string, min: number, max: number): Set<number> {
    const values = new Set<number>();

    for (const part of field.split(',')) {
        if (part === '*') {
            for (let i = min; i <= max; i++) values.add(i);
            continue;
        }

        const stepMatch = part.match(/^(.+)\/(\d+)$/);
        if (stepMatch) {
            const [, range, stepStr] = stepMatch;
            const step = parseInt(stepStr, 10);
            if (isNaN(step) || step < 1) throw new Error(`Invalid step: ${part}`);

            const [rangeStart, rangeEnd] = range === '*'
                ? [min, max]
                : range.split('-').map(Number);

            if (isNaN(rangeStart) || isNaN(rangeEnd)) throw new Error(`Invalid range in step: ${part}`);
            for (let i = rangeStart; i <= rangeEnd; i += step) values.add(i);
            continue;
        }

        const rangeMatch = part.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
            const [, startStr, endStr] = rangeMatch;
            const start = parseInt(startStr, 10);
            const end   = parseInt(endStr, 10);
            if (isNaN(start) || isNaN(end)) throw new Error(`Invalid range: ${part}`);
            for (let i = start; i <= end; i++) values.add(i);
            continue;
        }

        const num = parseInt(part, 10);
        if (isNaN(num)) throw new Error(`Invalid cron value: ${part}`);
        values.add(num);
    }

    return values;
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Returns true if the expression is a valid 5-field cron string.
 */
export function validateCronExpr(expr: string): boolean {
    try {
        const parts = expr.trim().split(/\s+/);
        if (parts.length !== 5) return false;
        parseCronField(parts[0]!, 0, 59);   // minute
        parseCronField(parts[1]!, 0, 23);   // hour
        parseCronField(parts[2]!, 1, 31);   // day of month
        parseCronField(parts[3]!, 1, 12);   // month
        parseCronField(parts[4]!, 0,  6);   // day of week
        return true;
    } catch {
        return false;
    }
}

// ── Next Run ──────────────────────────────────────────────────────────────────

/**
 * Compute the next Date after `after` (defaults to now) that matches `expr`.
 *
 * The implementation walks forward minute-by-minute from `after+1min`.
 * For practical cron expressions this terminates within a few iterations.
 * The upper bound is 4 years to handle "once a year" expressions.
 *
 * @param expr      Standard 5-field cron expression
 * @param _timezone IANA timezone name (currently treated as UTC — full TZ
 *                  support requires Intl.DateTimeFormat which is environment
 *                  dependent; override computeNextRun for TZ-aware use)
 * @param after     Base timestamp (ms since epoch). Default: Date.now()
 * @returns         Next matching Date, or null if no match within 4 years
 */
export function computeNextRun(
    expr: string,
    _timezone = 'UTC',
    after = Date.now(),
): Date | null {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return null;

    let minutes: Set<number>;
    let hours: Set<number>;
    let daysOfMonth: Set<number>;
    let months: Set<number>;
    let daysOfWeek: Set<number>;

    try {
        minutes    = parseCronField(parts[0]!, 0, 59);
        hours      = parseCronField(parts[1]!, 0, 23);
        daysOfMonth = parseCronField(parts[2]!, 1, 31);
        months     = parseCronField(parts[3]!, 1, 12);
        daysOfWeek = parseCronField(parts[4]!, 0, 6);
    } catch {
        return null;
    }

    // Start from the next minute boundary
    const start = new Date(after);
    start.setSeconds(0, 0);
    start.setMinutes(start.getMinutes() + 1);

    const fourYearsMs = 4 * 365 * 24 * 60 * 60 * 1000;
    const limit = after + fourYearsMs;

    let current = start.getTime();

    while (current <= limit) {
        const d = new Date(current);
        const min  = d.getUTCMinutes();
        const hr   = d.getUTCHours();
        const dom  = d.getUTCDate();
        const mon  = d.getUTCMonth() + 1;   // 1-indexed
        const dow  = d.getUTCDay();          // 0=Sunday

        if (
            months.has(mon) &&
            daysOfMonth.has(dom) &&
            daysOfWeek.has(dow) &&
            hours.has(hr) &&
            minutes.has(min)
        ) {
            return d;
        }

        current += 60_000; // advance 1 minute
    }

    return null;
}
