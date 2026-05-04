/**
 * Calculator tool implementation - TypeScript  CalculatorTools
 */

import { z } from 'zod';
import { BaseTool, BaseToolConfig } from '../core/base-tool.js';
import { ToolContext, ToolCategory } from '../core/types.js';

/**
 * Parameters for calculator operations
 */
const CalculatorOperationParameters = z.object({
    a: z.number().describe('First number'),
    b: z.number().describe('Second number'),
});

const CalculatorSingleNumberParameters = z.object({
    n: z.number().describe('Number to operate on'),
});

interface CalculatorResult {
    operation: string;
    result?: number;
    error?: string;
}

/**
 * Add two numbers
 */
export class CalculatorAddTool extends BaseTool<typeof CalculatorOperationParameters, CalculatorResult> {
    constructor(config?: Partial<Omit<BaseToolConfig<typeof CalculatorOperationParameters>, 'parameters'>>) {
        super({
            name: config?.name ?? 'calculator_add',
            description: config?.description ?? 'Add two numbers and return the result',
            parameters: CalculatorOperationParameters,
            category: config?.category ?? ToolCategory.UTILITY,
            ...config,
        });
    }

    protected async performExecute(
        params: z.infer<typeof CalculatorOperationParameters>,
        _context: ToolContext
    ): Promise<CalculatorResult> {
        const result = params.a + params.b;
        return { operation: 'addition', result };
    }
}

/**
 * Subtract two numbers
 */
export class CalculatorSubtractTool extends BaseTool<typeof CalculatorOperationParameters, CalculatorResult> {
    constructor(config?: Partial<Omit<BaseToolConfig<typeof CalculatorOperationParameters>, 'parameters'>>) {
        super({
            name: config?.name ?? 'calculator_subtract',
            description: config?.description ?? 'Subtract second number from first and return the result',
            parameters: CalculatorOperationParameters,
            category: config?.category ?? ToolCategory.UTILITY,
            ...config,
        });
    }

    protected async performExecute(
        params: z.infer<typeof CalculatorOperationParameters>,
        _context: ToolContext
    ): Promise<CalculatorResult> {
        const result = params.a - params.b;
        return { operation: 'subtraction', result };
    }
}

/**
 * Multiply two numbers
 */
export class CalculatorMultiplyTool extends BaseTool<typeof CalculatorOperationParameters, CalculatorResult> {
    constructor(config?: Partial<Omit<BaseToolConfig<typeof CalculatorOperationParameters>, 'parameters'>>) {
        super({
            name: config?.name ?? 'calculator_multiply',
            description: config?.description ?? 'Multiply two numbers and return the result',
            parameters: CalculatorOperationParameters,
            category: config?.category ?? ToolCategory.UTILITY,
            ...config,
        });
    }

    protected async performExecute(
        params: z.infer<typeof CalculatorOperationParameters>,
        _context: ToolContext
    ): Promise<CalculatorResult> {
        const result = params.a * params.b;
        return { operation: 'multiplication', result };
    }
}

/**
 * Divide two numbers
 */
export class CalculatorDivideTool extends BaseTool<typeof CalculatorOperationParameters, CalculatorResult> {
    constructor(config?: Partial<Omit<BaseToolConfig<typeof CalculatorOperationParameters>, 'parameters'>>) {
        super({
            name: config?.name ?? 'calculator_divide',
            description: config?.description ?? 'Divide first number by second and return the result',
            parameters: CalculatorOperationParameters,
            category: config?.category ?? ToolCategory.UTILITY,
            ...config,
        });
    }

    protected async performExecute(
        params: z.infer<typeof CalculatorOperationParameters>,
        _context: ToolContext
    ): Promise<CalculatorResult> {
        if (params.b === 0) {
            return { operation: 'division', error: 'Division by zero is undefined' };
        }
        const result = params.a / params.b;
        return { operation: 'division', result };
    }
}

/**
 * Raise a number to a power
 */
export class CalculatorExponentiateTool extends BaseTool<typeof CalculatorOperationParameters, CalculatorResult> {
    constructor(config?: Partial<Omit<BaseToolConfig<typeof CalculatorOperationParameters>, 'parameters'>>) {
        super({
            name: config?.name ?? 'calculator_exponentiate',
            description: config?.description ?? 'Raise first number to the power of the second number',
            parameters: CalculatorOperationParameters,
            category: config?.category ?? ToolCategory.UTILITY,
            ...config,
        });
    }

    protected async performExecute(
        params: z.infer<typeof CalculatorOperationParameters>,
        _context: ToolContext
    ): Promise<CalculatorResult> {
        const result = Math.pow(params.a, params.b);
        return { operation: 'exponentiation', result };
    }
}

/**
 * Calculate factorial of a number
 */
export class CalculatorFactorialTool extends BaseTool<typeof CalculatorSingleNumberParameters, CalculatorResult> {
    constructor(config?: Partial<Omit<BaseToolConfig<typeof CalculatorSingleNumberParameters>, 'parameters'>>) {
        super({
            name: config?.name ?? 'calculator_factorial',
            description: config?.description ?? 'Calculate the factorial of a number',
            parameters: CalculatorSingleNumberParameters,
            category: config?.category ?? ToolCategory.UTILITY,
            ...config,
        });
    }

    protected async performExecute(
        params: z.infer<typeof CalculatorSingleNumberParameters>,
        _context: ToolContext
    ): Promise<CalculatorResult> {
        if (params.n < 0) {
            return { operation: 'factorial', error: 'Factorial of a negative number is undefined' };
        }
        if (!Number.isInteger(params.n)) {
            return { operation: 'factorial', error: 'Factorial is only defined for integers' };
        }
        let result = 1;
        for (let i = 2; i <= params.n; i++) {
            result *= i;
        }
        return { operation: 'factorial', result };
    }
}

/**
 * Check if a number is prime
 */
export class CalculatorIsPrimeTool extends BaseTool<typeof CalculatorSingleNumberParameters, CalculatorResult> {
    constructor(config?: Partial<Omit<BaseToolConfig<typeof CalculatorSingleNumberParameters>, 'parameters'>>) {
        super({
            name: config?.name ?? 'calculator_is_prime',
            description: config?.description ?? 'Check if a number is prime',
            parameters: CalculatorSingleNumberParameters,
            category: config?.category ?? ToolCategory.UTILITY,
            ...config,
        });
    }

    protected async performExecute(
        params: z.infer<typeof CalculatorSingleNumberParameters>,
        _context: ToolContext
    ): Promise<CalculatorResult> {
        const n = params.n;
        if (n <= 1) {
            return { operation: 'prime_check', result: 0 }; // 0 = false
        }
        if (n <= 3) {
            return { operation: 'prime_check', result: 1 }; // 1 = true
        }
        if (n % 2 === 0 || n % 3 === 0) {
            return { operation: 'prime_check', result: 0 };
        }
        for (let i = 5; i * i <= n; i += 6) {
            if (n % i === 0 || n % (i + 2) === 0) {
                return { operation: 'prime_check', result: 0 };
            }
        }
        return { operation: 'prime_check', result: 1 };
    }
}

/**
 * Calculate square root of a number
 */
export class CalculatorSquareRootTool extends BaseTool<typeof CalculatorSingleNumberParameters, CalculatorResult> {
    constructor(config?: Partial<Omit<BaseToolConfig<typeof CalculatorSingleNumberParameters>, 'parameters'>>) {
        super({
            name: config?.name ?? 'calculator_square_root',
            description: config?.description ?? 'Calculate the square root of a number',
            parameters: CalculatorSingleNumberParameters,
            category: config?.category ?? ToolCategory.UTILITY,
            ...config,
        });
    }

    protected async performExecute(
        params: z.infer<typeof CalculatorSingleNumberParameters>,
        _context: ToolContext
    ): Promise<CalculatorResult> {
        if (params.n < 0) {
            return { operation: 'square_root', error: 'Square root of a negative number is undefined' };
        }
        const result = Math.sqrt(params.n);
        return { operation: 'square_root', result };
    }
}

/**
 * Calculator toolkit - provides all calculator tools
 */
export class CalculatorToolkit {
    static createAll(): Array<
        | CalculatorAddTool
        | CalculatorSubtractTool
        | CalculatorMultiplyTool
        | CalculatorDivideTool
        | CalculatorExponentiateTool
        | CalculatorFactorialTool
        | CalculatorIsPrimeTool
        | CalculatorSquareRootTool
    > {
        return [
            new CalculatorAddTool(),
            new CalculatorSubtractTool(),
            new CalculatorMultiplyTool(),
            new CalculatorDivideTool(),
            new CalculatorExponentiateTool(),
            new CalculatorFactorialTool(),
            new CalculatorIsPrimeTool(),
            new CalculatorSquareRootTool(),
        ];
    }
}
