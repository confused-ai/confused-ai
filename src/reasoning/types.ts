/**
 * Reasoning System — Types
 * ========================
 *
 * ReasoningStep  — one unit of thought (action → result → next_action)
 * NextAction     — what the reasoner does after completing a step
 * ReasoningEvent — typed event stream emitted by ReasoningManager
 */

// ── NextAction ────────────────────────────────────────────────────────────────

export enum NextAction {
    /** More reasoning is needed */
    CONTINUE = 'continue',
    /** Reached a candidate answer; validate before finalising */
    VALIDATE = 'validate',
    /** Confident answer — stop reasoning */
    FINAL_ANSWER = 'final_answer',
    /** Critical error detected — restart from scratch */
    RESET = 'reset',
}

// ── ReasoningStep ─────────────────────────────────────────────────────────────

export interface ReasoningStep {
    /** Short title summarising what this step does */
    title?: string;
    /** What the agent is about to do (first person: "I will…") */
    action?: string;
    /** What happened after executing the action ("I did X and got Y") */
    result?: string;
    /** Rationale, considerations, assumptions */
    reasoning?: string;
    /** Where to go next */
    nextAction?: NextAction;
    /** 0.0–1.0 confidence in this step's correctness */
    confidence?: number;
}

export interface ReasoningSteps {
    reasoningSteps: ReasoningStep[];
}

// ── Reasoning Events ──────────────────────────────────────────────────────────

export enum ReasoningEventType {
    STARTED   = 'reasoning_started',
    STEP      = 'reasoning_step',
    DELTA     = 'reasoning_content_delta',
    COMPLETED = 'reasoning_completed',
    ERROR     = 'reasoning_error',
}

export interface ReasoningEvent {
    eventType: ReasoningEventType;
    /** For STEP events */
    step?: ReasoningStep;
    /** For DELTA events — streaming content fragment */
    contentDelta?: string;
    /** For COMPLETED events */
    steps?: ReasoningStep[];
    /** For ERROR events */
    error?: string;
}

// ── Config & Result ───────────────────────────────────────────────────────────

export interface ReasoningConfig {
    /**
     * LLM callable used to generate each reasoning step.
     * Signature: (messages: Array<{role,content}>) => Promise<string>
     * This keeps the reasoning module provider-agnostic.
     */
    generate: (messages: Array<{ role: string; content: string }>) => Promise<string>;
    /** Minimum number of steps before accepting FINAL_ANSWER */
    minSteps?: number;
    /** Hard cap on steps to prevent runaway loops */
    maxSteps?: number;
    /** System prompt override for the reasoning agent */
    systemPrompt?: string;
    debug?: boolean;
}

export interface ReasoningResult {
    steps: ReasoningStep[];
    success: boolean;
    error?: string;
}
