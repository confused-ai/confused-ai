---
title: LLM Providers
description: 40+ supported LLM providers — OpenAI, Anthropic, Google, Groq, Ollama, AWS Bedrock and more.
outline: [2, 3]
---

# LLM Providers

confused-ai ships adapters for 40+ LLM providers. All are lazy dynamic imports — zero bundle cost unless used.

## Model string shorthand

The easiest way to pick a provider is by model name. Set the matching env var and pass the model string:

```ts
import { agent } from 'confused-ai';

// Auto-detects provider from model name + env vars
const ai = agent({ model: 'gpt-4o-mini' });
```

| Model string | Provider | Env var |
|---|---|---|
| `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `o1`, `o3` | OpenAI | `OPENAI_API_KEY` |
| `claude-3-5-sonnet-*`, `claude-3-haiku-*`, `claude-opus-*` | Anthropic | `ANTHROPIC_API_KEY` |
| `gemini-2.0-flash`, `gemini-1.5-pro`, `gemini-*` | Google | `GOOGLE_API_KEY` |
| `llama-3.3-70b-versatile`, `mixtral-*` | Groq | `GROQ_API_KEY` |
| `mistral-large`, `mistral-small`, `codestral` | Mistral | `MISTRAL_API_KEY` |
| `deepseek-chat`, `deepseek-reasoner` | DeepSeek | `DEEPSEEK_API_KEY` |
| `command-r-plus`, `command-r` | Cohere | `COHERE_API_KEY` |
| `amazon.nova-*`, `amazon.titan-*` | AWS Bedrock | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` |
| `accounts/fireworks/*` | Fireworks | `FIREWORKS_API_KEY` |
| `together-*` | Together AI | `TOGETHER_API_KEY` |
| `qwen-*` | Alibaba DashScope | `DASHSCOPE_API_KEY` |
| `glm-*` | Zhipu AI | `ZHIPU_API_KEY` |
| `solar-*` | Upstage | `UPSTAGE_API_KEY` |
| `nova-micro`, `nova-lite`, `nova-pro` | Nova (AWS) | `AWS_ACCESS_KEY_ID` |

## Provider instances

For full control, create a provider instance directly:

```ts
import {
  OpenAIProvider,
  AnthropicProvider,
  GoogleProvider,
} from 'confused-ai';

// OpenAI
const openai = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 4096,
});

// Anthropic
const claude = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-3-5-sonnet-20241022',
});

// Google Gemini
const gemini = new GoogleProvider({
  apiKey: process.env.GOOGLE_API_KEY!,
  model: 'gemini-2.0-flash',
});

const ai = agent({ llmProvider: openai, systemPrompt: '...' });
```

## OpenRouter (100+ models via one API)

```ts
import { createOpenRouterProvider } from 'confused-ai';

const provider = createOpenRouterProvider({
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: 'anthropic/claude-3.5-sonnet',
});
```

## Groq (ultra-fast inference)

```ts
import { createGroqProvider } from 'confused-ai';

const groq = createGroqProvider({
  apiKey: process.env.GROQ_API_KEY!,
  model: 'llama-3.3-70b-versatile',
});
```

## Ollama (local models)

```ts
import { ollama } from 'confused-ai';

const local = ollama({ model: 'llama3.2', baseUrl: 'http://localhost:11434' });
```

No API key required. Runs fully locally.

## AWS Bedrock

```ts
import { bedrock } from 'confused-ai';

const aws = bedrock({
  model: 'amazon.nova-pro-v1:0',
  region: 'us-east-1',
  // uses AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY from env
});
```

## Self-hosted / OpenAI-compatible

Any endpoint that follows the OpenAI API shape works:

```ts
import { createOpenAICompatibleProvider } from 'confused-ai';

// vLLM
const vllm = createOpenAICompatibleProvider({
  baseURL: 'http://localhost:8000/v1',
  apiKey: 'local',
  model: 'meta-llama/Llama-3.1-8B-Instruct',
});

// LM Studio
const lmStudio = createOpenAICompatibleProvider({
  baseURL: 'http://localhost:1234/v1',
  apiKey: 'lm-studio',
  model: 'llama-3.2-1b-instruct',
});

// LocalAI, KoboldCpp, Text-Generation-WebUI, Jan — same pattern
```

## LLM Router (cost-optimised)

Route requests to the cheapest model that meets your quality requirements:

```ts
import { createCostRouter } from 'confused-ai';

const router = createCostRouter({
  providers: new Map([
    ['gpt-4o',      openaiGPT4o],
    ['gpt-4o-mini', openaiMini],
    ['gemini-2.0-flash', gemini],
  ]),
  minCapability: 7,       // require at least a 7/10 capability score
  maxInputCostPerMillion: 1.00,  // cap at $1/M tokens
});

const ai = agent({ llmProvider: router });
```

See [LLM Router](/guide/llm-router) for full documentation.

## Multimodal (vision)

Send images alongside text:

```ts
import { image, text } from 'confused-ai';

const result = await ai.run({
  prompt: [
    image('https://example.com/chart.png'),
    text('What trend does this chart show?'),
  ],
});
```

## All supported providers

::: details Full provider list (40+)
**Major cloud**
- OpenAI (GPT-4o, o1, o3, DALL-E)
- Anthropic (Claude 3.5, Claude Opus)
- Google (Gemini 2.0, Gemini 1.5)
- AWS Bedrock (Nova, Titan, Llama via Bedrock)
- Azure OpenAI

**Fast inference**
- Groq (Llama, Mixtral — ultra-fast)
- Cerebras (Llama 3.3 — fastest)
- SambaNova (Llama)
- Hyperbolic

**OpenRouter / aggregators**
- OpenRouter (100+ models)
- Together AI
- Fireworks AI
- DeepInfra
- Novita AI

**Specialist**
- Mistral AI (Mistral, Codestral)
- DeepSeek (Chat, Reasoner)
- Cohere (Command R+)
- AI21 Labs (Jamba)
- Perplexity

**Chinese providers**
- Alibaba DashScope (Qwen)
- Zhipu AI (GLM)
- Moonshot (Kimi)
- 01.AI (Yi)
- Baichuan, MiniMax, Volcengine, HunYuan, StepFun, InternLM

**Self-hosted**
- Ollama
- vLLM
- LM Studio
- LocalAI
- KoboldCpp
- Text-Generation-WebUI
- Jan

**Platforms**
- Cloudflare Workers AI
- Replicate
- Lambda Labs
- Lepton AI
- Featherless AI
- Snowflake Cortex
- Writer (Palmyra)
- Upstage (Solar)
:::
