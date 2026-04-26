/**
 * Docker tools — manage containers, images, and services via Docker Engine REST API.
 * Requires Docker Engine with TCP or Unix socket access.
 * Docs: https://docs.docker.com/engine/api/v1.47/
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface DockerToolConfig {
    /** Docker host URL (or DOCKER_HOST env var). Default: http://localhost:2375 */
    host?: string;
    /** API version (default: v1.47) */
    apiVersion?: string;
}

function getHost(config: DockerToolConfig): string {
    const host = config.host ?? process.env.DOCKER_HOST ?? 'http://localhost:2375';
    const version = config.apiVersion ?? 'v1.47';
    return `${host.replace(/\/$/, '')}/${version}`;
}

async function dockerRequest(baseUrl: string, method: string, path: string, body?: object): Promise<unknown> {
    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Docker API ${res.status}: ${await res.text()}`);
    const text = await res.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return text; }
}

// ── Schemas ────────────────────────────────────────────────────────────────

const ListContainersSchema = z.object({
    all: z.boolean().optional().default(false).describe('Show all containers (default: running only)'),
    limit: z.number().int().optional().describe('Maximum number of containers to return'),
    filters: z.record(z.string(), z.array(z.string())).optional().describe('Filter containers (e.g. {status: ["running"]})'),
});

const GetContainerSchema = z.object({
    containerId: z.string().describe('Container ID or name'),
});

const CreateContainerSchema = z.object({
    image: z.string().describe('Docker image to use (e.g. "ubuntu:22.04", "nginx:latest")'),
    name: z.string().optional().describe('Container name'),
    cmd: z.array(z.string()).optional().describe('Command to run in container'),
    env: z.array(z.string()).optional().describe('Environment variables ["KEY=VALUE", ...]'),
    ports: z.record(z.string(), z.object({ hostPort: z.string(), hostIp: z.string().optional() })).optional()
        .describe('Port mappings {"containerPort/protocol": {hostPort}}'),
    volumes: z.array(z.string()).optional().describe('Volume mounts ["host:container[:mode]"]'),
    workingDir: z.string().optional().describe('Working directory inside container'),
    autoRemove: z.boolean().optional().default(false).describe('Automatically remove container when it exits'),
    detach: z.boolean().optional().default(true).describe('Run in detached mode (background)'),
    memory: z.number().int().optional().describe('Memory limit in bytes'),
    cpuShares: z.number().int().optional().describe('CPU shares (relative weight)'),
});

const ListImagesSchema = z.object({
    all: z.boolean().optional().default(false).describe('Show all images including intermediates'),
    filters: z.record(z.string(), z.array(z.string())).optional(),
});

const ContainerLogsSchema = z.object({
    containerId: z.string(),
    stdout: z.boolean().optional().default(true),
    stderr: z.boolean().optional().default(true),
    tail: z.number().int().optional().default(100).describe('Number of lines to return from end of logs'),
    timestamps: z.boolean().optional().default(false),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class DockerListContainersTool extends BaseTool<typeof ListContainersSchema> {
    constructor(private config: DockerToolConfig = {}) {
        super({
            id: 'docker_list_containers',
            name: 'Docker List Containers',
            description: 'List Docker containers (running by default, or all with all=true).',
            category: ToolCategory.UTILITY,
            parameters: ListContainersSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ListContainersSchema>, _ctx: ToolContext) {
        const base = getHost(this.config);
        const params = new URLSearchParams({ all: String(input.all ?? false) });
        if (input.limit) params.set('limit', String(input.limit));
        if (input.filters) params.set('filters', JSON.stringify(input.filters));
        return dockerRequest(base, 'GET', `/containers/json?${params}`);
    }
}

export class DockerGetContainerTool extends BaseTool<typeof GetContainerSchema> {
    constructor(private config: DockerToolConfig = {}) {
        super({
            id: 'docker_get_container',
            name: 'Docker Get Container',
            description: 'Get detailed information about a Docker container.',
            category: ToolCategory.UTILITY,
            parameters: GetContainerSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetContainerSchema>, _ctx: ToolContext) {
        return dockerRequest(getHost(this.config), 'GET', `/containers/${input.containerId}/json`);
    }
}

export class DockerStartContainerTool extends BaseTool<typeof GetContainerSchema> {
    constructor(private config: DockerToolConfig = {}) {
        super({
            id: 'docker_start_container',
            name: 'Docker Start Container',
            description: 'Start a stopped Docker container.',
            category: ToolCategory.UTILITY,
            parameters: GetContainerSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetContainerSchema>, _ctx: ToolContext) {
        return dockerRequest(getHost(this.config), 'POST', `/containers/${input.containerId}/start`);
    }
}

export class DockerStopContainerTool extends BaseTool<typeof GetContainerSchema & { t?: number }> {
    private stopSchema = GetContainerSchema.extend({ t: z.number().int().optional().default(10).describe('Seconds to wait before killing') });

    constructor(private config: DockerToolConfig = {}) {
        super({
            id: 'docker_stop_container',
            name: 'Docker Stop Container',
            description: 'Stop a running Docker container.',
            category: ToolCategory.UTILITY,
            parameters: GetContainerSchema.extend({ t: z.number().int().optional().default(10) }),
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof DockerStopContainerTool.prototype.stopSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({ t: String(input.t ?? 10) });
        return dockerRequest(getHost(this.config), 'POST', `/containers/${input.containerId}/stop?${params}`);
    }
}

export class DockerCreateContainerTool extends BaseTool<typeof CreateContainerSchema> {
    constructor(private config: DockerToolConfig = {}) {
        super({
            id: 'docker_create_container',
            name: 'Docker Create Container',
            description: 'Create a Docker container from an image.',
            category: ToolCategory.UTILITY,
            parameters: CreateContainerSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CreateContainerSchema>, _ctx: ToolContext) {
        const base = getHost(this.config);
        const params = input.name ? `?name=${encodeURIComponent(input.name)}` : '';
        const portBindings: Record<string, Array<{ HostPort: string; HostIp?: string }>> = {};
        const exposedPorts: Record<string, object> = {};
        if (input.ports) {
            for (const [containerPort, binding] of Object.entries(input.ports) as Array<[string, { hostPort: string; hostIp?: string }]>) {
                portBindings[containerPort] = [{ HostPort: binding.hostPort, HostIp: binding.hostIp }];
                exposedPorts[containerPort] = {};
            }
        }

        return dockerRequest(base, 'POST', `/containers/create${params}`, {
            Image: input.image,
            Cmd: input.cmd,
            Env: input.env,
            WorkingDir: input.workingDir,
            ExposedPorts: exposedPorts,
            HostConfig: {
                PortBindings: portBindings,
                Binds: input.volumes,
                AutoRemove: input.autoRemove ?? false,
                Memory: input.memory,
                CpuShares: input.cpuShares,
            },
        });
    }
}

export class DockerListImagesTool extends BaseTool<typeof ListImagesSchema> {
    constructor(private config: DockerToolConfig = {}) {
        super({
            id: 'docker_list_images',
            name: 'Docker List Images',
            description: 'List Docker images available locally.',
            category: ToolCategory.UTILITY,
            parameters: ListImagesSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ListImagesSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({ all: String(input.all ?? false) });
        if (input.filters) params.set('filters', JSON.stringify(input.filters));
        return dockerRequest(getHost(this.config), 'GET', `/images/json?${params}`);
    }
}

export class DockerContainerLogsTool extends BaseTool<typeof ContainerLogsSchema> {
    constructor(private config: DockerToolConfig = {}) {
        super({
            id: 'docker_container_logs',
            name: 'Docker Container Logs',
            description: 'Get logs from a Docker container.',
            category: ToolCategory.UTILITY,
            parameters: ContainerLogsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ContainerLogsSchema>, _ctx: ToolContext) {
        const params = new URLSearchParams({
            stdout: String(input.stdout ?? true),
            stderr: String(input.stderr ?? true),
            tail: String(input.tail ?? 100),
            timestamps: String(input.timestamps ?? false),
        });
        const base = getHost(this.config);
        const res = await fetch(`${base}/containers/${input.containerId}/logs?${params}`);
        if (!res.ok) throw new Error(`Docker API ${res.status}: ${await res.text()}`);
        return { logs: await res.text() };
    }
}

export class DockerToolkit {
    readonly listContainers: DockerListContainersTool;
    readonly getContainer: DockerGetContainerTool;
    readonly startContainer: DockerStartContainerTool;
    readonly stopContainer: DockerStopContainerTool;
    readonly createContainer: DockerCreateContainerTool;
    readonly listImages: DockerListImagesTool;
    readonly containerLogs: DockerContainerLogsTool;

    constructor(config: DockerToolConfig = {}) {
        this.listContainers = new DockerListContainersTool(config);
        this.getContainer = new DockerGetContainerTool(config);
        this.startContainer = new DockerStartContainerTool(config);
        this.stopContainer = new DockerStopContainerTool(config);
        this.createContainer = new DockerCreateContainerTool(config);
        this.listImages = new DockerListImagesTool(config);
        this.containerLogs = new DockerContainerLogsTool(config);
    }

    getTools() {
        return [this.listContainers, this.getContainer, this.startContainer, this.stopContainer,
            this.createContainer, this.listImages, this.containerLogs];
    }
}
