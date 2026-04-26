# WebSocket Transport

`attachWebSocketTransport()` adds a real-time bidirectional WebSocket interface to any `createHttpService()` HTTP server. Clients stream tokens as they are produced and send multi-agent chat messages over a single persistent connection.

## Setup

```ts
import { createServer }              from 'node:http';
import { createHttpService }         from 'fluxion/runtime';
import { attachWebSocketTransport }  from 'fluxion/runtime';
import { createAgent }               from 'fluxion';

const assistant = createAgent({ name: 'assistant', llm, instructions: 'You are a helpful assistant.' });
const coder     = createAgent({ name: 'coder',     llm, instructions: 'You write TypeScript code.' });

// Create the HTTP service as usual
const service = createHttpService({ agents: { assistant, coder } });

// Attach WebSocket on the same port — no extra port needed
attachWebSocketTransport(service.server, { assistant, coder });

service.listen(3000);
console.log('HTTP + WebSocket on :3000');
```

::: tip One server, two protocols
`attachWebSocketTransport` shares the same `http.Server` as `createHttpService`. HTTP (`/v1/chat/:agent`) and WebSocket (`ws://host/`) coexist on the same port.
:::

## Wire protocol

All messages are JSON-serialized strings.

### Client → server

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"chat"` | ✓ | Message type |
| `message` | `string` | ✓ | The user prompt |
| `agent` | `string` | — | Agent name; defaults to the first registered agent |
| `sessionId` | `string` | — | Session ID for conversation continuity |
| `userId` | `string` | — | User ID for per-user budget enforcement |

```json
{ "type": "chat", "message": "Explain async/await", "agent": "coder", "sessionId": "sess-abc" }
```

### Server → client

| `type` | Payload | Description |
|--------|---------|-------------|
| `chunk` | `{ text: string }` | Streaming token fragment |
| `tool_call` | `{ name: string, args: object }` | Agent is calling a tool |
| `tool_result` | `{ name: string, result: object }` | Tool execution result |
| `done` | `{ text: string, steps: number, finishReason: string }` | Run complete |
| `error` | `{ message: string }` | Run failed |
| `ping` | — | Keepalive; sent every 30 s |

## Browser client

```ts
class AgentSocket {
  private ws: WebSocket;

  constructor(url: string) {
    this.ws = new WebSocket(url);

    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data) as Record<string, unknown>;

      switch (msg.type) {
        case 'chunk':
          process.stdout.write(msg.text as string); // or update UI
          break;
        case 'tool_call':
          console.log(`[tool] ${msg.name}`, msg.args);
          break;
        case 'done':
          console.log('\n[done]', msg.finishReason, `(${msg.steps} steps)`);
          break;
        case 'error':
          console.error('[error]', msg.message);
          break;
      }
    };

    this.ws.onclose  = () => setTimeout(() => this.reconnect(url), 2000);
    this.ws.onerror  = (e) => console.error('[ws error]', e);
  }

  send(message: string, opts: { agent?: string; sessionId?: string } = {}) {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'chat', message, ...opts }));
  }

  private reconnect(url: string) {
    this.ws = new WebSocket(url);
  }
}

const socket = new AgentSocket('ws://localhost:3000');

// Ask a question to a specific agent with session
socket.send('Write a fibonacci function', { agent: 'coder', sessionId: 'my-session' });
```

## Node.js client (e.g. inter-service)

```ts
import { WebSocket } from 'ws'; // npm i ws

const ws = new WebSocket('ws://agent-service:3000');

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'chat', message: 'Summarise the daily report', agent: 'assistant' }));
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === 'done') {
    console.log(msg.text);
    ws.close();
  }
});
```

## Multi-agent routing

The `agent` field in the chat message selects which registered agent handles the request. If omitted, the first agent in the `agents` map is used.

```ts
attachWebSocketTransport(server, {
  assistant,  // selected by: { "type": "chat", "message": "...", "agent": "assistant" }
  coder,      // selected by: { "type": "chat", "message": "...", "agent": "coder" }
  analyst,    // selected by: { "type": "chat", "message": "...", "agent": "analyst" }
});
```

## `attachWebSocketTransport()` API

```ts
function attachWebSocketTransport(
  server: import('node:http').Server,
  agents: Record<string, CreateAgentResult>,
): void;
```

::: info No extra dependencies
`attachWebSocketTransport` uses the Node.js built-in `node:http` upgrade mechanism — no `ws` package or other peer dependency is required server-side.
:::
