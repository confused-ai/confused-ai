---
title: MCP Client
description: Connect any MCP server (stdio or HTTP) to your agents. All MCP tools become first-class tool-loop participants.
outline: [2, 3]
---

# MCP Client

The `McpClient` connects any [Model Context Protocol](https://modelcontextprotocol.io) server to your agents. All MCP tools become first-class participants in the agent's tool loop — Zod-validated, approval-gateable, observable.

| Transport | When to use |
|-----------|-------------|
| `stdio` | Local CLI tools, development |
| `http` / `sse` | Remote servers, production services |

---

## Quick start — stdio

```ts
import { McpClient } from 'confused-ai/workflow';
import { agent }     from 'confused-ai';

const mcp = new McpClient({
  transport: 'stdio',
  command:   'npx',
  args:      ['-y', '@modelcontextprotocol/server-filesystem', '/tmp/sandbox'],
});

await mcp.connect();
const tools = await mcp.getFrameworkTools();

const ai = agent({
  model:        'gpt-4o',
  instructions: 'You have access to a sandboxed filesystem.',
  tools,
});

await ai.run('Create a file /tmp/sandbox/hello.txt with content "Hello, world!"');
await mcp.disconnect();
```

---

## HTTP / SSE transport

```ts
const mcp = new McpClient({
  transport: 'http',
  url:       'https://mcp.example.com/sse',
  headers:   { Authorization: `Bearer ${process.env.MCP_API_KEY}` },
});

await mcp.connect();
const tools = await mcp.getFrameworkTools();
```

---

## Tool discovery and filtering

```ts
// List all tools on the server
const allTools = await mcp.listTools();
console.log(allTools.map(t => t.name));

// Filter to only the tools you need
const filtered = await mcp.getFrameworkTools({
  include: ['read_file', 'write_file', 'list_directory'],
});

// Exclude dangerous tools
const safe = await mcp.getFrameworkTools({
  exclude: ['delete_file', 'execute_command'],
});
```

---

## Multiple MCP servers

Aggregate tools from several MCP servers:

```ts
import { McpClient } from 'confused-ai/workflow';

const mcpFS = new McpClient({
  transport: 'stdio',
  command:   'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'],
});

const mcpGit = new McpClient({
  transport: 'stdio',
  command:   'npx', args: ['-y', '@modelcontextprotocol/server-github'],
  env:       { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN! },
});

await Promise.all([mcpFS.connect(), mcpGit.connect()]);

const ai = agent({
  model: 'gpt-4o',
  tools: [
    ...(await mcpFS.getFrameworkTools()),
    ...(await mcpGit.getFrameworkTools()),
  ],
});

await ai.run('List open issues in my repo and save a summary to /workspace/issues.md');

await Promise.all([mcpFS.disconnect(), mcpGit.disconnect()]);
```

---

## Popular MCP servers

| Server | npm package | Tools |
|--------|-------------|-------|
| Filesystem | `@modelcontextprotocol/server-filesystem` | read_file, write_file, list_dir |
| GitHub | `@modelcontextprotocol/server-github` | Issues, PRs, code search |
| PostgreSQL | `@modelcontextprotocol/server-postgres` | SQL queries |
| Brave Search | `@modelcontextprotocol/server-brave-search` | Web search |
| Google Drive | `@modelcontextprotocol/server-gdrive` | Files, docs, sheets |
| Slack | `@modelcontextprotocol/server-slack` | Messages, channels |
| Puppeteer | `@modelcontextprotocol/server-puppeteer` | Browser automation |
| Memory | `@modelcontextprotocol/server-memory` | Knowledge graph |

---

## A2A — Agent-to-Agent protocol

Call agents hosted on external services via the [Google A2A spec](https://google.github.io/A2A/):

```ts
import { createHttpA2AClient } from 'confused-ai/workflow';

const a2a = createHttpA2AClient({
  baseUrl: 'https://agents.example.com/a2a',
  headers: { Authorization: `Bearer ${process.env.A2A_TOKEN}` },
});

// Discover remote agent capabilities
const card = await a2a.getAgentCard('summariser');
console.log(card.capabilities);

// Send a task
const reply = await a2a.send({
  from:    'my-agent',
  to:      'summariser',
  type:    'request',
  payload: { task: 'Summarise this document', text: longDoc },
});

console.log(reply.payload.summary);
```

## Quick start

```ts
import { McpClient } from 'confused-ai/workflow';
import { agent } from 'confused-ai';

// Connect to an MCP server
const mcp = new McpClient({
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir'],
});

await mcp.connect();

// List available tools
const tools = await mcp.listTools();
console.log(tools.map(t => t.name));

// Use MCP tools in an agent
const myAgent = agent({
  model: 'gpt-4o',
  instructions: 'You can browse and read files.',
  tools: mcp.getFrameworkTools(), // all MCP tools as framework tools
});

const result = await myAgent.run('List all TypeScript files in the project');
await mcp.disconnect();
```

## Transport options

### stdio (local processes)

```ts
const mcp = new McpClient({
  transport: 'stdio',
  command: 'node',
  args: ['./my-mcp-server.js'],
  env: { MY_API_KEY: process.env.MY_API_KEY! },
});
```

### HTTP / SSE (remote servers)

```ts
const mcp = new McpClient({
  transport: 'http',
  url: 'https://my-mcp-server.example.com',
  headers: { 'Authorization': `Bearer ${process.env.MCP_TOKEN}` },
});
```

## Filtering tools

Only expose specific MCP tools to your agent:

```ts
const tools = mcp.getFrameworkTools({
  include: ['read_file', 'list_directory', 'search_files'],
  // or:
  exclude: ['write_file', 'delete_file'],
});
```

## Multiple MCP servers

```ts
const fileMcp = new McpClient({ transport: 'stdio', command: 'npx', args: ['-y', '@mcp/filesystem', '/'] });
const gitMcp = new McpClient({ transport: 'stdio', command: 'npx', args: ['-y', '@mcp/git'] });
const webMcp = new McpClient({ transport: 'http', url: 'https://mcp.browse.dev' });

await Promise.all([fileMcp.connect(), gitMcp.connect(), webMcp.connect()]);

const devAgent = agent({
  model: 'gpt-4o',
  instructions: 'You are a software development assistant.',
  tools: [
    ...fileMcp.getFrameworkTools(),
    ...gitMcp.getFrameworkTools(),
    ...webMcp.getFrameworkTools(),
  ],
});
```

## Popular MCP servers

| Server | Package | Capabilities |
|--------|---------|-------------|
| Filesystem | `@modelcontextprotocol/server-filesystem` | Read/write files |
| Git | `@modelcontextprotocol/server-git` | Git operations |
| GitHub | `@modelcontextprotocol/server-github` | Issues, PRs, repos |
| SQLite | `@modelcontextprotocol/server-sqlite` | Database queries |
| Browser | `@automatalabs/mcp-server-playwright` | Web browsing |
| Memory | `@modelcontextprotocol/server-memory` | Knowledge graph |
| Search | `@modelcontextprotocol/server-brave-search` | Web search |

## A2A (Agent-to-Agent)

The framework ships a lightweight outbound client for the [Google A2A spec](https://google.github.io/A2A/) — useful when your agents need to call agents hosted on other services.

```ts
import { createHttpA2AClient } from 'confused-ai/workflow';

const a2a = createHttpA2AClient({
  baseUrl: 'https://broker.example.com/a2a',
});

// Send a task to a remote agent
const reply = await a2a.send({
  from: 'my-agent',
  to: 'remote-agent',
  type: 'request',
  payload: { task: 'Summarise this document', doc: '...' },
});

console.log(reply.payload);
```

### What's included

| | |
|---|---|
| `send()` | POST to `{baseUrl}/send` — full implementation |
| `subscribe()` | Returns an unsubscribe function — **stub only** |

`subscribe` is intentionally a no-op stub. Inbound delivery (push notifications, SSE streams, WebSocket) requires broker-side infrastructure that you operate. Implement your own subscribe transport when you need it:

```ts
import type { A2AClient, A2AMessage } from 'confused-ai/workflow';

class MyPollingA2AClient implements A2AClient {
  async send(msg) { /* ... */ }

  subscribe(agentId, handler) {
    const timer = setInterval(async () => {
      const res = await fetch(`/a2a/poll/${agentId}`);
      const { messages } = await res.json();
      for (const m of messages) await handler(m);
    }, 2000);
    return () => clearInterval(timer);
  }
}
```

### Internal multi-agent patterns

If your agents run inside the same process, use the framework's built-in orchestration instead — it's faster and fully integrated:

- **Handoff** — agent delegates to another mid-conversation
- **Swarm / Team / Supervisor** — parallel and hierarchical coordination
- **MessageBus** — decoupled pub/sub between agents

See [Orchestration](/guide/orchestration).
