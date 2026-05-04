import { describe, it, expect } from 'vitest';
import { defineTool }  from '../src/types.js';
import { httpClient }  from '../src/http-client.js';
import { fileSystem }  from '../src/file-system.js';
import { shell }       from '../src/shell.js';
import { z }           from 'zod';
import { tmpdir }      from 'node:os';
import { join }        from 'node:path';

// ── defineTool ─────────────────────────────────────────────────────────────────

describe('defineTool', () => {
  const addTool = defineTool({
    name: 'add',
    description: 'Add two numbers',
    parameters: z.object({ a: z.number(), b: z.number() }),
    execute: async ({ a, b }) => ({ sum: a + b }),
  });

  it('has correct name and description', () => {
    expect(addTool.name).toBe('add');
    expect(addTool.description).toBe('Add two numbers');
  });

  it('executes with valid input', async () => {
    const result = await addTool.execute({ a: 3, b: 4 });
    expect(result).toEqual({ sum: 7 });
  });

  it('throws on invalid input (Zod validation)', async () => {
    await expect(addTool.execute({ a: 'not-a-number', b: 4 })).rejects.toThrow('[tool:add]');
  });

  it('parameters is a JSON schema object', () => {
    expect(addTool.parameters).toBeDefined();
    expect(typeof addTool.parameters).toBe('object');
    // defineTool converts Zod schema to JSON schema
    expect((addTool.parameters as Record<string, unknown>).type).toBe('object');
  });
});

// ── httpClient ─────────────────────────────────────────────────────────────────

describe('httpClient', () => {
  it('has correct name', () => {
    expect(httpClient.name).toBe('http_request');
  });

  it('rejects invalid URL', async () => {
    await expect(httpClient.execute({ url: 'not-a-url', method: 'GET' }))
      .rejects.toThrow('[tool:http_request]');
  });

  it('makes a real GET request', { timeout: 10_000 }, async () => {
    const result = await httpClient.execute({ url: 'https://httpbin.org/get', method: 'GET' }) as Record<string, unknown>;
    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
  });
});

// ── fileSystem ─────────────────────────────────────────────────────────────────

describe('fileSystem', () => {
  const tmpFile = join(tmpdir(), `confused-ai-test-${Date.now()}.txt`);

  it('has correct name', () => {
    expect(fileSystem.name).toBe('file_system');
  });

  it('write then read round-trip', async () => {
    await fileSystem.execute({ operation: 'write', filePath: tmpFile, content: 'hello world' });
    const result = await fileSystem.execute({ operation: 'read', filePath: tmpFile }) as Record<string, unknown>;
    expect(result.content).toBe('hello world');
  });

  it('exists() returns true for written file', async () => {
    const result = await fileSystem.execute({ operation: 'exists', filePath: tmpFile }) as Record<string, unknown>;
    expect(result.exists).toBe(true);
  });

  it('exists() returns false for missing file', async () => {
    const result = await fileSystem.execute({ operation: 'exists', filePath: '/tmp/__nonexistent_file__' }) as Record<string, unknown>;
    expect(result.exists).toBe(false);
  });

  it('append adds to existing file', async () => {
    await fileSystem.execute({ operation: 'append', filePath: tmpFile, content: ' more' });
    const result = await fileSystem.execute({ operation: 'read', filePath: tmpFile }) as Record<string, unknown>;
    expect(result.content).toBe('hello world more');
  });

  it('list returns entries from a directory', async () => {
    const entries = await fileSystem.execute({ operation: 'list', dirPath: tmpdir() }) as unknown[];
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('delete removes the file', async () => {
    await fileSystem.execute({ operation: 'delete', filePath: tmpFile });
    const result = await fileSystem.execute({ operation: 'exists', filePath: tmpFile }) as Record<string, unknown>;
    expect(result.exists).toBe(false);
  });
});

// ── shell ──────────────────────────────────────────────────────────────────────

describe('shell', () => {
  it('has correct name', () => {
    expect(shell.name).toBe('shell');
  });

  it('executes echo command', async () => {
    const result = await shell.execute({ command: 'echo', args: ['hello'] }) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.stdout).toBe('hello');
  });

  it('returns failure for bad command', async () => {
    const result = await shell.execute({ command: 'false', args: [] }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });

  it('rejects empty command via Zod', async () => {
    await expect(shell.execute({ command: '', args: [] })).rejects.toThrow('[tool:shell]');
  });

  it('captures stdout and stderr separately', async () => {
    const result = await shell.execute({ command: 'sh', args: ['-c', 'echo out; echo err >&2'] }) as Record<string, unknown>;
    expect(result.stdout).toContain('out');
    expect(result.stderr).toContain('err');
  });
});
