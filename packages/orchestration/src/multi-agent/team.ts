/**
 * Team Concept
 *
 * Orchestrates multiple agents working together on a shared task.
 * Features:
 * - Task decomposition and delegation
 * - Agent specialization (different tools per agent)
 * - Result aggregation and synthesis
 * - Inter-agent communication
 */

import type { AgenticRunResult } from '@confused-ai/agentic';
import type { AgenticRunner } from '@confused-ai/agentic';

/**
 * Agent definition in a team
 */
export interface TeamAgent {
    /**
     * Unique agent ID
     */
    id: string;

    /**
     * Display name
     */
    name: string;

    /**
     * Runner instance
     */
    runner: AgenticRunner;

    /**
     * System instructions
     */
    instructions: string;

    /**
     * Optional specialization tags (e.g., "research", "analysis", "summary")
     */
    tags?: string[];
}

/**
 * Team configuration
 */
export interface TeamConfig {
    /**
     * Team name
     */
    name: string;

    /**
     * Team members
     */
    agents: TeamAgent[];

    /**
     * Team orchestration strategy
     */
    strategy?: 'parallel' | 'sequential' | 'hierarchical';

    /**
     * Optional director/leader agent (for hierarchical teams)
     */
    directorAgent?: TeamAgent;

    /**
     * Max attempts per task
     */
    maxAttempts?: number;

    /**
     * Timeout for team run (ms)
     */
    timeoutMs?: number;
}

/**
 * Result from a team member
 */
export interface TeamMemberResult {
    /**
     * Agent ID
     */
    agentId: string;

    /**
     * Agent name
     */
    agentName: string;

    /**
     * The result
     */
    result: AgenticRunResult;

    /**
     * Task assigned to this agent
     */
    task?: string;

    /**
     * Whether this was successful
     */
    success: boolean;

    /**
     * Timestamp
     */
    timestamp: number;
}

/**
 * Final team result
 */
export interface TeamResult {
    /**
     * Original task
     */
    task: string;

    /**
     * Results from all team members
     */
    results: TeamMemberResult[];

    /**
     * Synthesized final answer
     */
    synthesis?: string;

    /**
     * Total runtime (ms)
     */
    duration: number;

    /**
     * Whether all agents succeeded
     */
    allSuccess: boolean;

    /**
     * Timestamp
     */
    timestamp: number;
}

/**
 * Team orchestrator
 */
export class Team {
    private config: Required<Omit<TeamConfig, 'directorAgent'>> & { directorAgent?: TeamAgent };

    constructor(config: TeamConfig) {
        if (config.agents.length === 0) {
            throw new Error('Team must have at least one agent');
        }

        this.config = {
            name: config.name,
            agents: config.agents,
            strategy: config.strategy ?? 'parallel',
            maxAttempts: config.maxAttempts ?? 3,
            timeoutMs: config.timeoutMs ?? 300_000,
            directorAgent: config.directorAgent,
        };
    }

    /**
     * Run the team on a given task
     * Delegates to agents and synthesizes results
     */
    async run(task: string, context?: Record<string, unknown>): Promise<TeamResult> {
        const startTime = Date.now();

        try {
            // Parallel strategy: run all agents concurrently
            if (this.config.strategy === 'parallel') {
                return await this.runParallel(task, context);
            }

            // Sequential strategy: run agents one by one
            if (this.config.strategy === 'sequential') {
                return await this.runSequential(task, context);
            }

            // Hierarchical strategy: director delegates to specialists
            if (this.config.strategy === 'hierarchical') {
                return await this.runHierarchical(task, context);
            }

            throw new Error(`Unknown strategy: ${this.config.strategy}`);
        } catch (error) {
            const duration = Date.now() - startTime;
            return {
                task,
                results: [],
                synthesis: error instanceof Error ? error.message : String(error),
                duration,
                allSuccess: false,
                timestamp: Date.now(),
            };
        }
    }

    /**
     * Run all agents in parallel
     */
    private async runParallel(task: string, context?: Record<string, unknown>): Promise<TeamResult> {
        const startTime = Date.now();

        const promises = this.config.agents.map((agent) =>
            this.runAgent(agent, task, context).then((result) => ({
                agentId: agent.id,
                agentName: agent.name,
                result,
                task,
                success: !result.finishReason.includes('error'),
                timestamp: Date.now(),
            })),
        );

        const results = await Promise.all(promises);
        const duration = Date.now() - startTime;
        const allSuccess = results.every((r) => r.success);

        return {
            task,
            results,
            synthesis: await this.synthesizeResults(results),
            duration,
            allSuccess,
            timestamp: Date.now(),
        };
    }

    /**
     * Run agents sequentially, passing outputs as context
     */
    private async runSequential(task: string, context?: Record<string, unknown>): Promise<TeamResult> {
        const startTime = Date.now();
        const results: TeamMemberResult[] = [];
        let currentContext = { ...context, originalTask: task };

        for (const agent of this.config.agents) {
            const agentTask = `${task}\n\nPrevious context:\n${JSON.stringify(currentContext, null, 2)}`;

            const result = await this.runAgent(agent, agentTask, currentContext);

            results.push({
                agentId: agent.id,
                agentName: agent.name,
                result,
                task: agentTask,
                success: !result.finishReason.includes('error'),
                timestamp: Date.now(),
            });

            // Use this agent's output as context for the next
            currentContext = {
                ...currentContext,
                [`${agent.id}_output`]: result.text,
            };
        }

        const duration = Date.now() - startTime;
        const allSuccess = results.every((r) => r.success);

        return {
            task,
            results,
            synthesis: await this.synthesizeResults(results),
            duration,
            allSuccess,
            timestamp: Date.now(),
        };
    }

    /**
     * Run with a director agent delegating to specialists
     */
    private async runHierarchical(task: string, context?: Record<string, unknown>): Promise<TeamResult> {
        const startTime = Date.now();

        if (!this.config.directorAgent) {
            // Fall back to parallel if no director
            return this.runParallel(task, context);
        }

        // Director decomposes the task
        const directorPrompt = `You are a team director. Break down the following task into subtasks for your team members:
        
Team members and their specialties:
${this.config.agents.map((a) => `- ${a.name} (${a.tags?.join(', ') || 'general'}): ${a.instructions}`).join('\n')}

Task: ${task}

Respond with a JSON object mapping each team member to their subtask.
Format: { "agent_id": "subtask description", ... }`;

        const directorResult = await this.config.directorAgent.runner.run({
            instructions: 'You are a task decomposition expert.',
            prompt: directorPrompt,
        });

        let subtasks: Record<string, string> = {};
        try {
            const jsonMatch = directorResult.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                subtasks = JSON.parse(jsonMatch[0]);
            }
        } catch {
            // If parsing fails, assign whole task to all agents
            subtasks = Object.fromEntries(
                this.config.agents.map((a) => [a.id, task]),
            );
        }

        // Run specialists in parallel
        const promises = this.config.agents.map((agent) => {
            const subtask = subtasks[agent.id] || task;
            return this.runAgent(agent, subtask, context).then((result) => ({
                agentId: agent.id,
                agentName: agent.name,
                result,
                task: subtask,
                success: !result.finishReason.includes('error'),
                timestamp: Date.now(),
            }));
        });

        const results = await Promise.all(promises);
        const duration = Date.now() - startTime;
        const allSuccess = results.every((r) => r.success);

        return {
            task,
            results,
            synthesis: await this.synthesizeResults(results),
            duration,
            allSuccess,
            timestamp: Date.now(),
        };
    }

    /**
     * Run a single agent on a task
     */
    private async runAgent(
        agent: TeamAgent,
        task: string,
        context?: Record<string, unknown>,
    ): Promise<AgenticRunResult> {
        const prompt = `${task}${context ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : ''}`;

        return agent.runner.run({
            instructions: agent.instructions,
            prompt,
            maxSteps: 10,
            timeoutMs: this.config.timeoutMs,
        });
    }

    /**
     * Synthesize results from all agents into a final answer
     */
    private async synthesizeResults(results: TeamMemberResult[]): Promise<string> {
        if (results.length === 0) return '';

        const summaries = results
            .map((r) => `${r.agentName}: ${r.result.text}`)
            .join('\n\n');

        return `# Team Results\n\n${summaries}`;
    }

    /**
     * Get team statistics
     */
    getStats(): {
        agentCount: number;
        strategy: string;
        agents: Array<{ id: string; name: string; tags?: string[] }>;
    } {
        return {
            agentCount: this.config.agents.length,
            strategy: this.config.strategy,
            agents: this.config.agents.map((a) => ({
                id: a.id,
                name: a.name,
                tags: a.tags,
            })),
        };
    }
}

/**
 * Create a specialized team for common tasks
 */
export function createResearchTeam(runners: {
    research: AgenticRunner;
    analysis: AgenticRunner;
    summary: AgenticRunner;
}): Team {
    return new Team({
        name: 'Research Team',
        strategy: 'sequential',
        agents: [
            {
                id: 'researcher',
                name: 'Research Agent',
                runner: runners.research,
                instructions:
                    'Your role is to gather comprehensive information and research on the given topic. Be thorough and cite sources where possible.',
                tags: ['research', 'gathering'],
            },
            {
                id: 'analyst',
                name: 'Analysis Agent',
                runner: runners.analysis,
                instructions:
                    'Your role is to analyze the research findings, identify patterns, and draw insights. Be critical and analytical.',
                tags: ['analysis', 'interpretation'],
            },
            {
                id: 'summarizer',
                name: 'Summary Agent',
                runner: runners.summary,
                instructions:
                    'Your role is to synthesize the analysis into a clear, concise summary suitable for decision-makers.',
                tags: ['summary', 'synthesis'],
            },
        ],
    });
}

/**
 * Create a specialized team for decision-making
 */
export function createDecisionTeam(runners: {
    advocate: AgenticRunner;
    criticalThinker: AgenticRunner;
    synthesizer: AgenticRunner;
}): Team {
    return new Team({
        name: 'Decision Team',
        strategy: 'parallel',
        agents: [
            {
                id: 'advocate',
                name: 'Advocate',
                runner: runners.advocate,
                instructions: 'Argue strongly in favor of the proposed option. Make the best case you can.',
                tags: ['advocacy'],
            },
            {
                id: 'critic',
                name: 'Critical Thinker',
                runner: runners.criticalThinker,
                instructions: 'Play devils advocate. Identify weaknesses and risks. Be skeptical.',
                tags: ['criticism', 'risk-analysis'],
            },
            {
                id: 'synthesizer',
                name: 'Synthesizer',
                runner: runners.synthesizer,
                instructions:
                    'Review all perspectives and provide a balanced recommendation with pros/cons.',
                tags: ['synthesis', 'decision'],
            },
        ],
    });
}
