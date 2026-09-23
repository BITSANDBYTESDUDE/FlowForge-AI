import { randomUUID } from 'node:crypto';

/** Generates a stable, URL-safe identifier for graph nodes and edges. */
export function createNodeId(): string {
  return `node-${randomUUID()}`;
}

export function createEdgeId(): string {
  return `edge-${randomUUID()}`;
}

/** Generates a lowercase URL slug from arbitrary text. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
