import { randomUUID } from 'node:crypto';

/**
 * Server-only identifier helpers.
 *
 * `node:crypto` cannot be bundled for the browser, so anything a client
 * component needs (see `lib/utils/slugify.ts`) lives in its own module rather
 * than here.
 */

/** Generates a stable, URL-safe identifier for graph nodes and edges. */
export function createNodeId(): string {
  return `node-${randomUUID()}`;
}

export function createEdgeId(): string {
  return `edge-${randomUUID()}`;
}
