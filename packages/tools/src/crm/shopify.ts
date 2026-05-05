/**
 * Shopify tools — manage products, orders, and customers via Shopify Admin API.
 * API docs: https://shopify.dev/docs/api/admin-rest
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface ShopifyToolConfig {
    /** Shopify store domain, e.g. "mystore.myshopify.com" (or SHOPIFY_STORE_URL env var) */
    storeUrl?: string;
    /** Shopify Admin API access token (or SHOPIFY_ACCESS_TOKEN env var) */
    accessToken?: string;
    /** API version (default: 2024-01) */
    apiVersion?: string;
}

function getAuth(config: ShopifyToolConfig): { baseUrl: string; headers: Record<string, string> } {
    const storeUrl = (config.storeUrl ?? process.env['SHOPIFY_STORE_URL'] ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    const accessToken = config.accessToken ?? process.env['SHOPIFY_ACCESS_TOKEN'];
    if (!storeUrl) throw new Error('ShopifyTools require SHOPIFY_STORE_URL');
    if (!accessToken) throw new Error('ShopifyTools require SHOPIFY_ACCESS_TOKEN');
    const version = config.apiVersion ?? '2024-01';
    return {
        baseUrl: `https://${storeUrl}/admin/api/${version}`,
        headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
    };
}

async function shopifyRequest(auth: ReturnType<typeof getAuth>, method: string, path: string, body?: object): Promise<unknown> {
    const res = await fetch(`${auth.baseUrl}${path}`, {
        method,
        headers: auth.headers,
        ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    if (!res.ok) throw new Error(`Shopify API ${res.status}: ${await res.text()}`);
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const ListProductsSchema = z.object({
    limit: z.number().int().min(1).max(250).optional().default(50).describe('Number of products to return'),
    status: z.enum(['active', 'archived', 'draft']).optional().describe('Filter by status'),
    title: z.string().optional().describe('Filter products by title'),
    collection: z.string().optional().describe('Filter by collection ID'),
});

const GetProductSchema = z.object({
    productId: z.union([z.string(), z.number()]).describe('Shopify product ID'),
});

const ListOrdersSchema = z.object({
    limit: z.number().int().min(1).max(250).optional().default(50).describe('Number of orders'),
    status: z.enum(['open', 'closed', 'cancelled', 'any']).optional().default('open')
        .describe('Order status filter'),
    financialStatus: z.enum(['pending', 'authorized', 'partially_paid', 'paid', 'partially_refunded', 'refunded', 'voided'])
        .optional().describe('Financial status filter'),
    fulfillmentStatus: z.enum(['shipped', 'partial', 'unshipped', 'unfulfilled']).optional()
        .describe('Fulfillment status filter'),
});

const GetOrderSchema = z.object({
    orderId: z.union([z.string(), z.number()]).describe('Shopify order ID'),
});

const ListCustomersSchema = z.object({
    limit: z.number().int().min(1).max(250).optional().default(50).describe('Number of customers'),
    email: z.string().email().optional().describe('Filter by email'),
    query: z.string().optional().describe('Search by name or email'),
});

const GetCustomerSchema = z.object({
    customerId: z.union([z.string(), z.number()]).describe('Shopify customer ID'),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class ShopifyListProductsTool extends BaseTool<typeof ListProductsSchema> {
    constructor(private config: ShopifyToolConfig = {}) {
        super({
            id: 'shopify_list_products',
            name: 'Shopify List Products',
            description: 'List products in a Shopify store.',
            category: ToolCategory.DATABASE,
            parameters: ListProductsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ListProductsSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const params = new URLSearchParams({ limit: String(input.limit ?? 50) });
        if (input.status) params.set('status', input.status);
        if (input.title) params.set('title', input.title);
        if (input.collection) params.set('collection_id', String(input.collection));
        return shopifyRequest(auth, 'GET', `/products.json?${params}`);
    }
}

export class ShopifyGetProductTool extends BaseTool<typeof GetProductSchema> {
    constructor(private config: ShopifyToolConfig = {}) {
        super({
            id: 'shopify_get_product',
            name: 'Shopify Get Product',
            description: 'Get details of a specific Shopify product by ID.',
            category: ToolCategory.DATABASE,
            parameters: GetProductSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetProductSchema>, _ctx: ToolContext) {
        return shopifyRequest(getAuth(this.config), 'GET', `/products/${input.productId}.json`);
    }
}

export class ShopifyListOrdersTool extends BaseTool<typeof ListOrdersSchema> {
    constructor(private config: ShopifyToolConfig = {}) {
        super({
            id: 'shopify_list_orders',
            name: 'Shopify List Orders',
            description: 'List orders in a Shopify store.',
            category: ToolCategory.DATABASE,
            parameters: ListOrdersSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ListOrdersSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const params = new URLSearchParams({ limit: String(input.limit ?? 50), status: input.status ?? 'open' });
        if (input.financialStatus) params.set('financial_status', input.financialStatus);
        if (input.fulfillmentStatus) params.set('fulfillment_status', input.fulfillmentStatus);
        return shopifyRequest(auth, 'GET', `/orders.json?${params}`);
    }
}

export class ShopifyGetOrderTool extends BaseTool<typeof GetOrderSchema> {
    constructor(private config: ShopifyToolConfig = {}) {
        super({
            id: 'shopify_get_order',
            name: 'Shopify Get Order',
            description: 'Get details of a specific Shopify order by ID.',
            category: ToolCategory.DATABASE,
            parameters: GetOrderSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetOrderSchema>, _ctx: ToolContext) {
        return shopifyRequest(getAuth(this.config), 'GET', `/orders/${input.orderId}.json`);
    }
}

export class ShopifyListCustomersTool extends BaseTool<typeof ListCustomersSchema> {
    constructor(private config: ShopifyToolConfig = {}) {
        super({
            id: 'shopify_list_customers',
            name: 'Shopify List Customers',
            description: 'List customers in a Shopify store.',
            category: ToolCategory.DATABASE,
            parameters: ListCustomersSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ListCustomersSchema>, _ctx: ToolContext) {
        const auth = getAuth(this.config);
        const params = new URLSearchParams({ limit: String(input.limit ?? 50) });
        if (input.email) params.set('email', input.email);
        if (input.query) params.set('query', input.query);
        return shopifyRequest(auth, 'GET', `/customers.json?${params}`);
    }
}

export class ShopifyGetCustomerTool extends BaseTool<typeof GetCustomerSchema> {
    constructor(private config: ShopifyToolConfig = {}) {
        super({
            id: 'shopify_get_customer',
            name: 'Shopify Get Customer',
            description: 'Get details of a specific Shopify customer by ID.',
            category: ToolCategory.DATABASE,
            parameters: GetCustomerSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GetCustomerSchema>, _ctx: ToolContext) {
        return shopifyRequest(getAuth(this.config), 'GET', `/customers/${input.customerId}.json`);
    }
}

export class ShopifyToolkit {
    readonly listProducts: ShopifyListProductsTool;
    readonly getProduct: ShopifyGetProductTool;
    readonly listOrders: ShopifyListOrdersTool;
    readonly getOrder: ShopifyGetOrderTool;
    readonly listCustomers: ShopifyListCustomersTool;
    readonly getCustomer: ShopifyGetCustomerTool;

    constructor(config: ShopifyToolConfig = {}) {
        this.listProducts = new ShopifyListProductsTool(config);
        this.getProduct = new ShopifyGetProductTool(config);
        this.listOrders = new ShopifyListOrdersTool(config);
        this.getOrder = new ShopifyGetOrderTool(config);
        this.listCustomers = new ShopifyListCustomersTool(config);
        this.getCustomer = new ShopifyGetCustomerTool(config);
    }

    getTools() {
        return [this.listProducts, this.getProduct, this.listOrders, this.getOrder, this.listCustomers, this.getCustomer];
    }
}
