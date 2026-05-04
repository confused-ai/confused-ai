/**
 * Structured logger interface. Concrete implementations (pino, winston) ship
 * in adapter packages; a JSON `ConsoleLogger` is provided here as the
 * zero-dependency default.
 *
 * @module
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: string;
  readonly [key: string]: unknown;
}

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface ConsoleLoggerOptions {
  level?: LogLevel;
  bindings?: Record<string, unknown>;
  /** Custom write target — useful for tests. Defaults to process.stdout. */
  write?: (line: string) => void;
}

export class ConsoleLogger implements Logger {
  private readonly level: LogLevel;
  private readonly bindings: Record<string, unknown>;
  private readonly write: (line: string) => void;

  constructor(opts: ConsoleLoggerOptions = {}) {
    this.level = opts.level ?? (process.env['LOG_LEVEL'] as LogLevel | undefined) ?? 'info';
    this.bindings = opts.bindings ?? {};
    this.write = opts.write ?? ((line) => process.stdout.write(line + '\n'));
  }

  private emit(level: LogLevel, message: string, ctx?: Record<string, unknown>): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.level]) return;
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...this.bindings,
      ...(ctx ?? {}),
    };
    this.write(JSON.stringify(entry));
  }

  debug(msg: string, ctx?: Record<string, unknown>): void { this.emit('debug', msg, ctx); }
  info(msg: string, ctx?: Record<string, unknown>): void { this.emit('info', msg, ctx); }
  warn(msg: string, ctx?: Record<string, unknown>): void { this.emit('warn', msg, ctx); }
  error(msg: string, ctx?: Record<string, unknown>): void { this.emit('error', msg, ctx); }

  child(bindings: Record<string, unknown>): Logger {
    return new ConsoleLogger({
      level: this.level,
      bindings: { ...this.bindings, ...bindings },
      write: this.write,
    });
  }
}

export function createLogger(opts?: ConsoleLoggerOptions): Logger {
  return new ConsoleLogger(opts);
}
