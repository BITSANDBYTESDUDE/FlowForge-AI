/**
 * Client-safe slug generation.
 *
 * Deliberately separate from `lib/utils/id.ts`, which imports `node:crypto` to
 * mint node/edge ids and therefore cannot be pulled into a browser bundle.
 * Importing that module from a client component fails the build.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
