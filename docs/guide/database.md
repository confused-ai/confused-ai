# Database Tools

confused-ai ships production-ready database tools for PostgreSQL, MySQL, SQLite, Redis, and CSV out of the box.

## PostgreSQL

```ts
import { postgresQueryTool, postgresExecuteTool } from 'confused-ai/tools';

// Query
const query = postgresQueryTool({
  connectionString: process.env.DATABASE_URL!,
});

// Execute (INSERT/UPDATE/DELETE)
const execute = postgresExecuteTool({
  connectionString: process.env.DATABASE_URL!,
});

const dbAgent = agent({
  model: 'gpt-4o',
  instructions: `
    You are a database assistant. Use the tools to query and modify the database.
    Always use parameterized queries. Never expose sensitive data.
  `,
  tools: [query, execute],
});

const result = await dbAgent.run('How many users signed up this week?');
```

## MySQL

```ts
import { mysqlQueryTool, mysqlExecuteTool } from 'confused-ai/tools';

const query = mysqlQueryTool({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: process.env.MYSQL_PASSWORD!,
  database: 'mydb',
});
```

## SQLite

Great for local development, embedded agents, and CLI tools:

```ts
import { sqliteQueryTool, sqliteExecuteTool } from 'confused-ai/tools';

const query = sqliteQueryTool({ dbPath: './data/app.db' });
const execute = sqliteExecuteTool({ dbPath: './data/app.db' });
```

## Redis

```ts
import { redisGetTool, redisSetTool, redisDelTool, redisScanTool } from 'confused-ai/tools';

const config = { url: 'redis://localhost:6379' };
const get = redisGetTool(config);
const set = redisSetTool(config);
const del = redisDelTool(config);
const scan = redisScanTool(config);
```

## CSV

Read, write, and query CSV files:

```ts
import { csvReadTool, csvWriteTool, csvQueryTool } from 'confused-ai/tools';

const read = csvReadTool();
const write = csvWriteTool();
const query = csvQueryTool(); // SQL-like queries on CSV data
```

## Security notes

::: warning
- Always use parameterized queries (all built-in tools do this by default)
- Scope database credentials to the minimum necessary permissions
- Consider using `.approval(true)` on execute/write tools to require human confirmation
- Never log raw query results that may contain PII
:::

## Example: AI-powered data analysis agent

```ts
import {
  postgresQueryTool,
  csvReadTool,
  jsonQueryTool,
} from 'confused-ai/tools';
import { agent } from 'confused-ai';

const dataAgent = agent({
  model: 'gpt-4o',
  instructions: `
    You are a data analyst. Use the available tools to:
    1. Query the database for relevant data
    2. Read CSV files when needed
    3. Provide clear insights with numbers
    Always explain your methodology.
  `,
  tools: [
    postgresQueryTool({ connectionString: process.env.DATABASE_URL! }),
    csvReadTool(),
    jsonQueryTool(),
  ],
});

const analysis = await dataAgent.run(
  'Compare our monthly revenue for Q1 vs Q2 this year and identify the top 3 growth drivers.'
);
console.log(analysis.text);
```
