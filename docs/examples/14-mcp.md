# 14 · MCP Filesystem Agent 🔴

MCP (Model Context Protocol) lets agents use tools provided by external servers.
This means your agent can work with any MCP-compatible tool — filesystems, Git,
databases, Slack, GitHub — without you writing a single tool function.

## What you'll learn

- What MCP is and how it works
- How to connect to an MCP server
- How to use MCP tools inside an agent
- Run the official `@modelcontextprotocol/server-filesystem` example

## What is MCP?

MCP is an open standard (by Anthropic) for connecting AI agents to data sources
and tools. Instead of building a custom tool for every API, MCP server providers
expose a standard interface that any MCP-compatible agent can use.

```
Agent (confused-ai)
     ↓  (MCP protocol over stdio/HTTP)
MCP Server (e.g., filesystem, github, postgres)
     ↓
Real system (files, repos, databases)
```

## Setup

```bash
# Install the official filesystem MCP server
npm install -g @modelcontextprotocol/server-filesystem

# Install confused-ai MCP client support
npm install confused-ai
```

## Code

```ts
// mcp-agent.ts
import { createAgent } from 'confused-ai';
import { MCPClient } from 'confused-ai/orchestration';

// ── Connect to MCP server ──────────────────────────────────────────────────
const filesystem = new MCPClient({
  name: 'filesystem',
  transport: 'stdio',
  command: 'npx',
  args: [
    '-y',
    '@modelcontextprotocol/server-filesystem',
    '/tmp/agent-workspace',   // root directory the agent can access
  ],
});

// Start the MCP server
await filesystem.connect();

// Discover available tools
const tools = await filesystem.listTools();
console.log('Available MCP tools:', tools.map(t => t.name));
// → ['read_file', 'write_file', 'list_directory', 'create_directory', 'delete_file', ...]

// ── Create agent with MCP tools ────────────────────────────────────────────
const agent = createAgent({
  name: 'file-agent',
  model: 'gpt-4o',
  instructions: `
    You are a file management assistant.
    You can read, write, list, and organize files in /tmp/agent-workspace.
    Always confirm before deleting files.
    When writing code files, use proper formatting and comments.
  `,
  tools: await filesystem.getFrameworkTools(),  // ← all MCP tools as framework tools
});

// ── Work with files ────────────────────────────────────────────────────────
// Create a project structure
const r1 = await agent.run('Create a new folder called "my-project" with a README.md that explains this is a demo project.');
console.log(r1.text);

// Write code
const r2 = await agent.run('Write a TypeScript hello world file in my-project/src/index.ts');
console.log(r2.text);

// Read and summarize
const r3 = await agent.run('List all files in my-project and summarize what each one does.');
console.log(r3.text);

// Cleanup
await filesystem.disconnect();
```

## Multiple MCP servers

Combine tools from multiple MCP servers:

```ts
// File system + GitHub + PostgreSQL — all via MCP
const filesystemMCP = new MCPClient({
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'],
});

const githubMCP = new MCPClient({
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN! },
});

const postgresMCP = new MCPClient({
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-postgres', process.env.DATABASE_URL!],
});

await Promise.all([filesystemMCP.connect(), githubMCP.connect(), postgresMCP.connect()]);

const tools = [
  ...await filesystemMCP.getFrameworkTools(),
  ...await githubMCP.getFrameworkTools(),
  ...await postgresMCP.getFrameworkTools(),
];

const superAgent = createAgent({
  model: 'gpt-4o',
  instructions: 'You can work with files, GitHub repos, and a PostgreSQL database.',
  tools,
});

// "Read the schema from the database and create a TypeScript types file on disk"
const result = await superAgent.run(
  'Query the users table schema from the database and write a TypeScript interface file to /workspace/types/users.ts'
);
```

## Connect over HTTP (remote MCP servers)

```ts
const remoteMCP = new MCPClient({
  transport: 'http',
  url: 'https://mcp.example.com/server',
  headers: {
    Authorization: `Bearer ${process.env.MCP_API_KEY}`,
  },
});
```

## Build your own MCP server

Expose any tool as an MCP server (other agents can then use it):

```ts
import { MCPServer } from 'confused-ai/orchestration';
import { z } from 'zod';

const server = new MCPServer({ name: 'my-tools', version: '1.0.0' });

server.addTool({
  name: 'generateReport',
  description: 'Generate a formatted business report',
  parameters: z.object({
    data: z.record(z.unknown()),
    format: z.enum(['pdf', 'markdown', 'html']),
  }),
  execute: async ({ data, format }) => {
    // ... generate report
    return { content: '...', path: `/reports/report.${format}` };
  },
});

// Start the MCP server on stdio (for use by any MCP client)
await server.start({ transport: 'stdio' });
```

## Available MCP servers (official)

| Server | What it does |
|---|---|
| `@modelcontextprotocol/server-filesystem` | Read/write local files |
| `@modelcontextprotocol/server-github` | GitHub repos, issues, PRs |
| `@modelcontextprotocol/server-postgres` | PostgreSQL queries |
| `@modelcontextprotocol/server-sqlite` | SQLite queries |
| `@modelcontextprotocol/server-slack` | Read/send Slack messages |
| `@modelcontextprotocol/server-brave-search` | Web search via Brave |
| `@modelcontextprotocol/server-google-drive` | Google Drive files |

Find more at [modelcontextprotocol.io](https://modelcontextprotocol.io)

## What's next?

- [15 · Full-Stack App](./15-full-stack) — combine everything into a complete application
