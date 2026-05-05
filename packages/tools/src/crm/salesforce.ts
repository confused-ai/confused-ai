/**
 * Salesforce CRM tools — manage leads, contacts, accounts, opportunities via Salesforce REST API.
 * Docs: https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface SalesforceToolConfig {
    /** Salesforce instance URL, e.g. https://yourorg.salesforce.com (or SALESFORCE_INSTANCE_URL env var) */
    instanceUrl?: string;
    /** OAuth access token (or SALESFORCE_ACCESS_TOKEN env var) */
    accessToken?: string;
    /** API version (default: v59.0) */
    apiVersion?: string;
}

function getAuth(config: SalesforceToolConfig): { baseUrl: string; headers: Record<string, string> } {
    const instanceUrl = (config.instanceUrl ?? process.env['SALESFORCE_INSTANCE_URL'] ?? '').replace(/\/$/, '');
    const accessToken = config.accessToken ?? process.env['SALESFORCE_ACCESS_TOKEN'];
    if (!instanceUrl) throw new Error('SalesforceTools require SALESFORCE_INSTANCE_URL');
    if (!accessToken) throw new Error('SalesforceTools require SALESFORCE_ACCESS_TOKEN');
    const version = config.apiVersion ?? 'v59.0';
    return {
        baseUrl: `${instanceUrl}/services/data/${version}`,
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    };
}

async function sfRequest(auth: ReturnType<typeof getAuth>, method: string, path: string, body?: object): Promise<unknown> {
    const res = await fetch(`${auth.baseUrl}${path}`, {
        method,
        headers: auth.headers,
        ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    if (!res.ok) throw new Error(`Salesforce API ${res.status}: ${await res.text()}`);
    if (res.status === 204) return { success: true };
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SOQLQuerySchema = z.object({
    query: z.string().describe('SOQL query string (e.g. "SELECT Id, Name, Email FROM Contact LIMIT 10")'),
});

const GetRecordSchema = z.object({
    objectType: z.string().describe('Salesforce object type (e.g. Contact, Lead, Account, Opportunity)'),
    recordId: z.string().describe('Salesforce record ID'),
    fields: z.array(z.string()).optional().describe('Specific fields to retrieve (omit for all)'),
});

const CreateRecordSchema = z.object({
    objectType: z.string().describe('Salesforce object type (e.g. Lead, Contact, Account, Opportunity)'),
    fields: z.record(z.string(), z.unknown()).describe('Record fields as key-value pairs'),
});

const UpdateRecordSchema = z.object({
    objectType: z.string().describe('Salesforce object type'),
    recordId: z.string().describe('Salesforce record ID to update'),
    fields: z.record(z.string(), z.unknown()).describe('Fields to update as key-value pairs'),
});

const SearchSchema = z.object({
    query: z.string().describe('SOSL search string (e.g. "FIND {John} IN ALL FIELDS RETURNING Contact(Name, Email)")'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class SalesforceQueryTool extends BaseTool<typeof SOQLQuerySchema> {
    constructor(private config: SalesforceToolConfig = {}) {
        super({
            id: 'salesforce_query',
            name: 'Salesforce SOQL Query',
            description: 'Execute a SOQL query against Salesforce and return records. Use for searching leads, contacts, accounts, opportunities, etc.',
            category: ToolCategory.DATABASE,
            parameters: SOQLQuerySchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SOQLQuerySchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const params = new URLSearchParams({ q: input.query });
        return sfRequest(auth, 'GET', `/query?${params}`);
    }
}

export class SalesforceGetRecordTool extends BaseTool<typeof GetRecordSchema> {
    constructor(private config: SalesforceToolConfig = {}) {
        super({
            id: 'salesforce_get_record',
            name: 'Salesforce Get Record',
            description: 'Get a specific Salesforce record by ID.',
            category: ToolCategory.DATABASE,
            parameters: GetRecordSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetRecordSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const path = `/sobjects/${input.objectType}/${input.recordId}`;
        const params = input.fields?.length ? `?fields=${input.fields.join(',')}` : '';
        return sfRequest(auth, 'GET', `${path}${params}`);
    }
}

export class SalesforceCreateRecordTool extends BaseTool<typeof CreateRecordSchema> {
    constructor(private config: SalesforceToolConfig = {}) {
        super({
            id: 'salesforce_create_record',
            name: 'Salesforce Create Record',
            description: 'Create a new Salesforce record (Lead, Contact, Account, Opportunity, etc.).',
            category: ToolCategory.DATABASE,
            parameters: CreateRecordSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CreateRecordSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        return sfRequest(auth, 'POST', `/sobjects/${input.objectType}`, input.fields);
    }
}

export class SalesforceUpdateRecordTool extends BaseTool<typeof UpdateRecordSchema> {
    constructor(private config: SalesforceToolConfig = {}) {
        super({
            id: 'salesforce_update_record',
            name: 'Salesforce Update Record',
            description: 'Update an existing Salesforce record.',
            category: ToolCategory.DATABASE,
            parameters: UpdateRecordSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof UpdateRecordSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        return sfRequest(auth, 'PATCH', `/sobjects/${input.objectType}/${input.recordId}`, input.fields);
    }
}

export class SalesforceSearchTool extends BaseTool<typeof SearchSchema> {
    constructor(private config: SalesforceToolConfig = {}) {
        super({
            id: 'salesforce_search',
            name: 'Salesforce SOSL Search',
            description: 'Full-text search across Salesforce objects using SOSL.',
            category: ToolCategory.DATABASE,
            parameters: SearchSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const params = new URLSearchParams({ q: input.query });
        return sfRequest(auth, 'GET', `/search?${params}`);
    }
}

export class SalesforceToolkit {
    readonly query: SalesforceQueryTool;
    readonly getRecord: SalesforceGetRecordTool;
    readonly createRecord: SalesforceCreateRecordTool;
    readonly updateRecord: SalesforceUpdateRecordTool;
    readonly search: SalesforceSearchTool;

    constructor(config: SalesforceToolConfig = {}) {
        this.query = new SalesforceQueryTool(config);
        this.getRecord = new SalesforceGetRecordTool(config);
        this.createRecord = new SalesforceCreateRecordTool(config);
        this.updateRecord = new SalesforceUpdateRecordTool(config);
        this.search = new SalesforceSearchTool(config);
    }

    getTools() {
        return [this.query, this.getRecord, this.createRecord, this.updateRecord, this.search];
    }
}
