# 02 · First Custom Tool 🟢

Give your agent the ability to fetch live weather data. This is the core pattern
for connecting agents to any external API, database, or service.

## What you'll learn

- How to create a tool with `tool()`
- How to define input parameters with Zod
- How to attach tools to an agent
- How the agent decides when to call a tool

## Code

```ts
// weather-agent.ts
import { z } from 'zod';
import { createAgent, tool } from 'confused-ai';

// ── 1. Define the tool ─────────────────────────────────────────────────────
const getWeather = tool({
  name: 'getWeather',
  description: 'Get the current weather for a city. Use this when the user asks about weather.',
  
  // Zod schema = what the AI must provide to call this tool
  parameters: z.object({
    city:    z.string().describe('The city name, e.g. "London"'),
    country: z.string().optional().describe('ISO country code, e.g. "GB"'),
  }),

  // execute() runs when the AI calls the tool
  execute: async ({ city, country }) => {
    // In a real app, call a weather API like OpenWeatherMap
    // For this example we simulate a response
    const location = country ? `${city}, ${country}` : city;
    return {
      location,
      temperature: 22,
      unit: 'Celsius',
      condition: 'Partly cloudy',
      humidity: 65,
    };
  },
});

// ── 2. Create the agent ────────────────────────────────────────────────────
const agent = createAgent({
  name: 'weather-agent',
  model: 'gpt-4o-mini',
  instructions: `
    You are a helpful weather assistant.
    Always use the getWeather tool when the user asks about weather.
    Report temperatures in Celsius.
  `,
  tools: [getWeather],  // ✅ pass tool() results directly — no .toFrameworkTool() needed
});

// ── 3. Ask about the weather ───────────────────────────────────────────────
const result = await agent.run("What's the weather like in Tokyo right now?");
console.log(result.text);
// → "The weather in Tokyo is currently 22°C and partly cloudy with 65% humidity."
```

## How it works

```
User: "What's the weather in Tokyo?"
       ↓
  Agent decides: "I need to call getWeather"
       ↓
  Tool runs → returns { temperature: 22, condition: 'Partly cloudy', ... }
       ↓
  Agent formats the data into a human-readable reply
       ↓
User: "The weather in Tokyo is currently 22°C..."
```

## Connect a real weather API

```ts
execute: async ({ city, country }) => {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  const query = country ? `${city},${country}` : city;
  const res = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?q=${query}&appid=${apiKey}&units=metric`
  );
  const data = await res.json();
  return {
    location: data.name,
    temperature: data.main.temp,
    condition: data.weather[0].description,
    humidity: data.main.humidity,
  };
},
```

## Multiple tools

Agents can have many tools. The AI picks the right one automatically:

```ts
const agent = createAgent({
  tools: [getWeather, getTime, getNews],
});
```

## Fluent builder style

Prefer a more structured API? Use `defineTool()`:

```ts
import { defineTool } from 'confused-ai';

const getWeather = defineTool()
  .name('getWeather')
  .description('Get current weather for a city')
  .parameters(z.object({ city: z.string() }))
  .execute(async ({ city }) => ({ city, temp: 22 }))
  .build();
```

## What's next?

- [03 · Tool with Approval](./03-approval-tool) — require human confirmation before executing
- [04 · Extend & Wrap Tools](./04-extend-tools) — add logging, caching, auth to any tool
