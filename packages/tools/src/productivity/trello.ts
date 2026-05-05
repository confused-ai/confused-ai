/**
 * Trello tools — manage boards, lists, and cards via the Trello REST API.
 * API key & token: https://trello.com/app-key
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface TrelloToolConfig {
    apiKey?: string;
    token?: string;
}

function getCreds(config: TrelloToolConfig): { key: string; token: string } {
    const key = config.apiKey ?? process.env['TRELLO_API_KEY'];
    const token = config.token ?? process.env['TRELLO_TOKEN'];
    if (!key) throw new Error('TrelloTools require TRELLO_API_KEY');
    if (!token) throw new Error('TrelloTools require TRELLO_TOKEN');
    return { key, token };
}

async function trelloFetch(creds: { key: string; token: string }, method: string, path: string, body?: object): Promise<unknown> {
    const params = new URLSearchParams({ key: creds.key, token: creds.token });
    const res = await fetch(`https://api.trello.com/1${path}?${params}`, {
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error(`Trello API ${res.status}: ${await res.text()}`);
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const GetBoardsSchema = z.object({
    filter: z.enum(['all', 'open', 'closed']).optional().default('open'),
});

const GetBoardSchema = z.object({
    boardId: z.string().describe('Trello board ID'),
    includeLists: z.boolean().optional().default(true),
});

const GetCardsSchema = z.object({
    boardId: z.string().optional().describe('Fetch cards from a board'),
    listId: z.string().optional().describe('Fetch cards from a specific list'),
    filter: z.enum(['all', 'open', 'closed']).optional().default('open'),
});

const CreateCardSchema = z.object({
    name: z.string().describe('Card title'),
    listId: z.string().describe('ID of the list to add the card to'),
    description: z.string().optional().describe('Card description (Markdown supported)'),
    due: z.string().optional().describe('Due date ISO string'),
    labelIds: z.array(z.string()).optional().describe('Label IDs to assign'),
    memberIds: z.array(z.string()).optional().describe('Member IDs to assign'),
    position: z.enum(['top', 'bottom']).optional().default('bottom'),
});

const UpdateCardSchema = z.object({
    cardId: z.string().describe('Trello card ID'),
    name: z.string().optional(),
    description: z.string().optional(),
    due: z.string().optional(),
    closed: z.boolean().optional().describe('Archive (true) or unarchive (false)'),
    listId: z.string().optional().describe('Move card to a different list'),
    position: z.enum(['top', 'bottom']).optional(),
});

const AddCommentSchema = z.object({
    cardId: z.string().describe('Trello card ID'),
    text: z.string().describe('Comment text (Markdown supported)'),
});

const CreateListSchema = z.object({
    boardId: z.string(),
    name: z.string().describe('List name'),
    position: z.enum(['top', 'bottom']).optional().default('bottom'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class TrelloGetBoardsTool extends BaseTool<typeof GetBoardsSchema, {
    boards: Array<{ id: string; name: string; url: string; closed: boolean; desc: string }>;
}> {
    constructor(private config: TrelloToolConfig = {}) {
        super({
            id: 'trello_get_boards',
            name: 'Trello Get Boards',
            description: 'List all Trello boards accessible to the authenticated user.',
            category: ToolCategory.API,
            parameters: GetBoardsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetBoardsSchema>, _ctx: ToolContext) {
        const data = await trelloFetch(getCreds(this.config), 'GET', `/members/me/boards?filter=${input.filter ?? 'open'}`) as Array<Record<string, unknown>>;
        return {
            boards: data.map((b) => ({
                id: b['id'] as string,
                name: b['name'] as string,
                url: b['url'] as string,
                closed: b['closed'] as boolean,
                desc: b['desc'] as string ?? '',
            })),
        };
    }
}

export class TrelloGetBoardTool extends BaseTool<typeof GetBoardSchema, {
    id: string; name: string; url: string; desc: string;
    lists?: Array<{ id: string; name: string; closed: boolean }>;
}> {
    constructor(private config: TrelloToolConfig = {}) {
        super({
            id: 'trello_get_board',
            name: 'Trello Get Board',
            description: 'Get details of a specific Trello board, optionally including its lists.',
            category: ToolCategory.API,
            parameters: GetBoardSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetBoardSchema>, _ctx: ToolContext): Promise<{
        id: string; name: string; url: string; desc: string;
        lists?: Array<{ id: string; name: string; closed: boolean }>;
    }> {
        const creds = getCreds(this.config);
        const board = await trelloFetch(creds, 'GET', `/boards/${input.boardId}`) as Record<string, unknown>;
        const result: {
            id: string; name: string; url: string; desc: string;
            lists?: Array<{ id: string; name: string; closed: boolean }>;
        } = {
            id: board['id'] as string,
            name: board['name'] as string,
            url: board['url'] as string,
            desc: board['desc'] as string ?? '',
        };
        if (input.includeLists) {
            const lists = await trelloFetch(creds, 'GET', `/boards/${input.boardId}/lists`) as Array<Record<string, unknown>>;
            result.lists = lists.map((l) => ({ id: l['id'] as string, name: l['name'] as string, closed: l['closed'] as boolean }));
        }
        return result;
    }
}

export class TrelloGetCardsTool extends BaseTool<typeof GetCardsSchema, {
    cards: Array<{ id: string; name: string; desc: string; url: string; due?: string; listId: string; labels: string[] }>;
}> {
    constructor(private config: TrelloToolConfig = {}) {
        super({
            id: 'trello_get_cards',
            name: 'Trello Get Cards',
            description: 'List Trello cards from a board or a specific list.',
            category: ToolCategory.API,
            parameters: GetCardsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetCardsSchema>, _ctx: ToolContext) {
        if (!input.boardId && !input.listId) throw new Error('Either boardId or listId is required');
        const path = input.listId
            ? `/lists/${input.listId}/cards`
            : `/boards/${input.boardId}/cards/${input.filter ?? 'open'}`;
        const data = await trelloFetch(getCreds(this.config), 'GET', path) as Array<Record<string, unknown>>;
        return {
            cards: data.map((c) => {
                const card: { id: string; name: string; desc: string; url: string; due?: string; listId: string; labels: string[] } = {
                    id: c['id'] as string,
                    name: c['name'] as string,
                    desc: c['desc'] as string ?? '',
                    url: c['url'] as string,
                    listId: c['idList'] as string,
                    labels: ((c['labels'] as Array<{ name: string }>) ?? []).map((l) => l.name),
                };
                if (c['due'] !== undefined) card.due = c['due'] as string;
                return card;
            }),
        };
    }
}

export class TrelloCreateCardTool extends BaseTool<typeof CreateCardSchema, { id: string; name: string; url: string; shortUrl: string }> {
    constructor(private config: TrelloToolConfig = {}) {
        super({
            id: 'trello_create_card',
            name: 'Trello Create Card',
            description: 'Create a new Trello card in a list with optional description, due date, and assignees.',
            category: ToolCategory.API,
            parameters: CreateCardSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CreateCardSchema>, _ctx: ToolContext) {
        const body: Record<string, unknown> = {
            name: input.name,
            idList: input.listId,
            pos: input.position ?? 'bottom',
        };
        if (input.description) body['desc'] = input.description;
        if (input['due']) body['due'] = input['due'];
        if (input.labelIds?.length) body['idLabels'] = input.labelIds.join(',');
        if (input.memberIds?.length) body['idMembers'] = input.memberIds.join(',');

        const card = await trelloFetch(getCreds(this.config), 'POST', '/cards', body) as Record<string, unknown>;
        return { id: card['id'] as string, name: card['name'] as string, url: card['url'] as string, shortUrl: card['shortUrl'] as string };
    }
}

export class TrelloUpdateCardTool extends BaseTool<typeof UpdateCardSchema, { id: string; name: string; url: string }> {
    constructor(private config: TrelloToolConfig = {}) {
        super({
            id: 'trello_update_card',
            name: 'Trello Update Card',
            description: 'Update a Trello card — rename, move to list, change due date, archive, or reposition.',
            category: ToolCategory.API,
            parameters: UpdateCardSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof UpdateCardSchema>, _ctx: ToolContext) {
        const body: Record<string, unknown> = {};
        if (input['name']) body['name'] = input['name'];
        if (input.description !== undefined) body['desc'] = input.description;
        if (input['due'] !== undefined) body['due'] = input['due'];
        if (input['closed'] !== undefined) body['closed'] = input['closed'];
        if (input.listId) body['idList'] = input.listId;
        if (input.position) body['pos'] = input.position;

        const card = await trelloFetch(getCreds(this.config), 'PUT', `/cards/${input.cardId}`, body) as Record<string, unknown>;
        return { id: card['id'] as string, name: card['name'] as string, url: card['url'] as string };
    }
}

export class TrelloAddCommentTool extends BaseTool<typeof AddCommentSchema, { id: string; text: string }> {
    constructor(private config: TrelloToolConfig = {}) {
        super({
            id: 'trello_add_comment',
            name: 'Trello Add Comment',
            description: 'Add a comment to a Trello card.',
            category: ToolCategory.API,
            parameters: AddCommentSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof AddCommentSchema>, _ctx: ToolContext) {
        const action = await trelloFetch(getCreds(this.config), 'POST', `/cards/${input.cardId}/actions/comments`, { text: input.text }) as Record<string, unknown>;
        return { id: action['id'] as string, text: input.text };
    }
}

export class TrelloCreateListTool extends BaseTool<typeof CreateListSchema, { id: string; name: string; boardId: string }> {
    constructor(private config: TrelloToolConfig = {}) {
        super({
            id: 'trello_create_list',
            name: 'Trello Create List',
            description: 'Create a new list (column) on a Trello board.',
            category: ToolCategory.API,
            parameters: CreateListSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CreateListSchema>, _ctx: ToolContext) {
        const list = await trelloFetch(getCreds(this.config), 'POST', '/lists', {
            idBoard: input.boardId,
            name: input.name,
            pos: input.position ?? 'bottom',
        }) as Record<string, unknown>;
        return { id: list['id'] as string, name: list['name'] as string, boardId: list['idBoard'] as string };
    }
}

export class TrelloToolkit {
    readonly tools: BaseTool[];
    constructor(config: TrelloToolConfig = {}) {
        this.tools = [
            new TrelloGetBoardsTool(config),
            new TrelloGetBoardTool(config),
            new TrelloGetCardsTool(config),
            new TrelloCreateCardTool(config),
            new TrelloUpdateCardTool(config),
            new TrelloAddCommentTool(config),
            new TrelloCreateListTool(config),
        ];
    }
}
