# Secret Manager

`createSecretManager()` provides a unified `getSecret(name, version?)` interface over five secret providers. All provider SDKs are loaded **lazily** — if you use only `env`, for example, none of the AWS/Azure/GCP packages are loaded.

```ts
import { createSecretManager } from 'confused-ai/config';
```

## Quick start

```ts
import { createSecretManager } from 'confused-ai/config';

// Reads from process.env (zero dependencies)
const secrets = createSecretManager({ provider: 'env' });

const dbPassword = await secrets.getSecret('DB_PASSWORD');
```

## Providers

### `env` — Environment variables

```ts
const secrets = createSecretManager({
  provider: 'env',
  prefix: 'APP_',  // optional — getSecret('KEY') reads process.env.APP_KEY
});

await secrets.getSecret('DB_PASSWORD'); // → process.env.APP_DB_PASSWORD
```

No peer dependencies. Default when you just want `process.env` with a unified interface.

---

### `aws` — AWS Secrets Manager

```ts
const secrets = createSecretManager({
  provider: 'aws',
  region: 'us-east-1',                          // default: AWS_DEFAULT_REGION env
  credentials: {                                // optional — defaults to AWS SDK chain
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken:    process.env.AWS_SESSION_TOKEN, // optional
  },
});

const value = await secrets.getSecret('prod/db/password');
// Retrieves by secret name/ARN; version supported via second arg
```

Peer dependency: `@aws-sdk/client-secrets-manager` (loaded lazily).

---

### `azure` — Azure Key Vault

```ts
const secrets = createSecretManager({
  provider: 'azure',
  vaultUrl: 'https://my-vault.vault.azure.net',
  credentials: {                                // optional — defaults to DefaultAzureCredential
    tenantId:     process.env.AZURE_TENANT_ID!,
    clientId:     process.env.AZURE_CLIENT_ID!,
    clientSecret: process.env.AZURE_CLIENT_SECRET!,
  },
});

const apiKey = await secrets.getSecret('OPENAI-API-KEY');
const oldKey = await secrets.getSecret('OPENAI-API-KEY', '2'); // specific version
```

Peer dependency: `@azure/keyvault-secrets` + `@azure/identity` (loaded lazily).

---

### `vault` — HashiCorp Vault

```ts
const secrets = createSecretManager({
  provider: 'vault',
  endpoint: 'http://vault.internal:8200', // default: VAULT_ADDR env or http://127.0.0.1:8200
  token:    process.env.VAULT_TOKEN,      // default: VAULT_TOKEN env
  mount:    'secret',                     // default: 'secret' (KV v2)
});

const cert = await secrets.getSecret('pki/tls-cert');
```

No peer dependencies (uses `fetch`).

---

### `gcp` — GCP Secret Manager

```ts
const secrets = createSecretManager({
  provider: 'gcp',
  projectId: 'my-gcp-project',  // default: GCLOUD_PROJECT or GOOGLE_CLOUD_PROJECT env
});

const key = await secrets.getSecret('stripe-api-key');
```

Peer dependency: `@google-cloud/secret-manager` (loaded lazily).

---

## `SecretManagerAdapter` interface

All providers implement the same interface:

```ts
interface SecretManagerAdapter {
  getSecret(name: string, version?: string): Promise<string>;
}
```

You can implement this interface to add your own provider:

```ts
import type { SecretManagerAdapter } from 'confused-ai/config';

class DbSecretAdapter implements SecretManagerAdapter {
  async getSecret(name: string) {
    const row = await db.query('SELECT value FROM secrets WHERE name = $1', [name]);
    return row.value;
  }
}
```

## Inject into agent startup

A common pattern — load secrets at startup and inject into the agent:

```ts
import { createSecretManager } from 'confused-ai/config';
import { createAgent }          from 'confused-ai';
import { OpenAIProvider }       from 'confused-ai/llm';

const secrets = createSecretManager({ provider: 'aws', region: 'us-east-1' });

const [openAiKey, dbPassword] = await Promise.all([
  secrets.getSecret('prod/openai-api-key'),
  secrets.getSecret('prod/db-password'),
]);

const llm = new OpenAIProvider({ apiKey: openAiKey, model: 'gpt-4o' });

const agent = createAgent({
  name: 'assistant',
  llm,
  instructions: '...',
});
```

## `createSecretManager()` options reference

| Provider | Required | Optional |
|----------|----------|----------|
| `env` | — | `prefix?: string` |
| `aws` | — | `region?`, `credentials?` |
| `azure` | `vaultUrl` | `credentials?` |
| `vault` | — | `endpoint?`, `token?`, `mount?` |
| `gcp` | — | `projectId?` |

All providers resolve credentials from standard environment variables when explicit credentials are omitted (`AWS_*`, `AZURE_*`, `VAULT_ADDR`, `VAULT_TOKEN`, `GCLOUD_PROJECT`, `GOOGLE_CLOUD_PROJECT`).
