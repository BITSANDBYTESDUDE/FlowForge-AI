export type AiSuggestionKind =
  | 'MISSING_STEP'
  | 'UNNECESSARY_STEP'
  | 'BOTTLENECK'
  | 'UNCLEAR_DEPENDENCY'
  | 'IMPROVEMENT';

export type AiSuggestion = {
  kind: AiSuggestionKind;
  title: string;
  detail: string;
  nodeIds?: string[];
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
};

export type WorkflowImprovementResult = {
  summary: string;
  suggestions: AiSuggestion[];
  /** A revised graph the user may apply; never persisted automatically. */
  proposedGraph: { nodes: unknown[]; edges: unknown[] } | null;
};

export type AiUsage = {
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};
