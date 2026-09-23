import OpenAI from 'openai';
import { getEnv, hasOpenAI } from '@/lib/env';
import { AiUnavailableError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

/**
 * LLM provider boundary.
 *
 * Everything above this module works with plain JSON strings, so swapping in a
 * different gateway (Azure, Bedrock, an internal proxy) is a change to one file.
 * The OpenAI SDK is only imported lazily-constructed here and the API key never
 * leaves the server.
 */
export type JsonCompletionRequest = {
  system: string;
  user: string;
  /** JSON Schema handed to the provider for constrained decoding. */
  schema: Record<string, unknown>;
  schemaName: string;
  temperature?: number;
  maxTokens?: number;
};

export type JsonCompletionResult = {
  /** Raw JSON text. Callers must validate with Zod before use. */
  content: string;
  model: string;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
};

export interface AiProvider {
  readonly name: string;
  completeJson(request: JsonCompletionRequest): Promise<JsonCompletionResult>;
}

/* --------------------------------------------------------------- OpenAI impl */

class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (this.client) return this.client;
    const env = getEnv();
    if (!env.OPENAI_API_KEY) throw new AiUnavailableError();
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
      timeout: 60_000,
      maxRetries: 2,
    });
    return this.client;
  }

  async completeJson(request: JsonCompletionRequest): Promise<JsonCompletionResult> {
    const env = getEnv();
    const client = this.getClient();

    const response = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 4096,
      // Constrained decoding: the model is structurally incapable of returning
      // prose around the object, which removes an entire class of parse failure.
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: request.schemaName,
          strict: true,
          schema: request.schema,
        },
      },
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      logger.warn('OpenAI returned an empty completion', { model: env.OPENAI_MODEL });
      throw new AiUnavailableError('The AI service returned an empty response');
    }

    return {
      content,
      model: response.model ?? env.OPENAI_MODEL,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? null,
        completionTokens: response.usage?.completion_tokens ?? null,
        totalTokens: response.usage?.total_tokens ?? null,
      },
    };
  }
}

/* -------------------------------------------------------------- Resolution */

const openAiProvider = new OpenAiProvider();

/**
 * Returns the configured provider.
 *
 * When no API key is present this throws rather than silently fabricating a
 * response. Callers that want the local heuristic fallback must opt in
 * explicitly via `AI_ALLOW_HEURISTIC_FALLBACK`, and the resulting artefact is
 * labelled as heuristic in the API response so the UI never presents generated
 * rules as model output.
 */
export function getAiProvider(): AiProvider {
  if (!hasOpenAI()) {
    throw new AiUnavailableError(
      'AI features require OPENAI_API_KEY to be configured on the server',
    );
  }
  return openAiProvider;
}

export function isAiConfigured(): boolean {
  return hasOpenAI();
}

/**
 * Converts a Zod schema into a JSON Schema for strict structured output.
 *
 * OpenAI's strict mode requires `additionalProperties: false` on every object
 * and a complete `required` list. Zod's own converter emits optional properties
 * without that guarantee, so the emitted schema is post-processed.
 */
export function toStrictJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const seen = new WeakSet<object>();

  function visit(node: unknown): unknown {
    if (node === null || typeof node !== 'object') return node;
    if (seen.has(node as object)) return node;
    seen.add(node as object);

    if (Array.isArray(node)) return node.map(visit);

    const source = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(source)) {
      if (key === '$schema' || key === 'default' || key === 'examples') continue;
      out[key] = visit(value);
    }

    if (out.type === 'object' && out.properties) {
      const properties = out.properties as Record<string, unknown>;
      out.properties = properties;
      out.additionalProperties = false;
      // Strict mode demands every property be listed in `required`.
      out.required = Object.keys(properties);
    }

    return out;
  }

  return visit(schema) as Record<string, unknown>;
}
