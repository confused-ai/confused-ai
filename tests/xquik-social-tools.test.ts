import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    XquikSearchPostsTool,
    XquikSearchUsersTool,
    XquikToolkit,
    XquikTrendsTool,
} from '../src/tools/social/xquik.js';
import type { ToolContext } from '../src/tools/core/types.js';

const originalFetch = globalThis.fetch;

const context: ToolContext = {
    toolId: 'test-tool',
    agentId: 'test-agent',
    sessionId: 'test-session',
    permissions: {
        allowNetwork: true,
        allowFileSystem: false,
        maxExecutionTimeMs: 15000,
    },
};

function stubFetch(body: unknown, status = 200) {
    const fetchMock = vi.fn(async (_input: unknown, _init?: unknown) => {
        return new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    });

    Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: fetchMock,
        writable: true,
    });
    return fetchMock;
}

function getRequest(fetchMock: ReturnType<typeof stubFetch>) {
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error('Expected fetch to be called');

    return {
        url: new URL(String(call[0])),
        init: call[1] as RequestInit,
    };
}

afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: originalFetch,
        writable: true,
    });
    vi.clearAllMocks();
});

describe('Xquik social tools', () => {
    it('searches X posts through the Xquik REST API', async () => {
        const fetchMock = stubFetch({ tweets: [{ id: '1', text: 'hello' }] });
        const tool = new XquikSearchPostsTool({ apiKey: 'test-key' });

        const result = await tool.execute(
            { query: 'agent frameworks', queryType: 'Top', limit: 10, cursor: 'next' },
            context
        );
        const request = getRequest(fetchMock);

        expect(result.success).toBe(true);
        expect(result.data).toEqual({ tweets: [{ id: '1', text: 'hello' }] });
        expect(request.url.pathname).toBe('/api/v1/x/tweets/search');
        expect(request.url.searchParams.get('q')).toBe('agent frameworks');
        expect(request.url.searchParams.get('queryType')).toBe('Top');
        expect(request.url.searchParams.get('limit')).toBe('10');
        expect(request.url.searchParams.get('cursor')).toBe('next');
        expect((request.init.headers as Record<string, string>)['x-api-key']).toBe('test-key');
    });

    it('searches X users through the Xquik REST API', async () => {
        const fetchMock = stubFetch({ users: [{ username: 'xquik' }] });
        const tool = new XquikSearchUsersTool({ apiKey: 'test-key', baseUrl: 'https://api.example.com/' });

        const result = await tool.execute({ query: 'xquik' }, context);
        const request = getRequest(fetchMock);

        expect(result.success).toBe(true);
        expect(result.data).toEqual({ users: [{ username: 'xquik' }] });
        expect(request.url.origin).toBe('https://api.example.com');
        expect(request.url.pathname).toBe('/api/v1/x/users/search');
        expect(request.url.searchParams.get('q')).toBe('xquik');
    });

    it('gets regional X trends through the Xquik REST API', async () => {
        const fetchMock = stubFetch({ trends: [{ name: '#AI' }] });
        const tool = new XquikTrendsTool({ apiKey: 'test-key' });

        const result = await tool.execute({ woeid: 23424977, count: 5 }, context);
        const request = getRequest(fetchMock);

        expect(result.success).toBe(true);
        expect(result.data).toEqual({ trends: [{ name: '#AI' }] });
        expect(request.url.pathname).toBe('/api/v1/x/trends');
        expect(request.url.searchParams.get('woeid')).toBe('23424977');
        expect(request.url.searchParams.get('count')).toBe('5');
    });

    it('returns execution errors for missing keys and API failures', async () => {
        const missingKeyTool = new XquikSearchPostsTool();

        const missingKeyResult = await missingKeyTool.execute({ query: 'ai' }, context);

        expect(missingKeyResult.success).toBe(false);
        expect(missingKeyResult.error?.message).toContain('XQUIK_API_KEY');

        const fetchMock = stubFetch({ error: 'request denied' }, 402);
        const failingTool = new XquikSearchPostsTool({ apiKey: 'test-key' });

        const failureResult = await failingTool.execute({ query: 'ai' }, context);

        expect(failureResult.success).toBe(false);
        expect(failureResult.error?.message).toContain('Xquik API 402: request denied');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('groups the Xquik social tools in a toolkit', () => {
        const toolkit = new XquikToolkit({ apiKey: 'test-key' });

        expect(toolkit.getTools().map(tool => tool.name)).toEqual([
            'Xquik Search X Posts',
            'Xquik Search X Users',
            'Xquik X Trends',
        ]);
    });
});
