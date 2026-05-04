/**
 * Google Drive tools — manage files and folders via Google Drive API.
 * Docs: https://developers.google.com/drive/api/v3/reference
 * OAuth2 with drive.file or drive scope required.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface GoogleDriveToolConfig {
    /** Google OAuth2 access token (or GOOGLE_ACCESS_TOKEN env var) */
    accessToken?: string;
}

function getToken(config: GoogleDriveToolConfig): string {
    const token = config.accessToken ?? process.env.GOOGLE_ACCESS_TOKEN;
    if (!token) throw new Error('GoogleDriveTools require GOOGLE_ACCESS_TOKEN');
    return token;
}

async function driveRequest(token: string, method: string, path: string, body?: object, params?: URLSearchParams): Promise<unknown> {
    const url = new URL(`https://www.googleapis.com/drive/v3${path}`);
    if (params) params.forEach((v, k) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Google Drive API ${res.status}: ${await res.text()}`);
    if (res.status === 204) return { success: true };
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const ListFilesSchema = z.object({
    query: z.string().optional().describe('Search query (Drive query syntax, e.g. "name contains \'report\' and mimeType=\'application/pdf\'")'),
    pageSize: z.number().int().min(1).max(1000).optional().default(20).describe('Max number of files'),
    orderBy: z.string().optional().default('modifiedTime desc').describe('Sort order'),
    folderId: z.string().optional().describe('List files in a specific folder ID'),
    includeItemsFromAllDrives: z.boolean().optional().default(false)
        .describe('Include items from Shared Drives'),
});

const GetFileSchema = z.object({
    fileId: z.string().describe('Google Drive file ID'),
    fields: z.string().optional().default('id, name, mimeType, size, modifiedTime, parents, webViewLink')
        .describe('Fields to return (Drive field mask)'),
});

const CreateFolderSchema = z.object({
    name: z.string().describe('Folder name'),
    parentId: z.string().optional().describe('Parent folder ID (omit for root)'),
});

const DeleteFileSchema = z.object({
    fileId: z.string().describe('Google Drive file ID to delete (sends to trash)'),
});

const MoveFileSchema = z.object({
    fileId: z.string().describe('File ID to move'),
    newParentId: z.string().describe('Target folder ID'),
    removeFromCurrentFolder: z.boolean().optional().default(true)
        .describe('Remove from current parent folder'),
});

const ShareFileSchema = z.object({
    fileId: z.string().describe('File ID to share'),
    email: z.string().email().optional().describe('Email address to share with'),
    role: z.enum(['reader', 'commenter', 'writer', 'owner']).optional().default('reader')
        .describe('Permission role'),
    type: z.enum(['user', 'group', 'domain', 'anyone']).optional().default('user')
        .describe('Permission type'),
    sendNotification: z.boolean().optional().default(true).describe('Send notification email'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class GoogleDriveListFilesTool extends BaseTool<typeof ListFilesSchema> {
    constructor(private config: GoogleDriveToolConfig = {}) {
        super({
            id: 'google_drive_list_files',
            name: 'Google Drive List Files',
            description: 'List or search files in Google Drive.',
            category: ToolCategory.API,
            parameters: ListFilesSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ListFilesSchema>, _ctx: ToolContext) {
        const token = getToken(this.config);
        const params = new URLSearchParams({
            pageSize: String(input.pageSize ?? 20),
            orderBy: input.orderBy ?? 'modifiedTime desc',
            fields: 'files(id, name, mimeType, size, modifiedTime, parents, webViewLink)',
            includeItemsFromAllDrives: String(input.includeItemsFromAllDrives ?? false),
            supportsAllDrives: String(input.includeItemsFromAllDrives ?? false),
        });

        const queryParts: string[] = [];
        if (input.query) queryParts.push(input.query);
        if (input.folderId) queryParts.push(`'${input.folderId}' in parents`);
        if (queryParts.length) params.set('q', queryParts.join(' and '));

        return driveRequest(token, 'GET', '/files', undefined, params);
    }
}

export class GoogleDriveGetFileTool extends BaseTool<typeof GetFileSchema> {
    constructor(private config: GoogleDriveToolConfig = {}) {
        super({
            id: 'google_drive_get_file',
            name: 'Google Drive Get File',
            description: 'Get metadata for a specific Google Drive file.',
            category: ToolCategory.API,
            parameters: GetFileSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetFileSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({ fields: input.fields ?? 'id, name, mimeType, size, modifiedTime, parents, webViewLink' });
        return driveRequest(getToken(this.config), 'GET', `/files/${input.fileId}`, undefined, params);
    }
}

export class GoogleDriveCreateFolderTool extends BaseTool<typeof CreateFolderSchema> {
    constructor(private config: GoogleDriveToolConfig = {}) {
        super({
            id: 'google_drive_create_folder',
            name: 'Google Drive Create Folder',
            description: 'Create a new folder in Google Drive.',
            category: ToolCategory.API,
            parameters: CreateFolderSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CreateFolderSchema>, _ctx: ToolContext) {
        const body: Record<string, unknown> = {
            name: input.name,
            mimeType: 'application/vnd.google-apps.folder',
        };
        if (input.parentId) body['parents'] = [input.parentId];
        return driveRequest(getToken(this.config), 'POST', '/files', body);
    }
}

export class GoogleDriveDeleteFileTool extends BaseTool<typeof DeleteFileSchema> {
    constructor(private config: GoogleDriveToolConfig = {}) {
        super({
            id: 'google_drive_delete_file',
            name: 'Google Drive Delete File',
            description: 'Move a Google Drive file to trash.',
            category: ToolCategory.API,
            parameters: DeleteFileSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof DeleteFileSchema>, _ctx: ToolContext) {
        return driveRequest(getToken(this.config), 'DELETE', `/files/${input.fileId}`);
    }
}

export class GoogleDriveMoveFileTool extends BaseTool<typeof MoveFileSchema> {
    constructor(private config: GoogleDriveToolConfig = {}) {
        super({
            id: 'google_drive_move_file',
            name: 'Google Drive Move File',
            description: 'Move a Google Drive file to a different folder.',
            category: ToolCategory.API,
            parameters: MoveFileSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof MoveFileSchema>, _ctx: ToolContext) {
        // First get current parents
        const token = getToken(this.config);
        const fileData = await driveRequest(token, 'GET', `/files/${input.fileId}`, undefined,
            new URLSearchParams({ fields: 'parents' })) as { parents?: string[] };

        const params = new URLSearchParams({ addParents: input.newParentId });
        if (input.removeFromCurrentFolder && fileData.parents?.length) {
            params.set('removeParents', fileData.parents.join(','));
        }
        return driveRequest(token, 'PATCH', `/files/${input.fileId}`, undefined, params);
    }
}

export class GoogleDriveShareFileTool extends BaseTool<typeof ShareFileSchema> {
    constructor(private config: GoogleDriveToolConfig = {}) {
        super({
            id: 'google_drive_share_file',
            name: 'Google Drive Share File',
            description: 'Share a Google Drive file with a user, group, or make it public.',
            category: ToolCategory.API,
            parameters: ShareFileSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ShareFileSchema>, _ctx: ToolContext) {
        const token = getToken(this.config);
        const permission: Record<string, unknown> = {
            role: input.role ?? 'reader',
            type: input.type ?? 'user',
        };
        if (input.email && (input.type === 'user' || input.type === 'group' || !input.type)) {
            permission['emailAddress'] = input.email;
        }
        const params = new URLSearchParams({
            sendNotificationEmail: String(input.sendNotification ?? true),
        });
        return driveRequest(token, 'POST', `/files/${input.fileId}/permissions`, permission, params);
    }
}

export class GoogleDriveToolkit {
    readonly listFiles: GoogleDriveListFilesTool;
    readonly getFile: GoogleDriveGetFileTool;
    readonly createFolder: GoogleDriveCreateFolderTool;
    readonly deleteFile: GoogleDriveDeleteFileTool;
    readonly moveFile: GoogleDriveMoveFileTool;
    readonly shareFile: GoogleDriveShareFileTool;

    constructor(config: GoogleDriveToolConfig = {}) {
        this.listFiles = new GoogleDriveListFilesTool(config);
        this.getFile = new GoogleDriveGetFileTool(config);
        this.createFolder = new GoogleDriveCreateFolderTool(config);
        this.deleteFile = new GoogleDriveDeleteFileTool(config);
        this.moveFile = new GoogleDriveMoveFileTool(config);
        this.shareFile = new GoogleDriveShareFileTool(config);
    }

    getTools() {
        return [this.listFiles, this.getFile, this.createFolder, this.deleteFile, this.moveFile, this.shareFile];
    }
}
