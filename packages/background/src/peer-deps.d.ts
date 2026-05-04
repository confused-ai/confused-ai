/**
 * Ambient type stubs for optional background queue peer dependencies.
 * These packages are NOT installed by default — they are only loaded at
 * runtime when the corresponding adapter is instantiated.
 *
 * TypeScript needs at least a `declare module` stub to allow dynamic imports
 * of uninstalled packages.  Each stub types the entire module as `any` because
 * the concrete types come from the peer dep itself when the user installs it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module 'bullmq' {
    const mod: any;
    export = mod;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module 'kafkajs' {
    const mod: any;
    export = mod;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module 'amqplib' {
    const mod: any;
    export = mod;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@aws-sdk/client-sqs' {
    const mod: any;
    export = mod;
}
