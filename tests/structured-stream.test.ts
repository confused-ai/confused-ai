import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { collectStreamText, collectStreamThenValidate } from '../src/providers/structured-output.js';
import type { StreamDelta } from '../src/providers/types.js';

async function* mockStream(chunks: string[]): AsyncIterable<StreamDelta> {
    for (const text of chunks) {
        yield { type: 'text', text };
    }
}

describe('collectStreamText / collectStreamThenValidate', () => {
    it('concatenates text deltas', async () => {
        const text = await collectStreamText(mockStream(['hello', ' ', 'world']));
        expect(text).toBe('hello world');
    });

    it('validates JSON from streamed text', async () => {
        const schema = z.object({ answer: z.number() });
        const result = await collectStreamThenValidate(mockStream(['{"answer": 42}']), { schema });
        expect(result.validated).toBe(true);
        expect(result.data.answer).toBe(42);
    });

    it('ignores tool_call chunks for text collection', async () => {
        async function* s(): AsyncIterable<StreamDelta> {
            yield { type: 'text', text: 'x' };
            yield { type: 'tool_call', id: '1', name: 'n', argsDelta: '{}' };
        }
        expect(await collectStreamText(s())).toBe('x');
    });
});
