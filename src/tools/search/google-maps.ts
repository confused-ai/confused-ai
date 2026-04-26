/**
 * Google Maps tools — places search, geocoding, directions, and place details.
 * API key: https://console.cloud.google.com (enable Maps, Places, Geocoding, Directions APIs)
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool.js';
import { ToolCategory, type ToolContext } from '../core/types.js';

export interface GoogleMapsToolConfig {
    /** Google Maps API key (or GOOGLE_MAPS_API_KEY env var) */
    apiKey?: string;
}

function getKey(config: GoogleMapsToolConfig): string {
    const key = config.apiKey ?? process.env.GOOGLE_MAPS_API_KEY;
    if (!key) throw new Error('GoogleMapsTools require GOOGLE_MAPS_API_KEY');
    return key;
}

async function mapsGet(apiKey: string, service: string, params: Record<string, string>): Promise<unknown> {
    const p = new URLSearchParams({ ...params, key: apiKey });
    const res = await fetch(`https://maps.googleapis.com/maps/api/${service}/json?${p}`);
    if (!res.ok) throw new Error(`Google Maps API ${res.status}: ${await res.text()}`);
    const data = await res.json() as { status: string; error_message?: string };
    if (!['OK', 'ZERO_RESULTS'].includes(data.status)) {
        throw new Error(`Google Maps error ${data.status}: ${data.error_message ?? ''}`);
    }
    return data;
}

// ── Schemas ────────────────────────────────────────────────────────────────

const SearchPlacesSchema = z.object({
    query: z.string().describe('Text search query (e.g. "coffee shops near Times Square")'),
    location: z.string().optional().describe('Bias results around "lat,lng" (e.g. "40.7580,-73.9855")'),
    radius: z.number().int().min(1).max(50000).optional().default(5000).describe('Search radius in metres'),
    type: z.string().optional().describe('Place type (e.g. restaurant, hospital, museum)'),
    maxResults: z.number().int().min(1).max(20).optional().default(5),
});

const GeocodeSchema = z.object({
    address: z.string().describe('Address or place name to geocode'),
});

const ReverseGeocodeSchema = z.object({
    lat: z.number().describe('Latitude'),
    lng: z.number().describe('Longitude'),
});

const DirectionsSchema = z.object({
    origin: z.string().describe('Starting address or place'),
    destination: z.string().describe('Ending address or place'),
    mode: z.enum(['driving', 'walking', 'bicycling', 'transit']).optional().default('driving'),
    waypoints: z.array(z.string()).optional().describe('Intermediate stops'),
});

const PlaceDetailsSchema = z.object({
    placeId: z.string().describe('Google Place ID'),
    fields: z.array(z.string()).optional().default(['name', 'formatted_address', 'rating', 'opening_hours', 'website', 'formatted_phone_number']),
});

// ── Tools ──────────────────────────────────────────────────────────────────

export class GoogleMapsSearchPlacesTool extends BaseTool<typeof SearchPlacesSchema, {
    places: Array<{ placeId: string; name: string; address: string; rating?: number; types: string[]; location: { lat: number; lng: number } }>;
}> {
    constructor(private config: GoogleMapsToolConfig = {}) {
        super({
            id: 'google_maps_search_places',
            name: 'Google Maps Search Places',
            description: 'Search for places by text query (restaurants, hotels, attractions, etc.).',
            category: ToolCategory.API,
            parameters: SearchPlacesSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof SearchPlacesSchema>, _ctx: ToolContext) {
        const params: Record<string, string> = { query: input.query, radius: String(input.radius ?? 5000) };
        if (input.location) params.location = input.location;
        if (input.type) params.type = input.type;

        const data = await mapsGet(getKey(this.config), 'place/textsearch', params) as {
            results: Array<{
                place_id: string;
                name: string;
                formatted_address: string;
                rating?: number;
                types: string[];
                geometry: { location: { lat: number; lng: number } };
            }>;
        };

        const places = (data.results ?? []).slice(0, input.maxResults ?? 5).map((r) => ({
            placeId: r.place_id,
            name: r.name,
            address: r.formatted_address,
            rating: r.rating,
            types: r.types,
            location: r.geometry.location,
        }));
        return { places };
    }
}

export class GoogleMapsGeocodeTool extends BaseTool<typeof GeocodeSchema, {
    address: string;
    formattedAddress: string;
    location: { lat: number; lng: number };
    placeId: string;
}> {
    constructor(private config: GoogleMapsToolConfig = {}) {
        super({
            id: 'google_maps_geocode',
            name: 'Google Maps Geocode',
            description: 'Convert an address or place name to latitude/longitude coordinates.',
            category: ToolCategory.API,
            parameters: GeocodeSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof GeocodeSchema>, _ctx: ToolContext) {
        const data = await mapsGet(getKey(this.config), 'geocode', { address: input.address }) as {
            results: Array<{
                formatted_address: string;
                geometry: { location: { lat: number; lng: number } };
                place_id: string;
            }>;
        };
        const r = data.results[0];
        if (!r) throw new Error('No geocoding results found');
        return {
            address: input.address,
            formattedAddress: r.formatted_address,
            location: r.geometry.location,
            placeId: r.place_id,
        };
    }
}

export class GoogleMapsReverseGeocodeTool extends BaseTool<typeof ReverseGeocodeSchema, {
    formattedAddress: string;
    components: Array<{ types: string[]; longName: string; shortName: string }>;
}> {
    constructor(private config: GoogleMapsToolConfig = {}) {
        super({
            id: 'google_maps_reverse_geocode',
            name: 'Google Maps Reverse Geocode',
            description: 'Convert latitude/longitude coordinates to a human-readable address.',
            category: ToolCategory.API,
            parameters: ReverseGeocodeSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof ReverseGeocodeSchema>, _ctx: ToolContext) {
        const data = await mapsGet(getKey(this.config), 'geocode', { latlng: `${input.lat},${input.lng}` }) as {
            results: Array<{
                formatted_address: string;
                address_components: Array<{ long_name: string; short_name: string; types: string[] }>;
            }>;
        };
        const r = data.results[0];
        if (!r) throw new Error('No reverse geocoding results found');
        return {
            formattedAddress: r.formatted_address,
            components: r.address_components.map((c) => ({
                types: c.types,
                longName: c.long_name,
                shortName: c.short_name,
            })),
        };
    }
}

export class GoogleMapsDirectionsTool extends BaseTool<typeof DirectionsSchema, {
    summary: string;
    distanceText: string;
    durationText: string;
    steps: Array<{ instruction: string; distance: string; duration: string }>;
}> {
    constructor(private config: GoogleMapsToolConfig = {}) {
        super({
            id: 'google_maps_directions',
            name: 'Google Maps Directions',
            description: 'Get turn-by-turn directions between two locations. Supports driving, walking, cycling, and transit.',
            category: ToolCategory.API,
            parameters: DirectionsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 15000 },
        });
    }

    protected async performExecute(input: z.infer<typeof DirectionsSchema>, _ctx: ToolContext) {
        const params: Record<string, string> = {
            origin: input.origin,
            destination: input.destination,
            mode: input.mode ?? 'driving',
        };
        if (input.waypoints?.length) params.waypoints = input.waypoints.join('|');

        const data = await mapsGet(getKey(this.config), 'directions', params) as {
            routes: Array<{
                summary: string;
                legs: Array<{
                    distance: { text: string };
                    duration: { text: string };
                    steps: Array<{
                        html_instructions: string;
                        distance: { text: string };
                        duration: { text: string };
                    }>;
                }>;
            }>;
        };

        const route = data.routes[0];
        if (!route) throw new Error('No route found');
        const leg = route.legs[0];

        const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '');
        return {
            summary: route.summary,
            distanceText: leg.distance.text,
            durationText: leg.duration.text,
            steps: leg.steps.map((s) => ({
                instruction: stripHtml(s.html_instructions),
                distance: s.distance.text,
                duration: s.duration.text,
            })),
        };
    }
}

export class GoogleMapsPlaceDetailsTool extends BaseTool<typeof PlaceDetailsSchema, Record<string, unknown>> {
    constructor(private config: GoogleMapsToolConfig = {}) {
        super({
            id: 'google_maps_place_details',
            name: 'Google Maps Place Details',
            description: 'Get detailed information about a place — hours, phone, website, rating, reviews.',
            category: ToolCategory.API,
            parameters: PlaceDetailsSchema,
            permissions: { allowNetwork: true, allowFileSystem: false, maxExecutionTimeMs: 10000 },
        });
    }

    protected async performExecute(input: z.infer<typeof PlaceDetailsSchema>, _ctx: ToolContext) {
        const data = await mapsGet(getKey(this.config), 'place/details', {
            place_id: input.placeId,
            fields: (input.fields ?? []).join(','),
        }) as { result: Record<string, unknown> };
        return data.result ?? {};
    }
}

export class GoogleMapsToolkit {
    readonly tools: BaseTool[];
    constructor(config: GoogleMapsToolConfig = {}) {
        this.tools = [
            new GoogleMapsSearchPlacesTool(config),
            new GoogleMapsGeocodeTool(config),
            new GoogleMapsReverseGeocodeTool(config),
            new GoogleMapsDirectionsTool(config),
            new GoogleMapsPlaceDetailsTool(config),
        ];
    }
}
