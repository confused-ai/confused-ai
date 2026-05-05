import { defineConfig } from 'vitepress';

const base = process.env.BASE ?? '/';
const SITE_URL = process.env.SITE_URL ?? 'https://rvuyyuru2.github.io/agent-framework';

export default defineConfig({
    base,
    title: 'Confused-AI',
    titleTemplate: ':title — Confused-AI',
    description: 'TypeScript framework for building production-grade AI agents, teams, and services. ReAct loop, 100+ tools, multi-agent orchestration, circuit breakers, HITL, budget enforcement — all in one package.',
    lang: 'en-US',

    cleanUrls: true,
    lastUpdated: true,

    sitemap: {
        hostname: SITE_URL,
    },

    head: [
        // Favicon & theme
        ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
        ['link', { rel: 'shortcut icon', href: `${base}favicon.svg` }],
        ['meta', { name: 'theme-color', content: '#8b5cf6' }],

        // Open Graph
        ['meta', { property: 'og:type', content: 'website' }],
        ['meta', { property: 'og:site_name', content: 'Confused-AI' }],
        ['meta', { property: 'og:title', content: 'Confused-AI — Production-Grade AI Agent Framework' }],
        ['meta', { property: 'og:description', content: 'Build and ship AI agents in TypeScript. 100+ tools, multi-agent orchestration, circuit breakers, budget caps, HITL, MCP, OTLP tracing — zero magic, every escape hatch open.' }],
        ['meta', { property: 'og:image', content: `${SITE_URL}/og-banner.svg` }],
        ['meta', { property: 'og:url', content: SITE_URL }],

        // Twitter / X
        ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
        ['meta', { name: 'twitter:title', content: 'Confused-AI — Production-Grade AI Agent Framework' }],
        ['meta', { name: 'twitter:description', content: 'Build and ship AI agents in TypeScript. 100+ tools, multi-agent orchestration, circuit breakers, budget caps, HITL, MCP.' }],
        ['meta', { name: 'twitter:image', content: `${SITE_URL}/og-banner.svg` }],

        // SEO
        ['meta', { name: 'keywords', content: 'AI agent framework, TypeScript AI agents, LLM orchestration, multi-agent, RAG, MCP, production AI, OpenAI, Anthropic, Google Gemini' }],
        ['meta', { name: 'author', content: 'Confused-AI contributors' }],
        ['meta', { name: 'robots', content: 'index, follow' }],

        // Performance
        ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ],

    themeConfig: {
        logo: { src: '/logo.svg', alt: 'Confused-AI' },
        siteTitle: 'Confused-AI',

        nav: [
            { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
            { text: 'Examples', link: '/examples/', activeMatch: '/examples/' },
            { text: 'API Reference', link: '/api/', activeMatch: '/api/' },
            {
                text: 'Ecosystem',
                items: [
                    { text: '📦 All Modules', link: '/guide/all-modules' },
                    { text: '🔌 Adapters System', link: '/guide/adapters' },
                    { text: '🧩 Plugins', link: '/guide/plugins' },
                    { text: '🤝 MCP Client', link: '/guide/mcp' },
                    { text: '🔁 LLM Router', link: '/guide/llm-router' },
                ],
            },
            {
                text: 'v1.2.0',
                items: [
                    { text: '📋 Changelog', link: '/changelog' },
                    { text: '📦 npm package', link: 'https://www.npmjs.com/package/confused-ai' },
                    { text: '🏷️ Releases', link: 'https://github.com/confused-ai/confused-ai/releases' },
                    { text: '🤝 Contributing', link: 'https://github.com/confused-ai/confused-ai/blob/main/CONTRIBUTING.md' },
                    { text: '🔒 Security', link: 'https://github.com/confused-ai/confused-ai/blob/main/SECURITY.md' },
                ],
            },
        ],

        sidebar: {
            '/guide/': [
                {
                    text: '🚀 Introduction',
                    collapsed: false,
                    items: [
                        { text: 'Getting Started', link: '/guide/getting-started' },
                        { text: 'Core Concepts', link: '/guide/concepts' },
                        { text: 'All Modules Reference', link: '/guide/all-modules' },
                        { text: 'Adapters System', link: '/guide/adapters' },
                    ],
                },
                {
                    text: '🤖 Building Agents',
                    collapsed: false,
                    items: [
                        { text: 'Creating Agents', link: '/guide/agents' },
                        { text: 'Built-in Tools (100+)', link: '/guide/tools' },
                        { text: 'Custom Tools', link: '/guide/custom-tools' },
                        { text: 'Lifecycle Hooks', link: '/guide/hooks' },
                        { text: 'Compose & Pipe', link: '/guide/compose' },
                        { text: 'Vision & Multimodal', link: '/guide/vision' },
                        { text: 'Planner', link: '/guide/planner' },
                    ],
                },
                {
                    text: '💾 Data & Storage',
                    collapsed: false,
                    items: [
                        { text: 'RAG / Knowledge', link: '/guide/rag' },
                        { text: 'Memory', link: '/guide/memory' },
                        { text: 'Storage (KV/File)', link: '/guide/storage' },
                        { text: 'Session Management', link: '/guide/session' },
                        { text: 'Database Tools', link: '/guide/database' },
                    ],
                },
                {
                    text: '🧠 Intelligence',
                    collapsed: false,
                    items: [
                        { text: 'Learning Machine', link: '/guide/learning-machine' },
                        { text: 'Reasoning (CoT)', link: '/guide/reasoning' },
                        { text: 'Compression', link: '/guide/compression' },
                        { text: 'Context Providers', link: '/guide/context-provider' },
                        { text: 'Scheduler', link: '/guide/scheduler' },
                    ],
                },
                {
                    text: '🔀 Multi-Agent',
                    collapsed: false,
                    items: [
                        { text: 'Orchestration', link: '/guide/orchestration' },
                        { text: 'Execution Workflows', link: '/guide/workflows' },
                        { text: 'Graph Engine', link: '/guide/graph' },
                        { text: 'LLM Router', link: '/guide/llm-router' },
                        { text: 'MCP Client & Server', link: '/guide/mcp' },
                    ],
                },
                {
                    text: '📤 Output & Media',
                    collapsed: true,
                    items: [
                        { text: 'Artifacts', link: '/guide/artifacts' },
                        { text: 'Voice (TTS/STT)', link: '/guide/voice' },
                        { text: 'Video Generation', link: '/guide/video' },
                    ],
                },
                {
                    text: '🏭 Enterprise Production',
                    collapsed: false,
                    items: [
                        { text: 'Guardrails & Safety', link: '/guide/guardrails' },
                        { text: 'Resilience & Circuit Breakers', link: '/guide/production' },
                        { text: 'Human-in-the-Loop (HITL)', link: '/guide/hitl' },
                        { text: 'Observability & OTLP', link: '/guide/observability' },
                        { text: 'Budget Enforcement', link: '/guide/production#budget-enforcement' },
                        { text: 'Multi-Tenancy', link: '/guide/multi-tenancy' },
                        { text: 'Background Queues', link: '/guide/background-queues' },
                        { text: 'WebSocket Transport', link: '/guide/websocket' },
                        { text: 'Admin API', link: '/guide/admin-api' },
                        { text: 'Secret Manager', link: '/guide/secret-manager' },
                        { text: 'Plugins', link: '/guide/plugins' },
                    ],
                },
            ],

            '/examples/': [
                {
                    text: 'Quickstart',
                    items: [
                        { text: 'Overview', link: '/examples/' },
                        { text: '01 · Hello World', link: '/examples/01-hello-world' },
                        { text: '02 · First Custom Tool', link: '/examples/02-custom-tool' },
                        { text: '03 · Tool with Approval', link: '/examples/03-approval-tool' },
                        { text: '04 · Extend & Wrap Tools', link: '/examples/04-extend-tools' },
                    ],
                },
                {
                    text: 'Data & Knowledge',
                    items: [
                        { text: '05 · RAG Knowledge Base', link: '/examples/05-rag' },
                        { text: '06 · Persistent Memory', link: '/examples/06-memory' },
                        { text: '07 · Storage Patterns', link: '/examples/07-storage' },
                        { text: '10 · Database Analyst', link: '/examples/10-database' },
                    ],
                },
                {
                    text: 'Multi-Agent',
                    items: [
                        { text: '08 · Multi-Agent Team', link: '/examples/08-team' },
                        { text: '09 · Supervisor Workflow', link: '/examples/09-supervisor' },
                        { text: '16 · LLM Router', link: '/examples/16-llm-router' },
                    ],
                },
                {
                    text: 'Production',
                    items: [
                        { text: '11 · Customer Support Bot', link: '/examples/11-support-bot' },
                        { text: '12 · Observability & Hooks', link: '/examples/12-observability' },
                        { text: '13 · Production Resilience', link: '/examples/13-production' },
                        { text: '14 · MCP Filesystem Agent', link: '/examples/14-mcp' },
                        { text: '15 · Full-Stack App', link: '/examples/15-full-stack' },
                    ],
                },
                {
                    text: 'Showcases',
                    items: [
                        { text: '17 · Full Framework Showcase', link: '/examples/17-full-framework-showcase' },
                        { text: '18 · Meridian Platform', link: '/examples/18-meridian-platform' },
                    ],
                },
            ],

            '/api/': [
                {
                    text: 'API Reference',
                    items: [
                        { text: 'Overview', link: '/api/' },
                        { text: 'agent() / createAgent()', link: '/api/agent' },
                        { text: 'tool() / defineTool()', link: '/api/tools' },
                        { text: 'KnowledgeEngine', link: '/api/knowledge' },
                        { text: 'createStorage()', link: '/api/storage' },
                        { text: 'Orchestration', link: '/api/orchestration' },
                    ],
                },
            ],
        },

        socialLinks: [
            { icon: 'github', link: 'https://github.com/confused-ai/confused-ai' },
            { icon: 'npm', link: 'https://www.npmjs.com/package/confused-ai' },
        ],

        footer: {
            message: 'Released under the <a href="https://github.com/confused-ai/confused-ai/blob/main/LICENSE">MIT License</a>.',
            copyright: 'Copyright © 2024-present Raja Shekar Reddy Vuyyuru',
        },

        search: {
            provider: 'local',
            options: {
                detailedView: true,
            },
        },

        editLink: {
            pattern: 'https://github.com/confused-ai/confused-ai/edit/main/docs/:path',
            text: 'Edit this page on GitHub',
        },

        lastUpdated: {
            text: 'Updated at',
            formatOptions: {
                dateStyle: 'medium',
                timeStyle: 'short',
            },
        },

        docFooter: {
            prev: 'Previous',
            next: 'Next',
        },

        outline: {
            level: [2, 3],
            label: 'On this page',
        },

        notFound: {
            title: 'Page Not Found',
            quote: "If you've followed a broken link, please open an issue on GitHub.",
            linkText: 'Back to home',
        },
    },

    markdown: {
        theme: { light: 'github-light', dark: 'one-dark-pro' },
        lineNumbers: true,
        image: {
            lazyLoading: true,
        },
        toc: { level: [2, 3] },
    },

    vite: {
        build: {
            chunkSizeWarningLimit: 1500,
        },
    },
});
