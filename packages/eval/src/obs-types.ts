/**
 * Minimal observability types for the eval package.
 */

export enum MetricType {
    COUNTER = 'counter',
    GAUGE = 'gauge',
    HISTOGRAM = 'histogram',
    SUMMARY = 'summary',
}

export interface MetricValue {
    readonly name: string;
    readonly type: MetricType;
    readonly value: number;
    readonly labels: Record<string, string>;
    readonly timestamp: Date;
}

export interface MetricsCollector {
    counter(name: string, value?: number, labels?: Record<string, string>): void;
    gauge(name: string, value: number, labels?: Record<string, string>): void;
    histogram(name: string, value: number, labels?: Record<string, string>): void;
    getMetrics(): MetricValue[];
    clear(): void;
}
