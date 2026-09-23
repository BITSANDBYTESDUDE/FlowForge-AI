import { z } from 'zod';
import { getAiProvider, isAiConfigured, type AiProvider } from '@/lib/ai/provider';
import { zodToStrictJsonSchema } from '@/lib/ai/json-schema';
import {
  aiImprovementSchema,
  aiSummarySchema,
  aiTaskListSchema,
  aiWorkflowSchema,
  type AiImprovementOutput,
  type AiSummaryOutput,
  type AiTaskListOutput,
  type AiWorkflowOutput,
} from '@/lib/ai/schemas/workflow-output';
import {
  TASK_GENERATION_SYSTEM,
  WORKFLOW_GENERATION_SYSTEM,
  WORKFLOW_IMPROVEMENT_SYSTEM,
  WORKFLOW_SUMMARY_SYSTEM,
  buildTaskGenerationPrompt,
  buildWorkflowGenerationPrompt,
  buildWorkflowImprovementPrompt,
  buildWorkflowSummaryPrompt,
} from '@/lib/ai/prompts/workflow-generation';
import { AiInvalidOutputError, ValidationError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { WorkflowNodeType } from '@/types/workflow';

/**
 * AI service.
 *
 * Every public function follows the same pipeline:
 *   provider call → JSON parse → Zod validation → business normalisation
 *
 * The service never writes to the database. It returns validated data and the
 * caller (workflow.service) persists it, which keeps the trust boundary in one
 * place and makes the AI endpoints independently testable.
 */

export type AiCallResult<T> = {
  data: T;
  usage: {
    model: string;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
  /** True when the deterministic fallback produced the result, not a model. */
  heuristic: boolean;
};

const MAX_DESCRIPTION_LENGTH = 4000;

/**
 * Structured-output call with a single repair attempt.
 *
 * A schema-valid response is the common case, but constrained decoding can
 * still return a shape our *business* rules reject (for example an unreachable
 * node). One retry with the validation error appended resolves most of these
 * without looping and burning tokens.
 */
async function callWithValidation<TSchema extends z.ZodTypeAny>(
  provider: AiProvider,
  options: {
    system: string;
    user: string;
    schema: TSchema;
    schemaName: string;
    temperature?: number;
    maxTokens?: number;
  },
): Promise<AiCallResult<z.infer<TSchema>>> {
  const jsonSchema = zodToStrictJsonSchema(options.schema as unknown as z.ZodType<unknown>);
  let userPrompt = options.user;
  let lastIssues: string[] = [];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completion = await provider.completeJson({
      system: options.system,
      user: userPrompt,
      schema: jsonSchema,
      schemaName: options.schemaName,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(completion.content);
    } catch {
      lastIssues = ['Response was not valid JSON'];
      userPrompt = `${options.user}\n\nYour previous response was not valid JSON. Return only the JSON object.`;
      continue;
    }

    const result = options.schema.safeParse(parsed);
    if (result.success) {
      return { data: result.data, usage: { model: completion.model, ...completion.usage }, heuristic: false };
    }

    lastIssues = result.error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`);
    logger.warn('AI output failed validation; retrying once', {
      schemaName: options.schemaName,
      issues: lastIssues.slice(0, 8),
    });
    userPrompt = `${options.user}\n\nYour previous response was rejected for these reasons:\n${lastIssues
      .slice(0, 10)
      .map((issue) => `- ${issue}`)
      .join('\n')}\n\nReturn a corrected JSON object.`;
  }

  throw new AiInvalidOutputError(
    `The AI response did not satisfy the required structure (${lastIssues[0] ?? 'unknown error'})`,
  );
}

/* ------------------------------------------------------- Layout normalisation */

/**
 * Lays out nodes in deterministic layers.
 *
 * The model is asked to place nodes, but a valid graph with poor coordinates
 * would render as an unreadable pile. Rather than trust the model's geometry we
 * recompute positions from the graph topology, which guarantees a legible
 * top-to-bottom layout regardless of what the model returned.
 */
export function layoutGraph(output: AiWorkflowOutput): AiWorkflowOutput {
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of output.nodes) {
    indegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }
  for (const edge of output.edges) {
    if (!indegree.has(edge.target)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    adjacency.get(edge.source)?.push(edge.target);
  }

  // Longest-path layering: a node's row is one past its deepest predecessor, so
  // edges always point downward and merges land below both branches.
  const depth = new Map<string, number>();
  const queue: string[] = [];

  for (const [id, degree] of indegree) {
    if (degree === 0) {
      depth.set(id, 0);
      queue.push(id);
    }
  }

  // Cycles are rejected upstream; the guard below only prevents an infinite loop
  // if a future caller bypasses that validation.
  let guard = 0;
  const maxIterations = output.nodes.length * output.edges.length + output.nodes.length;

  while (queue.length > 0 && guard < maxIterations) {
    guard += 1;
    const current = queue.shift()!;
    const currentDepth = depth.get(current) ?? 0;
    for (const next of adjacency.get(current) ?? []) {
      const candidate = currentDepth + 1;
      if (candidate > (depth.get(next) ?? -1)) depth.set(next, candidate);
      const remaining = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, remaining);
      if (remaining <= 0) queue.push(next);
    }
  }

  // Any node never reached (isolated) gets a row after the deepest known row.
  const maxDepth = Math.max(0, ...Array.from(depth.values()));
  for (const node of output.nodes) {
    if (!depth.has(node.id)) depth.set(node.id, maxDepth + 1);
  }

  const rows = new Map<number, string[]>();
  for (const node of output.nodes) {
    const d = depth.get(node.id) ?? 0;
    const row = rows.get(d) ?? [];
    row.push(node.id);
    rows.set(d, row);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const COLUMN_GAP = 280;

  for (const [rowIndex, ids] of rows) {
    const totalWidth = (ids.length - 1) * COLUMN_GAP;
    ids.forEach((id, columnIndex) => {
      positions.set(id, {
        x: columnIndex * COLUMN_GAP - totalWidth / 2,
        y: rowIndex * 140,
      });
    });
  }

  return {
    ...output,
    nodes: output.nodes.map((node) => ({
      ...node,
      position: positions.get(node.id) ?? node.position,
    })),
  };
}

/* --------------------------------------------------------------- Heuristic */

/**
 * Deterministic fallback used only when the deployment has no OpenAI key.
 *
 * This exists so the product is fully exercisable offline (and in CI) without
 * pretending to be a model: it derives a linear workflow from the description
 * using keyword rules. Every response that uses it is flagged `heuristic: true`
 * and the UI labels it accordingly.
 */
function heuristicWorkflow(description: string): AiWorkflowOutput {
  const clean = description.trim().replace(/\s+/g, ' ');
  const lower = clean.toLowerCase();

  const name = clean.length > 70 ? `${clean.slice(0, 67)}...` : clean || 'New Workflow';

  const stageRules: { test: RegExp; title: string; type: WorkflowNodeType }[] = [
    { test: /(brief|requirement|scope|discovery|research|plan)/, title: 'Gather requirements', type: 'TASK' },
    { test: /(design|ui|ux|wireframe|mockup|brand)/, title: 'Design the solution', type: 'TASK' },
    { test: /(develop|build|implement|code|website|app|product)/, title: 'Build the deliverable', type: 'TASK' },
    { test: /(review|feedback|approve|sign.?off|client)/, title: 'Review and approve', type: 'APPROVAL' },
    { test: /(test|qa|quality|verify)/, title: 'Test and verify', type: 'TASK' },
    { test: /(launch|deploy|release|publish|ship|deliver)/, title: 'Launch and hand over', type: 'TASK' },
    { test: /(report|summar|analytics|retrospect)/, title: 'Report outcomes', type: 'TASK' },
  ];

  const matched = stageRules.filter((rule) => rule.test.test(lower));
  const chosen = matched.length >= 2 ? matched : stageRules.slice(0, 4);

  const nodes: AiWorkflowOutput['nodes'] = [
    {
      id: 'node-1',
      type: 'START',
      title: 'Start',
      description: `Begin: ${name}`,
      position: { x: 0, y: 0 },
      config: {},
    },
  ];

  const edges: AiWorkflowOutput['edges'] = [];
  let index = 2;

  for (const stage of chosen) {
    const id = `node-${index}`;
    nodes.push({
      id,
      type: stage.type,
      title: stage.title,
      description: `Derived from the process description.`,
      position: { x: 0, y: (index - 1) * 140 },
      config: {},
    });
    edges.push({ source: index === 2 ? 'node-1' : `node-${index - 1}`, target: id });
    index += 1;
  }

  nodes.push({
    id: `node-${index}`,
    type: 'END',
    title: 'Complete',
    description: 'Process finished.',
    position: { x: 0, y: (index - 1) * 140 },
    config: {},
  });
  edges.push({ source: `node-${index - 1}`, target: `node-${index}` });

  return layoutGraph({
    name,
    description: `Generated locally from: ${clean}`.slice(0, 1200),
    tags: ['generated', 'local'],
    nodes,
    edges,
  });
}

/* ------------------------------------------------------------ Public API */

export function allowHeuristicFallback(): boolean {
  return process.env.AI_ALLOW_HEURISTIC_FALLBACK === 'true' && !isAiConfigured();
}

export async function generateWorkflow(description: string): Promise<AiCallResult<AiWorkflowOutput>> {
  if (description.trim().length < 10) {
    throw new ValidationError('Describe the process in at least a few words');
  }
  const input = description.slice(0, MAX_DESCRIPTION_LENGTH);

  if (allowHeuristicFallback()) {
    const data = heuristicWorkflow(input);
    return {
      data,
      usage: { model: 'heuristic', promptTokens: null, completionTokens: null, totalTokens: null },
      heuristic: true,
    };
  }

  return callWithValidation(getAiProvider(), {
    system: WORKFLOW_GENERATION_SYSTEM,
    user: buildWorkflowGenerationPrompt(input),
    schema: aiWorkflowSchema,
    schemaName: 'workflow_generation',
    temperature: 0.3,
    maxTokens: 4096,
  }).then(async (result) => ({ ...result, data: layoutGraph(result.data) }));
}

export async function improveWorkflow(
  graphJson: string,
  goal?: string,
): Promise<AiCallResult<AiImprovementOutput>> {
  if (allowHeuristicFallback()) {
    return {
      data: {
        summary:
          'AI analysis is unavailable because no model provider is configured. Enable OPENAI_API_KEY for real recommendations.',
        suggestions: [],
      },
      usage: { model: 'heuristic', promptTokens: null, completionTokens: null, totalTokens: null },
      heuristic: true,
    };
  }

  return callWithValidation(getAiProvider(), {
    system: WORKFLOW_IMPROVEMENT_SYSTEM,
    user: buildWorkflowImprovementPrompt(graphJson, goal),
    schema: aiImprovementSchema,
    schemaName: 'workflow_improvement',
    temperature: 0.3,
    maxTokens: 2048,
  });
}

export async function generateTasks(nodesJson: string): Promise<AiCallResult<AiTaskListOutput>> {
  if (allowHeuristicFallback()) {
    return {
      data: { tasks: [] },
      usage: { model: 'heuristic', promptTokens: null, completionTokens: null, totalTokens: null },
      heuristic: true,
    };
  }

  return callWithValidation(getAiProvider(), {
    system: TASK_GENERATION_SYSTEM,
    user: buildTaskGenerationPrompt(nodesJson),
    schema: aiTaskListSchema,
    schemaName: 'task_generation',
    temperature: 0.2,
    maxTokens: 2048,
  });
}

export async function summarizeWorkflow(graphJson: string): Promise<AiCallResult<AiSummaryOutput>> {
  if (allowHeuristicFallback()) {
    return {
      data: {
        summary: 'AI summaries are unavailable because no model provider is configured.',
        highlights: [],
        risks: [],
      },
      usage: { model: 'heuristic', promptTokens: null, completionTokens: null, totalTokens: null },
      heuristic: true,
    };
  }

  return callWithValidation(getAiProvider(), {
    system: WORKFLOW_SUMMARY_SYSTEM,
    user: buildWorkflowSummaryPrompt(graphJson),
    schema: aiSummarySchema,
    schemaName: 'workflow_summary',
    temperature: 0.4,
    maxTokens: 1024,
  });
}
