/**
 * AWS Lambda invocation tools — invoke Lambda functions via AWS SDK (fetch-based).
 * Docs: https://docs.aws.amazon.com/lambda/latest/api/API_Invoke.html
 */

import { z } from 'zod';
import { createHmac, createHash } from 'crypto';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface AWSLambdaToolConfig {
    /** AWS region (or AWS_DEFAULT_REGION / AWS_REGION env var) */
    region?: string;
    /** AWS Access Key ID (or AWS_ACCESS_KEY_ID env var) */
    accessKeyId?: string;
    /** AWS Secret Access Key (or AWS_SECRET_ACCESS_KEY env var) */
    secretAccessKey?: string;
    /** AWS Session Token for temporary credentials (or AWS_SESSION_TOKEN env var) */
    sessionToken?: string;
}

interface AWSCreds {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
}

function getAuth(config: AWSLambdaToolConfig): AWSCreds {
    const region = config.region ?? process.env['AWS_DEFAULT_REGION'] ?? process.env['AWS_REGION'];
    const accessKeyId = config.accessKeyId ?? process.env['AWS_ACCESS_KEY_ID'];
    const secretAccessKey = config.secretAccessKey ?? process.env['AWS_SECRET_ACCESS_KEY'];
    const sessionToken = config.sessionToken ?? process.env['AWS_SESSION_TOKEN'];
    if (!region) throw new Error('AWSLambdaTools require AWS_DEFAULT_REGION');
    if (!accessKeyId) throw new Error('AWSLambdaTools require AWS_ACCESS_KEY_ID');
    if (!secretAccessKey) throw new Error('AWSLambdaTools require AWS_SECRET_ACCESS_KEY');
    return { region, accessKeyId, secretAccessKey, ...(sessionToken !== undefined && { sessionToken }) };
}

/** AWS Signature Version 4 signing */
function sign(creds: AWSCreds, method: string, url: string, body: string): Record<string, string> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
    const dateStamp = amzDate.slice(0, 8);
    const parsedUrl = new URL(url);
    const service = 'lambda';

    const headers: Record<string, string> = {
        'x-amz-date': amzDate,
        host: parsedUrl.hostname,
        'content-type': 'application/json',
    };
    if (creds.sessionToken) headers['x-amz-security-token'] = creds.sessionToken;

    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`).join('\n') + '\n';
    const payloadHash = createHash('sha256').update(body).digest('hex');
    const canonicalRequest = [method, parsedUrl.pathname, parsedUrl.search.slice(1),
        canonicalHeaders, signedHeaders, payloadHash].join('\n');

    const credScope = `${dateStamp}/${creds.region}/${service}/aws4_request`;
    const strToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credScope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`;

    const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${creds.secretAccessKey}`, dateStamp), creds.region), service), 'aws4_request');
    const signature = createHmac('sha256', signingKey).update(strToSign).digest('hex');

    return {
        ...headers,
        Authorization: `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
}

// ── Schemas ────────────────────────────────────────────────────────────────

const InvokeSchema = z.object({
    functionName: z.string().describe('Lambda function name or ARN'),
    payload: z.record(z.string(), z.unknown()).optional().describe('JSON payload to pass to the function'),
    invocationType: z.enum(['RequestResponse', 'Event', 'DryRun']).optional().default('RequestResponse')
        .describe('Invocation type: RequestResponse (sync), Event (async), DryRun (validate only)'),
    qualifier: z.string().optional().describe('Lambda function version or alias'),
    logType: z.enum(['None', 'Tail']).optional().default('None')
        .describe('Set to Tail to include execution logs in response (last 4KB)'),
});

const ListFunctionsSchema = z.object({
    maxItems: z.number().int().min(1).max(100).optional().default(50)
        .describe('Maximum number of functions to list'),
    marker: z.string().optional().describe('Pagination token'),
    functionVersion: z.enum(['ALL']).optional().describe('Set to ALL to list all versions'),
});

const GetFunctionSchema = z.object({
    functionName: z.string().describe('Lambda function name or ARN'),
    qualifier: z.string().optional().describe('Function version or alias'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class AWSLambdaInvokeTool extends BaseTool<typeof InvokeSchema, {
    statusCode: number;
    executedVersion: string;
    payload: unknown;
    logResult?: string;
    functionError?: string;
}> {
    constructor(private config: AWSLambdaToolConfig = {}) {
        super({
            id: 'aws_lambda_invoke',
            name: 'AWS Lambda Invoke',
            description: 'Invoke an AWS Lambda function synchronously or asynchronously.',
            category: ToolCategory.UTILITY,
            parameters: InvokeSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 300000 },
        });
    }

    protected async performExecute(input: z.infer<typeof InvokeSchema>, _ctx: ToolContext) {
        const creds = getAuth(this.config);
        const body = JSON.stringify(input.payload ?? {});
        const qualifier = input.qualifier ? `?Qualifier=${encodeURIComponent(input.qualifier)}` : '';
        const url = `https://lambda.${creds.region}.amazonaws.com/2015-03-31/functions/${encodeURIComponent(input.functionName)}/invocations${qualifier}`;
        const headers = sign(creds, 'POST', url, body);
        headers['X-Amz-Invocation-Type'] = input.invocationType ?? 'RequestResponse';
        headers['X-Amz-Log-Type'] = input.logType ?? 'None';

        const res = await fetch(url, { method: 'POST', headers, body });
        const statusCode = res.status;
        const functionError = res.headers.get('X-Amz-Function-Error') ?? undefined;
        const executedVersion = res.headers.get('X-Amz-Executed-Version') ?? '$LATEST';
        const logResultB64 = res.headers.get('X-Amz-Log-Result');
        const logResult = logResultB64 ? Buffer.from(logResultB64, 'base64').toString() : undefined;

        const responseText = await res.text();
        let payload: unknown;
        try { payload = JSON.parse(responseText); } catch { payload = responseText; }

        const result: { statusCode: number; executedVersion: string; payload: unknown; logResult?: string; functionError?: string } = { statusCode, executedVersion, payload };
        if (logResult !== undefined) result.logResult = logResult;
        if (functionError !== undefined) result.functionError = functionError;
        return result;
    }
}

export class AWSLambdaListFunctionsTool extends BaseTool<typeof ListFunctionsSchema> {
    constructor(private config: AWSLambdaToolConfig = {}) {
        super({
            id: 'aws_lambda_list_functions',
            name: 'AWS Lambda List Functions',
            description: 'List AWS Lambda functions in the current region.',
            category: ToolCategory.UTILITY,
            parameters: ListFunctionsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ListFunctionsSchema>, _ctx: ToolContext) {
        const creds = getAuth(this.config);
        const params = new URLSearchParams({ MaxItems: String(input.maxItems ?? 50) });
        if (input.marker) params.set('Marker', input.marker);
        if (input.functionVersion) params.set('FunctionVersion', input.functionVersion);
        const url = `https://lambda.${creds.region}.amazonaws.com/2015-03-31/functions?${params}`;
        const headers = sign(creds, 'GET', url, '');
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`AWS Lambda API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class AWSLambdaGetFunctionTool extends BaseTool<typeof GetFunctionSchema> {
    constructor(private config: AWSLambdaToolConfig = {}) {
        super({
            id: 'aws_lambda_get_function',
            name: 'AWS Lambda Get Function',
            description: 'Get configuration and metadata for an AWS Lambda function.',
            category: ToolCategory.UTILITY,
            parameters: GetFunctionSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetFunctionSchema>, _ctx: ToolContext) {
        const creds = getAuth(this.config);
        const qualifier = input.qualifier ? `?Qualifier=${encodeURIComponent(input.qualifier)}` : '';
        const url = `https://lambda.${creds.region}.amazonaws.com/2015-03-31/functions/${encodeURIComponent(input.functionName)}${qualifier}`;
        const headers = sign(creds, 'GET', url, '');
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`AWS Lambda API ${res.status}: ${await res.text()}`);
        return res.json();
    }
}

export class AWSLambdaToolkit {
    readonly invoke: AWSLambdaInvokeTool;
    readonly listFunctions: AWSLambdaListFunctionsTool;
    readonly getFunction: AWSLambdaGetFunctionTool;

    constructor(config: AWSLambdaToolConfig = {}) {
        this.invoke = new AWSLambdaInvokeTool(config);
        this.listFunctions = new AWSLambdaListFunctionsTool(config);
        this.getFunction = new AWSLambdaGetFunctionTool(config);
    }

    getTools() {
        return [this.invoke, this.listFunctions, this.getFunction];
    }
}
