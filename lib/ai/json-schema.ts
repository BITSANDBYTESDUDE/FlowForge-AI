import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodType } from 'zod';

/**
 * Converts a Zod schema into the JSON Schema dialect OpenAI's strict structured
 * output mode requires.
 *
 * Strict mode demands `additionalProperties: false` on every object and that
 * every property appear in `required`. Zod emits optional properties without
 * those guarantees, so the output is post-processed: optional fields stay
 * present but become nullable-free by being listed as required (the model must
 * supply them, and our Zod schema applies defaults afterwards).
 */
export function zodToStrictJsonSchema(schema: ZodType<unknown>): Record<string, unknown> {
  const generated = zodToJsonSchema(schema, {
    $refStrategy: 'none',
    target: 'openAi',
  }) as Record<string, unknown>;

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

    // anyOf/oneOf unions are not expressible in strict mode for our schemas;
    // the practical case is "T | undefined", which Zod already collapses.
    if (out.type === 'object' && out.properties && typeof out.properties === 'object') {
      const properties = out.properties as Record<string, unknown>;
      out.additionalProperties = false;
      out.required = Object.keys(properties);
    }

    return out;
  }

  return visit(generated) as Record<string, unknown>;
}
