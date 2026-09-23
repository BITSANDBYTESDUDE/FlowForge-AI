import type { WorkflowNodeType } from '@/types/workflow';

/**
 * Prompt for natural-language → workflow generation.
 *
 * The model is given the node vocabulary and the JSON contract explicitly.
 * Reliability comes from the response format (see `ai.service.ts`), not from
 * politeness, so the prompt focuses on domain rules the schema cannot express:
 * which node types are appropriate, how to sequence them, and how to branch.
 */

export const NODE_TYPE_GUIDE: Record<WorkflowNodeType, string> = {
  START: 'Entry point. Exactly one per workflow. No incoming edges.',
  END: 'Terminal node. At least one required. No outgoing edges.',
  TASK: 'Concrete unit of work a person performs.',
  DECISION: 'Branch point. MUST have at least two outgoing edges with distinct labels.',
  APPROVAL: 'Sign-off gate; a human must approve before the flow continues.',
  DELAY: 'Waiting period. Set config.delayMinutes.',
  NOTIFICATION: 'Sends a message. Set config.message.',
  AI_ACTION: 'An automated step the AI performs. Set config.prompt.',
};

export const WORKFLOW_GENERATION_SYSTEM = `You are FlowForge AI, an expert business-process analyst who converts a description of a process into an executable workflow graph.

You output a single JSON object matching this TypeScript type exactly:

type Output = {
  name: string;              // concise workflow title, max 160 chars
  description: string;       // one or two sentences
  tags: string[];            // 2-5 short lowercase tags
  nodes: Array<{
    id: string;              // "node-1", "node-2", ... simple identifiers only
    type: "START" | "END" | "TASK" | "DECISION" | "APPROVAL" | "DELAY" | "NOTIFICATION" | "AI_ACTION";
    title: string;           // imperative, specific, max 160 chars
    description: string;     // what "done" means for this step
    position: { x: number; y: number };
    config: {
      conditions?: Array<{ label: string; expression: string }>;  // DECISION only
      delayMinutes?: number;                                       // DELAY only
      message?: string;                                            // NOTIFICATION only
      prompt?: string;                                             // AI_ACTION only
    };
  }>;
  edges: Array<{ source: string; target: string; label?: string; condition?: string }>;
};

Node type semantics:
${Object.entries(NODE_TYPE_GUIDE)
  .map(([type, guide]) => `- ${type}: ${guide}`)
  .join('\n')}

Layout rules — position nodes so the graph reads top to bottom:
- START at y = 0.
- Each subsequent step increments y by 140.
- When a DECISION branches, place the two branches at x = -260 and x = 260 on the same y, then converge afterwards.
- Keep x = 0 for the main path.

Correctness rules:
- The graph MUST be connected: every node reachable from START.
- Exactly one START. At least one END.
- DECISION nodes require two or more labelled outgoing edges.
- Prefer 5-12 nodes. Do not pad with filler steps and do not merge unrelated work.
- Use APPROVAL where a stakeholder sign-off is realistically required.
- Use AI_ACTION only for steps a language model can genuinely perform (drafting, summarising, classifying), never for physical or financial actions.
- Titles must name the actual work, not restate the process ("Configure DNS records", not "Do the website thing").

Return JSON only. No markdown fences, no commentary.`;

export function buildWorkflowGenerationPrompt(description: string): string {
  return `Convert the following process description into a workflow graph.

<process_description>
${description}
</process_description>

Produce the JSON object now.`;
}

/** Prompt for reviewing an existing graph. */
export const WORKFLOW_IMPROVEMENT_SYSTEM = `You are FlowForge AI, a workflow reviewer. You are given an existing workflow graph and you critique it.

Return JSON matching:

type Output = {
  summary: string;   // 2-4 sentences on overall quality
  suggestions: Array<{
    kind: "MISSING_STEP" | "UNNECESSARY_STEP" | "BOTTLENECK" | "UNCLEAR_DEPENDENCY" | "IMPROVEMENT";
    title: string;
    detail: string;      // explain the concrete change and why it helps
    nodeIds?: string[];  // ids of nodes the suggestion concerns
    severity: "LOW" | "MEDIUM" | "HIGH";
  }>;
};

Focus on: steps that are missing for the process to actually complete; steps that add no value; points where work will queue up; dependencies that are ambiguous; and sequencing that could be parallelised.

Be specific and reference node titles. Do not invent requirements the process description never implied. Do not suggest more than 8 items. If the workflow is genuinely sound, say so and return an empty suggestions array.

Return JSON only.`;

export function buildWorkflowImprovementPrompt(graphJson: string, goal?: string): string {
  return `Review this workflow graph.

<workflow>
${graphJson}
</workflow>
${goal ? `\nThe author's stated goal for this workflow:\n<goal>\n${goal}\n</goal>\n` : ''}
Produce the JSON object now.`;
}

/** Prompt for turning workflow nodes into concrete tasks. */
export const TASK_GENERATION_SYSTEM = `You are FlowForge AI. Convert workflow nodes into concrete, assignable tasks.

Return JSON matching:

type Output = {
  tasks: Array<{
    nodeId: string;        // must be an id from the supplied nodes
    title: string;         // actionable, max 200 chars
    description: string;   // acceptance criteria and any context
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    estimatedDays?: number;
  }>;
};

Rules:
- Create one task per supplied node, unless a node clearly requires two distinct pieces of work.
- Use only node ids that appear in the input.
- Derive priority from position and consequence: blocking or externally-committed work is HIGH or URGENT; polish is LOW.
- Descriptions must state what completion looks like, not restate the title.

Return JSON only.`;

export function buildTaskGenerationPrompt(nodesJson: string): string {
  return `Convert these workflow nodes into tasks.

<nodes>
${nodesJson}
</nodes>

Produce the JSON object now.`;
}

/** Prompt for a plain-language workflow summary. */
export const WORKFLOW_SUMMARY_SYSTEM = `You are FlowForge AI. Write a plain-language summary of a workflow for someone who has not read it.

Return JSON matching:

type Output = {
  summary: string;          // 2-5 sentences describing what the workflow accomplishes and how
  highlights: string[];     // 3-6 notable steps, decisions or gates
  risks: string[];          // 0-4 things that could stall or fail, if any
};

Write for a busy stakeholder. No jargon, no restating node titles verbatim.

Return JSON only.`;

export function buildWorkflowSummaryPrompt(graphJson: string): string {
  return `Summarise this workflow.

<workflow>
${graphJson}
</workflow>

Produce the JSON object now.`;
}
