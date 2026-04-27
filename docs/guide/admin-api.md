# Admin API

The built-in Admin API exposes a set of management endpoints for monitoring agents, inspecting audit logs, listing pending HITL approvals, and querying live statistics — all secured behind a bearer token.

## Enable

```ts
import { createHttpService, listenService } from 'confused-ai/serve';

const service = createHttpService({
  agents: { assistant },
  adminApi: {
    enabled:     true,
    prefix:      '/admin',        // default — all endpoints live under this prefix
    bearerToken: process.env.ADMIN_TOKEN!, // required; omitting logs a security warning
  },
});

await listenService(service, 3000);
```

::: warning Bearer token is required
If `bearerToken` is omitted, the Admin API starts but logs a warning. Always provide a token in production.
:::

All admin requests must include:

```http
Authorization: Bearer <your-admin-token>
```

## Endpoints

All endpoints live under the configured `prefix` (default `/admin`).

### `GET /admin/health`

Deep health check — process uptime, memory usage, and readiness:

```json
{
  "status": "ok",
  "uptime": 3612.4,
  "memoryMb": 42.3,
  "agents": ["assistant", "coder"]
}
```

### `GET /admin/agents`

List all registered agents and their metadata:

```json
[
  { "name": "assistant", "instructions": "You are a helpful assistant.", "toolCount": 5 },
  { "name": "coder", "instructions": "You write TypeScript code.", "toolCount": 2 }
]
```

### `GET /admin/audit?limit=50&agentName=assistant&userId=user-42`

Paginated audit log. Supports query parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max entries to return (default: 50) |
| `agentName` | string | Filter by agent |
| `userId` | string | Filter by user |
| `since` | ISO 8601 | Only entries after this timestamp |

Requires an `auditStore` to be configured on the service (see [Audit Log](./production.md#audit-log)):

```ts
const service = createHttpService({
  agents: { assistant },
  auditStore: createSqliteAuditStore('./agent.db'),
  adminApi: { enabled: true, bearerToken: process.env.ADMIN_TOKEN! },
});
```

### `GET /admin/sessions`

List all active sessions (requires a `sessionStore` with a listing capability):

```json
[
  { "sessionId": "sess-abc", "userId": "user-42", "messageCount": 12 },
  { "sessionId": "sess-xyz", "userId": "user-99", "messageCount": 3 }
]
```

### `GET /admin/approvals`

List pending HITL approval requests (requires `approvalStore`):

```json
[
  {
    "id": "approval-001",
    "agentName": "assistant",
    "toolName": "send_email",
    "args": { "to": "ceo@example.com", "subject": "Q1 Report" },
    "createdAt": "2026-04-27T10:00:00Z"
  }
]
```

### `GET /admin/checkpoints`

List active resumable run checkpoints (requires `checkpointStore`):

```json
[
  {
    "runId": "batch-job-001",
    "step": 42,
    "savedAt": "2026-04-27T09:55:00Z"
  }
]
```

### `GET /admin/stats`

Live throughput and error statistics:

```json
{
  "totalRequests": 1423,
  "totalErrors": 12,
  "totalTokens": 4820000
}
```

## Full example with all optional stores

```ts
import { createHttpService, listenService } from 'confused-ai/serve';
import {
  createSqliteAuditStore,
  createSqliteCheckpointStore,
} from 'confused-ai/guard';

const service = createHttpService({
  agents: { assistant },

  // Stores make the corresponding admin endpoints useful
  auditStore:       createSqliteAuditStore('./agent.db'),
  checkpointStore:  createSqliteCheckpointStore('./agent.db'),

  adminApi: {
    enabled:     true,
    prefix:      '/admin',
    bearerToken: process.env.ADMIN_TOKEN!,
  },
});

await listenService(service, 3000);
```

## `AdminApiOptions` reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable the admin endpoint group |
| `prefix` | `string` | `'/admin'` | URL prefix for all admin endpoints |
| `bearerToken` | `string` | — | Required auth token; omit only for dev |
| `auditStore` | `AuditStore` | — | Enables `/admin/audit` |
| `checkpointStore` | `AgentCheckpointStore` | — | Enables `/admin/checkpoints` |

## Securing the admin prefix in production

For production, place the admin endpoints behind a network boundary (internal VPC, bastion host) in addition to the bearer token:

```ts
// Nginx example — proxy /admin only from internal IPs
// location /admin {
//   allow 10.0.0.0/8;
//   deny  all;
//   proxy_pass http://localhost:3000;
// }
```
