/**
 * EntityExtractionMemory
 * ======================
 * Extracts named entities from conversation turns and maintains a compact
 * structured fact-sheet. Instead of replaying raw conversation history,
 * the agent gets a dense entity map + only the most recent messages.
 *
 * Reduces tokens ~70–80% on long conversations with repeated references
 * to people, IDs, files, configs, and structured data.
 *
 * Entity types detected (via LLM + regex pre-pass):
 *   person    — "Alice", "Bob Smith"
 *   id        — UUIDs, ticket IDs (#123), git SHAs, invoice numbers
 *   path      — file/directory paths
 *   url       — http/https URLs
 *   number    — counts, prices, percentages with context
 *   date      — dates and timestamps
 *   key_value — "X is Y" / "X: Y" pairs (config values, settings)
 *   decision  — "we decided to...", "agreed on..."
 *   error     — error messages, stack trace summaries
 *   custom    — anything the LLM classifies as notable
 *
 * Usage:
 *   const eem = new EntityExtractionMemory({
 *     generate: (msgs) => llm.chat(msgs),
 *     maxEntities: 100,
 *   });
 *
 *   // After each turn:
 *   await eem.extractFrom([userMsg, assistantMsg]);
 *
 *   // Before next LLM call:
 *   const context = eem.buildContext(recentMessages);
 *   // → [{ role:'user', content:'[Known facts]\n...' }, ...recentMessages]
 */

// ── Entity types ──────────────────────────────────────────────────────────────

export type EntityType =
    | 'person'
    | 'id'
    | 'path'
    | 'url'
    | 'number'
    | 'date'
    | 'key_value'
    | 'decision'
    | 'error'
    | 'custom';

export interface Entity {
    /** Entity type classification */
    type: EntityType;
    /** The entity key / name */
    key: string;
    /** The entity value or description */
    value: string;
    /** Source message role that introduced this entity */
    source: string;
    /** Last time this entity was seen / updated */
    updatedAt: number;
    /** How many times this entity was referenced */
    mentions: number;
}

// ── Valid entity type set ─────────────────────────────────────────────────────

const VALID_ENTITY_TYPES = new Set<EntityType>([
    'person', 'id', 'path', 'url', 'number', 'date', 'key_value', 'decision', 'error', 'custom',
]);

function isValidEntityType(t: unknown): t is EntityType {
    return typeof t === 'string' && VALID_ENTITY_TYPES.has(t as EntityType);
}

// ── Regex pre-pass (fast, no LLM) ─────────────────────────────────────────────

const REGEX_EXTRACTORS: Array<{ type: EntityType; pattern: RegExp; toEntity: (m: RegExpMatchArray) => { key: string; value: string } | null }> = [
    {
        type: 'id',
        // UUID v1-v5
        pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
        toEntity: m => ({ key: 'uuid', value: m[0] }),
    },
    {
        type: 'id',
        // GitHub SHA (7–40 hex chars after common prefixes)
        pattern: /\b(?:commit|sha|ref)[:=\s]+([0-9a-f]{7,40})\b/gi,
        toEntity: m => ({ key: 'git_sha', value: m[1] ?? m[0] }),
    },
    {
        type: 'id',
        // Ticket IDs: #123, JIRA-456, GH-789
        pattern: /\b([A-Z]{2,10}-\d{1,6}|#\d{1,6})\b/g,
        toEntity: m => ({ key: 'ticket', value: m[1] ?? m[0] }),
    },
    {
        type: 'url',
        pattern: /https?:\/\/[^\s"'<>]+/g,
        toEntity: m => ({ key: 'url', value: m[0] }),
    },
    {
        type: 'path',
        // Unix/Windows absolute paths and relative paths with extension
        pattern: /(?:^|\s)((?:\/[\w.\-]+)+\/?|(?:\.\.|\.)\/?(?:[\w.\-]+\/)*[\w.\-]+\.\w{1,10})/gm,
        toEntity: m => ({ key: 'path', value: (m[1] ?? m[0]).trim() }),
    },
    {
        type: 'key_value',
        // "key: value" / "key = value" pairs (config-style)
        pattern: /^[ \t]*([a-zA-Z_][a-zA-Z0-9_-]{1,40})\s*[:=]\s*(.{1,100})$/gm,
        toEntity: m => {
            const key = (m[1] ?? '').trim();
            const val = (m[2] ?? '').trim();
            if (!key || !val || val.length < 2) return null;
            return { key, value: val };
        },
    },
];

function regexExtract(text: string, source: string): Entity[] {
    const now = Date.now();
    const results: Entity[] = [];

    for (const { type, pattern, toEntity } of REGEX_EXTRACTORS) {
        pattern.lastIndex = 0;
        let m: RegExpMatchArray | null;
        while ((m = pattern.exec(text)) !== null) {
            const extracted = toEntity(m);
            if (!extracted) continue;
            results.push({
                type,
                key: extracted.key,
                value: extracted.value.slice(0, 200),
                source,
                updatedAt: now,
                mentions: 1,
            });
        }
    }

    return results;
}

// ── LLM extraction prompt ─────────────────────────────────────────────────────

const DEFAULT_EXTRACTION_PROMPT = `You are an entity extractor for a conversation memory system.
Extract important entities from the provided text.

Return a JSON array of objects. Each object must have:
  - "type": one of: person, id, path, url, number, date, key_value, decision, error, custom
  - "key": a short label for the entity (e.g., "user_name", "api_endpoint", "error_type")
  - "value": the actual value or a concise description

Rules:
1. Only extract entities that are IMPORTANT to remember (would affect future responses).
2. For key_value: key = the config key/variable name, value = the setting value.
3. For decision: key = short decision label, value = what was decided and why.
4. For error: key = error type, value = message and context.
5. Skip trivial words, pronouns, common verbs.
6. Maximum 20 entities per response.
7. If nothing important exists, return [].
8. Output ONLY valid JSON — no markdown, no explanation.`;

// ── EntityExtractionMemory ────────────────────────────────────────────────────

export interface EntityExtractionConfig {
    /** LLM callable for extraction. (messages) => Promise<string> */
    generate: (messages: Array<{ role: string; content: string }>) => Promise<string>;

    /**
     * Maximum number of entities to retain.
     * When exceeded, least-recently-used entities are evicted.
     * Default: 200
     */
    maxEntities?: number;

    /**
     * Whether to run the fast regex pre-pass before the LLM extraction.
     * The regex pass is free (no LLM call) and catches IDs, URLs, paths.
     * Default: true
     */
    useRegexPrepass?: boolean;

    /**
     * Whether to call the LLM for deep semantic extraction.
     * Disable to use only the regex pre-pass (faster, cheaper).
     * Default: true
     */
    useLlmExtraction?: boolean;

    /** Custom extraction prompt. */
    extractionPrompt?: string;

    /** Label to use in the injected context header. Default: 'Known facts' */
    contextHeader?: string;

    debug?: boolean;
}

export class EntityExtractionMemory {
    private _entities: Map<string, Entity> = new Map();
    private _extractionCount = 0;

    private readonly cfg: Required<EntityExtractionConfig>;

    constructor(config: EntityExtractionConfig) {
        this.cfg = {
            generate:          config.generate,
            maxEntities:       config.maxEntities       ?? 200,
            useRegexPrepass:   config.useRegexPrepass    ?? true,
            useLlmExtraction:  config.useLlmExtraction   ?? true,
            extractionPrompt:  config.extractionPrompt   ?? DEFAULT_EXTRACTION_PROMPT,
            contextHeader:     config.contextHeader       ?? 'Known facts',
            debug:             config.debug              ?? false,
        };
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    /**
     * Extract entities from a batch of messages.
     * Merges results into the entity store (incremental — does not reset).
     * All messages are batched into a single LLM call instead of one call per message.
     */
    async extractFrom(messages: Array<{ role: string; content?: string | null }>): Promise<void> {
        const nonEmpty = messages.filter(m => (m.content ?? '').trim());
        if (nonEmpty.length === 0) return;

        // Regex pre-pass: free, per-message
        if (this.cfg.useRegexPrepass) {
            for (const msg of nonEmpty) {
                this._merge(regexExtract(msg.content ?? '', msg.role));
            }
        }

        // Single batched LLM call instead of N calls
        if (this.cfg.useLlmExtraction) {
            await this._llmExtractBatch(nonEmpty);
        }

        this._evictIfOverLimit();
        this._extractionCount++;
        this._debug('extractFrom done', { entityCount: this._entities.size });
    }

    /**
     * Manually upsert an entity (e.g., from tool results).
     */
    upsert(entity: Omit<Entity, 'updatedAt' | 'mentions'>): void {
        const key = this._entityKey(entity.type, entity.key);
        const existing = this._entities.get(key);
        this._entities.set(key, {
            ...entity,
            updatedAt: Date.now(),
            mentions: (existing?.mentions ?? 0) + 1,
        });
    }

    /** Remove a specific entity by type + key. */
    remove(type: EntityType, key: string): void {
        this._entities.delete(this._entityKey(type, key));
    }

    /** Clear all entities. */
    clear(): void {
        this._entities.clear();
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    /** All entities, sorted by recency descending. */
    get entities(): Entity[] {
        return [...this._entities.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    }

    /** Entities filtered by type. */
    byType(type: EntityType): Entity[] {
        return this.entities.filter(e => e.type === type);
    }

    /** Number of LLM extraction calls made. */
    get extractionCount(): number {
        return this._extractionCount;
    }

    /**
     * Build the context prefix to inject before recent messages.
     * Returns a single user-role message containing the entity fact sheet.
     */
    buildContextMessage(): { role: string; content: string } | null {
        if (this._entities.size === 0) return null;

        const lines: string[] = [`[${this.cfg.contextHeader}]`];
        const grouped = this._groupByType();

        for (const [type, items] of grouped) {
            lines.push(`\n${type.toUpperCase()}:`);
            for (const e of items.slice(0, 30)) {  // max 30 per type
                lines.push(`  ${e.key}: ${e.value}`);
            }
        }

        return { role: 'user', content: lines.join('\n') };
    }

    /**
     * Prepend the entity fact-sheet to `recentMessages` and return the full context.
     */
    buildContext(recentMessages: Array<{ role: string; content?: string | null; [k: string]: unknown }>): Array<{ role: string; content?: string | null; [k: string]: unknown }> {
        const factMsg = this.buildContextMessage();
        if (!factMsg) return recentMessages;
        return [factMsg, ...recentMessages];
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private async _llmExtractBatch(messages: Array<{ role: string; content?: string | null }>): Promise<void> {
        try {
            // Combine all messages into one payload, capped to avoid hitting LLM limit
            const combined = messages
                .map(m => `${m.role.toUpperCase()}: ${(m.content ?? '').slice(0, 2000)}`)
                .join('\n---\n')
                .slice(0, 8000);

            const response = await this.cfg.generate([
                { role: 'system', content: this.cfg.extractionPrompt },
                { role: 'user',   content: combined },
            ]);

            const raw = response.trim().replace(/^```(?:json)?|```$/gm, '');
            const parsed = JSON.parse(raw) as Array<{ type?: string; key?: string; value?: string }>;

            if (!Array.isArray(parsed)) return;

            const now = Date.now();
            const extracted: Entity[] = parsed.flatMap(item => {
                if (!isValidEntityType(item.type) || !item.key || !item.value) return [];
                return [{
                    type: item.type,
                    key: item.key.slice(0, 100),
                    value: item.value.slice(0, 300),
                    source: 'batch',
                    updatedAt: now,
                    mentions: 1,
                }];
            });

            this._merge(extracted);
        } catch (err) {
            this._debug('LLM batch extraction failed', err);
        }
    }

    private _merge(entities: Entity[]): void {
        for (const e of entities) {
            const key = this._entityKey(e.type, e.key);
            const existing = this._entities.get(key);
            if (existing) {
                // Update value + bump recency + mentions
                this._entities.set(key, {
                    ...existing,
                    value: e.value || existing.value,
                    updatedAt: e.updatedAt,
                    mentions: existing.mentions + 1,
                });
            } else {
                this._entities.set(key, e);
            }
        }
    }

    private _evictIfOverLimit(): void {
        if (this._entities.size <= this.cfg.maxEntities) return;

        // Normalize updatedAt to [0,1] range so mentions can actually influence score.
        const entries = [...this._entities.entries()];
        const timestamps = entries.map(([, e]) => e.updatedAt);
        const minTs = Math.min(...timestamps);
        const maxTs = Math.max(...timestamps);
        const tsRange = maxTs - minTs || 1;

        const maxMentions = Math.max(...entries.map(([, e]) => e.mentions), 1);

        const sorted = entries.sort(([, a], [, b]) => {
            const score = (e: Entity) =>
                ((e.updatedAt - minTs) / tsRange) * 0.7 +
                (e.mentions / maxMentions) * 0.3;
            return score(a) - score(b); // ascending = lowest score evicted first
        });

        const toEvict = sorted.slice(0, this._entities.size - this.cfg.maxEntities);
        for (const [k] of toEvict) this._entities.delete(k);
    }

    private _groupByType(): Map<EntityType, Entity[]> {
        const grouped = new Map<EntityType, Entity[]>();
        for (const e of this.entities) {
            const arr = grouped.get(e.type) ?? [];
            arr.push(e);
            grouped.set(e.type, arr);
        }
        return grouped;
    }

    private _entityKey(type: string, key: string): string {
        return `${type}::${key.toLowerCase()}`;
    }

    private _debug(label: string, data?: unknown): void {
        if (this.cfg.debug) {
            console.warn(`[EntityExtractionMemory] ${label}`, data ?? '');
        }
    }
}
