/**
 * CLI — `confused-ai inspect` command
 *
 * Shows a per-node execution summary table for a durable run.
 *
 * Usage:
 *   confused-ai inspect --run-id <executionId> [--db <path>]
 */

import type { Command } from 'commander';
import { SqliteEventStore, GraphEventType } from '@confused-ai/graph';
import type { GraphEvent } from '@confused-ai/graph';

interface NodeSummary {
  nodeId: string;
  status: string;
  attempts: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  error?: string;
}

function buildNodeSummaries(events: GraphEvent[]): Map<string, NodeSummary> {
  const nodes = new Map<string, NodeSummary>();

  for (const e of events) {
    if (!e.nodeId) continue;
    if (!nodes.has(e.nodeId)) {
      nodes.set(e.nodeId, { nodeId: e.nodeId, status: 'pending', attempts: 0 });
    }
    const n = nodes.get(e.nodeId)!;

    switch (e.type) {
      case GraphEventType.NODE_STARTED:
        n.status = 'running';
        n.attempts = (e.data?.attempt as number) ?? n.attempts + 1;
        n.startedAt = e.timestamp;
        break;
      case GraphEventType.NODE_COMPLETED:
        n.status = 'completed';
        n.completedAt = e.timestamp;
        n.durationMs = e.data?.durationMs as number | undefined;
        break;
      case GraphEventType.NODE_FAILED:
        n.status = 'failed';
        n.error = e.data?.error as string | undefined;
        n.completedAt = e.timestamp;
        break;
      case GraphEventType.NODE_SKIPPED:
        n.status = 'skipped';
        break;
      case GraphEventType.NODE_RETRYING:
        n.status = 'retrying';
        break;
    }
  }
  return nodes;
}

function statusIcon(status: string): string {
  switch (status) {
    case 'completed': return '✓';
    case 'failed':    return '✗';
    case 'skipped':   return '○';
    case 'running':   return '⟳';
    case 'retrying':  return '↺';
    default:          return '?';
  }
}

export function registerInspectCommand(program: Command): void {
  program
    .command('inspect')
    .description('Show per-node execution summary for a run')
    .requiredOption('--run-id <id>', 'Execution ID to inspect')
    .option('--db <path>', 'Path to the SQLite event store', './agent.db')
    .action(async (opts) => {
      const store = new SqliteEventStore(opts.db);
      await store.init();

      const events = await store.load(opts.runId);
      if (events.length === 0) {
        console.error(`No events found for run-id "${opts.runId}" in ${opts.db}`);
        process.exit(1);
      }

      const execStatus = events.find(e => e.type === GraphEventType.EXECUTION_COMPLETED)
        ? 'COMPLETED'
        : events.find(e => e.type === GraphEventType.EXECUTION_FAILED)
        ? 'FAILED'
        : 'IN_PROGRESS';

      const nodes = buildNodeSummaries(events);

      const first = events[0];
      const last  = events[events.length - 1];

      console.log(`\nRun:    ${opts.runId}`);
      console.log(`Status: ${execStatus}`);
      console.log(`Events: ${events.length}  (${first ? new Date(first.timestamp).toISOString() : 'n/a'} → ${last ? new Date(last.timestamp).toISOString() : 'n/a'})`);
      console.log();

      // Table header
      const COL = { id: 16, status: 12, attempts: 8, duration: 10, error: 30 };
      const header =
        'NODE ID'.padEnd(COL.id) +
        'STATUS'.padEnd(COL.status) +
        'TRIES'.padEnd(COL.attempts) +
        'DURATION'.padEnd(COL.duration) +
        'ERROR';
      console.log(header);
      console.log('─'.repeat(header.length + 10));

      for (const n of nodes.values()) {
        const dur = n.durationMs != null
          ? `${n.durationMs}ms`
          : n.startedAt && n.completedAt
          ? `${n.completedAt - n.startedAt}ms`
          : '-';
        const row =
          `${statusIcon(n.status)} ${n.nodeId.slice(0, COL.id - 2).padEnd(COL.id - 2)}` +
          n.status.padEnd(COL.status) +
          String(n.attempts).padEnd(COL.attempts) +
          dur.padEnd(COL.duration) +
          (n.error ?? '');
        console.log(row);
      }
      console.log();
    });
}
