/**
 * OpenBB Platform tools — financial data via OpenBB API.
 * Docs: https://docs.openbb.co/platform
 * API key (PAT): https://my.openbb.co/app/pat
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface OpenBBToolConfig {
    /** OpenBB PAT token (or OPENBB_PAT env var) */
    pat?: string;
    /** OpenBB host URL (default: https://api.openbb.co) */
    host?: string;
}

function getAuth(config: OpenBBToolConfig): { baseUrl: string; headers: Record<string, string> } {
    const pat = config.pat ?? process.env.OPENBB_PAT;
    if (!pat) throw new Error('OpenBBTools require OPENBB_PAT');
    const host = (config.host ?? process.env.OPENBB_HOST ?? 'https://api.openbb.co').replace(/\/$/, '');
    return {
        baseUrl: host,
        headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    };
}

async function openbbGet(auth: ReturnType<typeof getAuth>, path: string, params?: URLSearchParams): Promise<unknown> {
    const url = params ? `${auth.baseUrl}${path}?${params}` : `${auth.baseUrl}${path}`;
    const res = await fetch(url, { headers: auth.headers });
    if (!res.ok) throw new Error(`OpenBB API ${res.status}: ${await res.text()}`);
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const StockQuoteSchema = z.object({
    symbol: z.string().describe('Stock ticker symbol (e.g. AAPL, MSFT)'),
    provider: z.string().optional().default('fmp').describe('Data provider (fmp, polygon, yfinance, etc.)'),
});

const StockHistoricalSchema = z.object({
    symbol: z.string().describe('Stock ticker symbol'),
    startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
    endDate: z.string().optional().describe('End date (YYYY-MM-DD)'),
    interval: z.string().optional().default('1d').describe('Time interval (1m, 5m, 1h, 1d, 1W, 1M)'),
    provider: z.string().optional().default('fmp').describe('Data provider'),
});

const StockNewsSchema = z.object({
    symbols: z.string().describe('Comma-separated ticker symbols'),
    limit: z.number().int().optional().default(20).describe('Number of news articles'),
    provider: z.string().optional().default('benzinga').describe('Data provider'),
});

const StockFundamentalsSchema = z.object({
    symbol: z.string().describe('Stock ticker symbol'),
    provider: z.string().optional().default('fmp').describe('Data provider'),
    period: z.enum(['annual', 'quarter']).optional().default('annual').describe('Reporting period'),
    limit: z.number().int().optional().default(5).describe('Number of periods'),
});

const CryptoQuoteSchema = z.object({
    symbol: z.string().describe('Crypto symbol (e.g. BTCUSD, ETHUSD)'),
    provider: z.string().optional().default('fmp').describe('Data provider'),
});

const ForexSchema = z.object({
    symbol: z.string().describe('Currency pair (e.g. EURUSD, GBPJPY)'),
    provider: z.string().optional().default('fmp').describe('Data provider'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class OpenBBStockQuoteTool extends BaseTool<typeof StockQuoteSchema> {
    constructor(private config: OpenBBToolConfig = {}) {
        super({
            id: 'openbb_stock_quote',
            name: 'OpenBB Stock Quote',
            description: 'Get real-time or delayed stock quote data for a ticker symbol.',
            category: ToolCategory.API,
            parameters: StockQuoteSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof StockQuoteSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const params = new URLSearchParams({ symbol: input.symbol, provider: input.provider ?? 'fmp' });
        return openbbGet(auth, '/api/v1/equity/price/quote', params);
    }
}

export class OpenBBStockHistoricalTool extends BaseTool<typeof StockHistoricalSchema> {
    constructor(private config: OpenBBToolConfig = {}) {
        super({
            id: 'openbb_stock_historical',
            name: 'OpenBB Stock Historical',
            description: 'Get historical OHLCV price data for a stock.',
            category: ToolCategory.API,
            parameters: StockHistoricalSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 30000 },
        });
    }

    protected async performExecute(input: z.infer<typeof StockHistoricalSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const params = new URLSearchParams({
            symbol: input.symbol,
            provider: input.provider ?? 'fmp',
            interval: input.interval ?? '1d',
        });
        if (input.startDate) params.set('start_date', input.startDate);
        if (input.endDate) params.set('end_date', input.endDate);
        return openbbGet(auth, '/api/v1/equity/price/historical', params);
    }
}

export class OpenBBStockNewsTool extends BaseTool<typeof StockNewsSchema> {
    constructor(private config: OpenBBToolConfig = {}) {
        super({
            id: 'openbb_stock_news',
            name: 'OpenBB Stock News',
            description: 'Get financial news for specific stock tickers.',
            category: ToolCategory.API,
            parameters: StockNewsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof StockNewsSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const params = new URLSearchParams({
            symbols: input.symbols,
            limit: String(input.limit ?? 20),
            provider: input.provider ?? 'benzinga',
        });
        return openbbGet(auth, '/api/v1/news/company', params);
    }
}

export class OpenBBStockFundamentalsTool extends BaseTool<typeof StockFundamentalsSchema> {
    constructor(private config: OpenBBToolConfig = {}) {
        super({
            id: 'openbb_stock_fundamentals',
            name: 'OpenBB Stock Fundamentals',
            description: 'Get financial fundamentals (income statement, balance sheet, cash flow) for a stock.',
            category: ToolCategory.API,
            parameters: StockFundamentalsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof StockFundamentalsSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const params = new URLSearchParams({
            symbol: input.symbol,
            provider: input.provider ?? 'fmp',
            period: input.period ?? 'annual',
            limit: String(input.limit ?? 5),
        });
        return openbbGet(auth, '/api/v1/equity/fundamental/income', params);
    }
}

export class OpenBBCryptoQuoteTool extends BaseTool<typeof CryptoQuoteSchema> {
    constructor(private config: OpenBBToolConfig = {}) {
        super({
            id: 'openbb_crypto_quote',
            name: 'OpenBB Crypto Quote',
            description: 'Get real-time cryptocurrency price data.',
            category: ToolCategory.API,
            parameters: CryptoQuoteSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CryptoQuoteSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const params = new URLSearchParams({ symbol: input.symbol, provider: input.provider ?? 'fmp' });
        return openbbGet(auth, '/api/v1/crypto/price/historical', params);
    }
}

export class OpenBBForexTool extends BaseTool<typeof ForexSchema> {
    constructor(private config: OpenBBToolConfig = {}) {
        super({
            id: 'openbb_forex',
            name: 'OpenBB Forex',
            description: 'Get foreign exchange (forex) rates for currency pairs.',
            category: ToolCategory.API,
            parameters: ForexSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ForexSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const params = new URLSearchParams({ symbol: input.symbol, provider: input.provider ?? 'fmp' });
        return openbbGet(auth, '/api/v1/currency/price/historical', params);
    }
}

export class OpenBBToolkit {
    readonly stockQuote: OpenBBStockQuoteTool;
    readonly stockHistorical: OpenBBStockHistoricalTool;
    readonly stockNews: OpenBBStockNewsTool;
    readonly stockFundamentals: OpenBBStockFundamentalsTool;
    readonly cryptoQuote: OpenBBCryptoQuoteTool;
    readonly forex: OpenBBForexTool;

    constructor(config: OpenBBToolConfig = {}) {
        this.stockQuote = new OpenBBStockQuoteTool(config);
        this.stockHistorical = new OpenBBStockHistoricalTool(config);
        this.stockNews = new OpenBBStockNewsTool(config);
        this.stockFundamentals = new OpenBBStockFundamentalsTool(config);
        this.cryptoQuote = new OpenBBCryptoQuoteTool(config);
        this.forex = new OpenBBForexTool(config);
    }

    getTools() {
        return [this.stockQuote, this.stockHistorical, this.stockNews, this.stockFundamentals, this.cryptoQuote, this.forex];
    }
}
