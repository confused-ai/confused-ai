/**
 * ReasoningManager
 * ================
 * Drives Chain-of-Thought (CoT) reasoning over a conversation.
 * The manager calls a provided `generate` function (any LLM backend) to
 * produce structured `ReasoningStep` objects, then emits `ReasoningEvent`s.
 *
 * Usage:
 *   const manager = new ReasoningManager({
 *     generate: async (messages) => openai.chat(messages),
 *     maxSteps: 8,
 *   });
 *
 *   for await (const event of manager.reason(messages)) {
 *     if (event.eventType === ReasoningEventType.STEP) console.log(event.step);
 *     if (event.eventType === ReasoningEventType.COMPLETED) return event.steps;
 *   }
 */

import {
    NextAction,
    ReasoningEventType,
    type ReasoningConfig,
    type ReasoningEvent,
    type ReasoningResult,
    type ReasoningStep,
} from './types.js';

const DEFAULT_SYSTEM_PROMPT = `You are a meticulous, thoughtful, and logical Reasoning Agent.
Solve complex problems through clear, structured, step-by-step analysis.

For EACH step respond with a JSON object matching this exact schema:
{
  "title": "concise step title",
  "action": "what I will do (first person)",
  "result": "what I did and what I observed (first person)",
  "reasoning": "why this step is necessary",
  "nextAction": "continue" | "validate" | "final_answer" | "reset",
  "confidence": <0.0–1.0>
}

Rules:
- Use "continue" until you have a strong candidate answer.
- Use "validate" to cross-check before committing.
- Use "final_answer" only once validated and confident.
- Use "reset" if you detect a critical error — restart analysis.
- Never combine multiple steps in one response.
- Always provide a confidence score.`;

// ── ReasoningManager ──────────────────────────────────────────────────────────

export class ReasoningManager {
    private readonly config: Required<ReasoningConfig>;

    constructor(config: ReasoningConfig) {
        this.config = {
            generate:     config.generate,
            minSteps:     config.minSteps     ?? 1,
            maxSteps:     config.maxSteps     ?? 10,
            systemPrompt: config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
            debug:        config.debug        ?? false,
        };
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Run CoT reasoning over `messages` and yield `ReasoningEvent`s.
     *
     * Sequence:
     *   STARTED → STEP* → COMPLETED | ERROR
     */
    async *reason(
        messages: Array<{ role: string; content: string }>,
    ): AsyncGenerator<ReasoningEvent, void, unknown> {
        yield { eventType: ReasoningEventType.STARTED };

        const allSteps: ReasoningStep[] = [];
        let stepCount = 0;

        const runMessages = [...messages];

        this._debug('Starting reasoning', { maxSteps: this.config.maxSteps });

        while (stepCount < this.config.maxSteps) {
            stepCount++;
            this._debug(`Step ${stepCount}`);

            let raw: string;
            try {
                raw = await this.config.generate([
                    { role: 'system', content: this.config.systemPrompt },
                    ...runMessages,
                ]);
            } catch (err) {
                yield {
                    eventType: ReasoningEventType.ERROR,
                    error: `LLM call failed: ${String(err)}`,
                };
                return;
            }

            const step = this._parseStep(raw);
            if (!step) {
                yield {
                    eventType: ReasoningEventType.ERROR,
                    error: `Could not parse reasoning step from: ${raw.slice(0, 200)}`,
                };
                return;
            }

            allSteps.push(step);
            yield { eventType: ReasoningEventType.STEP, step };

            // Append assistant response to running context
            runMessages.push({ role: 'assistant', content: raw });

            const next = step.nextAction ?? NextAction.CONTINUE;

            if (next === NextAction.RESET) {
                // Restart — drop accumulated context
                this._debug('Reset triggered — restarting');
                runMessages.splice(messages.length); // trim back to original
                allSteps.length = 0;
                stepCount = 0;
                continue;
            }

            if (next === NextAction.FINAL_ANSWER && stepCount >= this.config.minSteps) {
                break;
            }
        }

        this._debug(`Reasoning complete — ${allSteps.length} steps`);
        yield { eventType: ReasoningEventType.COMPLETED, steps: allSteps };
    }

    /**
     * Collect all steps and return a `ReasoningResult` (non-streaming).
     */
    async run(
        messages: Array<{ role: string; content: string }>,
    ): Promise<ReasoningResult> {
        const steps: ReasoningStep[] = [];
        try {
            for await (const event of this.reason(messages)) {
                if (event.eventType === ReasoningEventType.STEP && event.step) {
                    steps.push(event.step);
                }
                if (event.eventType === ReasoningEventType.ERROR) {
                    return { steps, success: false, error: event.error };
                }
            }
            return { steps, success: true };
        } catch (err) {
            return { steps, success: false, error: String(err) };
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private _parseStep(raw: string): ReasoningStep | null {
        // Strip markdown fences if present
        const cleaned = raw
            .replace(/^```(?:json)?\s*/m, '')
            .replace(/\s*```\s*$/m, '')
            .trim();

        // Find the first JSON object in the string
        const start = cleaned.indexOf('{');
        const end   = cleaned.lastIndexOf('}');
        if (start === -1 || end === -1) return null;

        try {
            const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
            const step: ReasoningStep = {};
            if (typeof parsed.title      === 'string') step.title      = parsed.title;
            if (typeof parsed.action     === 'string') step.action     = parsed.action;
            if (typeof parsed.result     === 'string') step.result     = parsed.result;
            if (typeof parsed.reasoning  === 'string') step.reasoning  = parsed.reasoning;
            if (typeof parsed.confidence === 'number') step.confidence = parsed.confidence;
            if (typeof parsed.nextAction === 'string') {
                const na = parsed.nextAction as string;
                if (Object.values(NextAction).includes(na as NextAction)) {
                    step.nextAction = na as NextAction;
                }
            }
            return step;
        } catch {
            return null;
        }
    }

    private _debug(label: string, data?: unknown): void {
        if (this.config.debug) {
            console.debug(`[ReasoningManager] ${label}`, data ?? '');
        }
    }
}

export { DEFAULT_SYSTEM_PROMPT as REASONING_SYSTEM_PROMPT };
