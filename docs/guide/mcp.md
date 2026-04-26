# MCP Client

Connect any Model Context Protocol (MCP) server to your agents. All MCP tools become first-class participants in the agent's tool loop.

## Quick start

```ts
import { McpClient } from 'confused-ai/orchestration';
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
import { createHttpA2AClient } from 'confused-ai/orchestration';

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
import type { A2AClient, A2AMessage } from 'confused-ai/orchestration';

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
