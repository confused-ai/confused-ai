/**
 * OpenWeatherMap tools — current weather and 5-day forecast.
 * API key: https://openweathermap.org/api
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface OpenWeatherToolConfig {
    /** OpenWeatherMap API key (or OPENWEATHER_API_KEY env var) */
    apiKey?: string;
    /** Unit system: metric (°C), imperial (°F), standard (K). Default: metric */
    units?: 'metric' | 'imperial' | 'standard';
}

function getKey(config: OpenWeatherToolConfig): string {
    const key = config.apiKey ?? process.env['OPENWEATHER_API_KEY'];
    if (!key) throw new Error('OpenWeatherTools require OPENWEATHER_API_KEY');
    return key;
}

async function owmFetch(apiKey: string, path: string, params: Record<string, string>): Promise<unknown> {
    const p = new URLSearchParams({ ...params, appid: apiKey });
    const res = await fetch(`https://api.openweathermap.org/data/2.5/${path}?${p}`);
    if (!res.ok) throw new Error(`OpenWeather API ${res.status}: ${await res.text()}`);
    return res.json();
}

// ── Schemas ────────────────────────────────────────────────────────────────

const CurrentSchema = z.object({
    location: z.string().describe('City name, "City,CountryCode" (e.g. "London,GB"), or zip code'),
    units: z.enum(['metric', 'imperial', 'standard']).optional().describe('Unit system (overrides config)'),
});

const ForecastSchema = z.object({
    location: z.string().describe('City name, "City,CountryCode", or zip code'),
    days: z.number().int().min(1).max(5).optional().default(3).describe('Number of forecast days (1-5)'),
    units: z.enum(['metric', 'imperial', 'standard']).optional(),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class OpenWeatherCurrentTool extends BaseTool<typeof CurrentSchema, {
    location: string;
    country: string;
    temperature: number;
    feelsLike: number;
    humidity: number;
    description: string;
    windSpeed: number;
    units: string;
}> {
    constructor(private config: OpenWeatherToolConfig = {}) {
        super({
            id: 'openweather_current',
            name: 'OpenWeather Current',
            description: 'Get current weather conditions for a city — temperature, humidity, wind, description.',
            category: ToolCategory.API,
            parameters: CurrentSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof CurrentSchema>, _ctx: ToolContext) {
        const units = input.units ?? this.config.units ?? 'metric';
        const data = await owmFetch(getKey(this.config), 'weather', { q: input.location, units }) as {
            name: string;
            sys: { country: string };
            main: { temp: number; feels_like: number; humidity: number };
            weather: Array<{ description: string }>;
            wind: { speed: number };
        };
        return {
            location: data.name,
            country: data.sys.country,
            temperature: data.main.temp,
            feelsLike: data.main.feels_like,
            humidity: data.main.humidity,
            description: data.weather[0]?.description ?? '',
            windSpeed: data.wind.speed,
            units,
        };
    }
}

export class OpenWeatherForecastTool extends BaseTool<typeof ForecastSchema, {
    location: string;
    forecast: Array<{ datetime: string; temperature: number; description: string; humidity: number }>;
}> {
    constructor(private config: OpenWeatherToolConfig = {}) {
        super({
            id: 'openweather_forecast',
            name: 'OpenWeather Forecast',
            description: 'Get a multi-day weather forecast (up to 5 days) for a city.',
            category: ToolCategory.API,
            parameters: ForecastSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ForecastSchema>, _ctx: ToolContext) {
        const units = input.units ?? this.config.units ?? 'metric';
        const cnt = (input.days ?? 3) * 8; // 3-hour intervals
        const data = await owmFetch(getKey(this.config), 'forecast', { q: input.location, units, cnt: String(cnt) }) as {
            city: { name: string };
            list: Array<{ dt_txt: string; main: { temp: number; humidity: number }; weather: Array<{ description: string }> }>;
        };
        return {
            location: data.city.name,
            forecast: data.list.map((item) => ({
                datetime: item.dt_txt,
                temperature: item.main.temp,
                description: item.weather[0]?.description ?? '',
                humidity: item.main.humidity,
            })),
        };
    }
}

export class OpenWeatherToolkit {
    readonly tools: BaseTool[];
    constructor(config: OpenWeatherToolConfig = {}) {
        this.tools = [new OpenWeatherCurrentTool(config), new OpenWeatherForecastTool(config)];
    }
}
