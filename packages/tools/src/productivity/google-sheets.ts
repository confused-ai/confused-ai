/**
 * Google Sheets tools — read, write, append, and clear spreadsheet data.
 * Requires OAuth2 access token with spreadsheets scope.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface GoogleSheetsToolConfig {
    /** OAuth2 access token (or GOOGLE_SHEETS_ACCESS_TOKEN env var) */
    accessToken?: string;
}

function getToken(config: GoogleSheetsToolConfig): string {
    const token = config.accessToken ?? process.env['GOOGLE_SHEETS_ACCESS_TOKEN'];
    if (!token) throw new Error('GoogleSheetsTools require GOOGLE_SHEETS_ACCESS_TOKEN');
    return token;
}

async function sheetsFetch(token: string, method: string, path: string, body?: object): Promise<unknown> {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error(`Google Sheets API ${res.status}: ${await res.text()}`);
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const GetValuesSchema = z.object({
    spreadsheetId: z.string().describe('Google Sheets spreadsheet ID (from URL)'),
    range: z.string().describe('A1 notation range (e.g. "Sheet1!A1:D10", "Sheet1")'),
    majorDimension: z.enum(['ROWS', 'COLUMNS']).optional().default('ROWS'),
});

const UpdateValuesSchema = z.object({
    spreadsheetId: z.string(),
    range: z.string().describe('A1 notation range where data will be written'),
    values: z.array(z.array(z.unknown())).describe('2D array of values to write'),
    valueInputOption: z.enum(['RAW', 'USER_ENTERED']).optional().default('USER_ENTERED'),
});

const AppendValuesSchema = z.object({
    spreadsheetId: z.string(),
    range: z.string().describe('A1 notation — rows are appended after the last row in this range'),
    values: z.array(z.array(z.unknown())).describe('2D array of rows to append'),
    valueInputOption: z.enum(['RAW', 'USER_ENTERED']).optional().default('USER_ENTERED'),
});

const ClearValuesSchema = z.object({
    spreadsheetId: z.string(),
    range: z.string().describe('A1 notation range to clear'),
});

const GetSheetInfoSchema = z.object({
    spreadsheetId: z.string(),
});

const BatchGetSchema = z.object({
    spreadsheetId: z.string(),
    ranges: z.array(z.string()).min(1).describe('List of A1 notation ranges to fetch in one call'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class GoogleSheetsGetValuesTool extends BaseTool<typeof GetValuesSchema, {
    range: string;
    values: unknown[][];
    rowCount: number;
}> {
    constructor(private config: GoogleSheetsToolConfig = {}) {
        super({
            id: 'google_sheets_get_values',
            name: 'Google Sheets Get Values',
            description: 'Read cell values from a Google Sheets range.',
            category: ToolCategory.API,
            parameters: GetValuesSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetValuesSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({ majorDimension: input.majorDimension ?? 'ROWS' });
        const data = await sheetsFetch(getToken(this.config), 'GET',
            `/${input.spreadsheetId}/values/${encodeURIComponent(input.range)}?${params}`) as {
            range: string;
            values?: unknown[][];
        };
        const values = data.values ?? [];
        return { range: data.range, values, rowCount: values.length };
    }
}

export class GoogleSheetsUpdateValuesTool extends BaseTool<typeof UpdateValuesSchema, {
    updatedRange: string;
    updatedRows: number;
    updatedColumns: number;
    updatedCells: number;
}> {
    constructor(private config: GoogleSheetsToolConfig = {}) {
        super({
            id: 'google_sheets_update_values',
            name: 'Google Sheets Update Values',
            description: 'Write data to a specific range in a Google Sheet (overwrites existing values).',
            category: ToolCategory.API,
            parameters: UpdateValuesSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof UpdateValuesSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({ valueInputOption: input.valueInputOption ?? 'USER_ENTERED' });
        const data = await sheetsFetch(getToken(this.config), 'PUT',
            `/${input.spreadsheetId}/values/${encodeURIComponent(input.range)}?${params}`,
            { range: input.range, majorDimension: 'ROWS', values: input.values }) as {
            updatedRange: string;
            updatedRows: number;
            updatedColumns: number;
            updatedCells: number;
        };
        return {
            updatedRange: data.updatedRange,
            updatedRows: data.updatedRows,
            updatedColumns: data.updatedColumns,
            updatedCells: data.updatedCells,
        };
    }
}

export class GoogleSheetsAppendValuesTool extends BaseTool<typeof AppendValuesSchema, {
    tableRange: string;
    updatedRows: number;
    updatedCells: number;
}> {
    constructor(private config: GoogleSheetsToolConfig = {}) {
        super({
            id: 'google_sheets_append_values',
            name: 'Google Sheets Append Values',
            description: 'Append rows to the end of data in a Google Sheet range.',
            category: ToolCategory.API,
            parameters: AppendValuesSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof AppendValuesSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({
            valueInputOption: input.valueInputOption ?? 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
        });
        const data = await sheetsFetch(getToken(this.config), 'POST',
            `/${input.spreadsheetId}/values/${encodeURIComponent(input.range)}:append?${params}`,
            { majorDimension: 'ROWS', values: input.values }) as {
            tableRange: string;
            updates: { updatedRows: number; updatedCells: number };
        };
        return {
            tableRange: data.tableRange,
            updatedRows: data.updates?.updatedRows ?? 0,
            updatedCells: data.updates?.updatedCells ?? 0,
        };
    }
}

export class GoogleSheetsClearValuesTool extends BaseTool<typeof ClearValuesSchema, { clearedRange: string }> {
    constructor(private config: GoogleSheetsToolConfig = {}) {
        super({
            id: 'google_sheets_clear_values',
            name: 'Google Sheets Clear Values',
            description: 'Clear all values in a Google Sheets range (preserves formatting).',
            category: ToolCategory.API,
            parameters: ClearValuesSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ClearValuesSchema>, _ctx: ToolContext) {
        const data = await sheetsFetch(getToken(this.config), 'POST',
            `/${input.spreadsheetId}/values/${encodeURIComponent(input.range)}:clear`, {}) as { clearedRange: string };
        return { clearedRange: data.clearedRange };
    }
}

export class GoogleSheetsGetSheetInfoTool extends BaseTool<typeof GetSheetInfoSchema, {
    title: string;
    sheets: Array<{ sheetId: number; title: string; rowCount: number; columnCount: number }>;
}> {
    constructor(private config: GoogleSheetsToolConfig = {}) {
        super({
            id: 'google_sheets_get_sheet_info',
            name: 'Google Sheets Get Sheet Info',
            description: 'Get spreadsheet metadata — title and list of sheets with dimensions.',
            category: ToolCategory.API,
            parameters: GetSheetInfoSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetSheetInfoSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({ fields: 'properties.title,sheets.properties' });
        const data = await sheetsFetch(getToken(this.config), 'GET', `/${input.spreadsheetId}?${params}`) as {
            properties: { title: string };
            sheets: Array<{ properties: { sheetId: number; title: string; gridProperties: { rowCount: number; columnCount: number } } }>;
        };
        return {
            title: data.properties.title,
            sheets: data.sheets.map((s) => ({
                sheetId: s.properties.sheetId,
                title: s.properties.title,
                rowCount: s.properties.gridProperties.rowCount,
                columnCount: s.properties.gridProperties.columnCount,
            })),
        };
    }
}

export class GoogleSheetsBatchGetTool extends BaseTool<typeof BatchGetSchema, {
    ranges: Array<{ range: string; values: unknown[][] }>;
}> {
    constructor(private config: GoogleSheetsToolConfig = {}) {
        super({
            id: 'google_sheets_batch_get',
            name: 'Google Sheets Batch Get',
            description: 'Read multiple ranges from a Google Sheet in a single API call.',
            category: ToolCategory.API,
            parameters: BatchGetSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof BatchGetSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams();
        for (const r of input.ranges) params.append('ranges', r);
        const data = await sheetsFetch(getToken(this.config), 'GET', `/${input.spreadsheetId}/values:batchGet?${params}`) as {
            valueRanges: Array<{ range: string; values?: unknown[][] }>;
        };
        return {
            ranges: (data.valueRanges ?? []).map((vr) => ({
                range: vr.range,
                values: vr.values ?? [],
            })),
        };
    }
}

export class GoogleSheetsToolkit {
    readonly tools: BaseTool[];
    constructor(config: GoogleSheetsToolConfig = {}) {
        this.tools = [
            new GoogleSheetsGetValuesTool(config),
            new GoogleSheetsUpdateValuesTool(config),
            new GoogleSheetsAppendValuesTool(config),
            new GoogleSheetsClearValuesTool(config),
            new GoogleSheetsGetSheetInfoTool(config),
            new GoogleSheetsBatchGetTool(config),
        ];
    }
}
