import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, ToolContext } from '../core/types.js';

const YFinanceParameters = z.object({
    symbol: z.string().describe('The stock symbol (e.g., AAPL)'),
});

type YFinanceParameters = z.infer<typeof YFinanceParameters>;

export class YFinanceTool extends BaseTool<typeof YFinanceParameters, unknown> {
    constructor() {
        super({
            name: 'yfinance_stock',
            description: 'Fetch real-time stock quote data using Yahoo Finance',
            parameters: YFinanceParameters,
            category: ToolCategory.WEB,
            permissions: {
                allowNetwork: true,
                allowFileSystem: false,
                maxExecutionTimeMs: 30000,
            },
        });
    }

    protected async performExecute(
        params: YFinanceParameters,
        _context: ToolContext
    ): Promise<unknown> {
        const { default: yahooFinance } = await import('yahoo-finance2');
        return await yahooFinance.quote(params.symbol);
    }
}
