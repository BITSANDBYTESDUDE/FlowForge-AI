/**
 * Loads `.env` for standalone scripts.
 *
 * This must be a separate module imported *before* anything that reads the
 * environment. ES modules are evaluated depth-first in import order, so a
 * barrel file that calls `loadEnvConfig` here runs before `lib/auth/auth.ts`
 * (which calls `getEnv()` at module scope) is ever evaluated. Putting the call
 * inline in the script would be too late — all of a module's static imports are
 * evaluated before its first statement.
 */
import { loadEnvConfig } from '@next/env';

// Uses Next's own loader so precedence matches `next dev` exactly
// (`.env.local` overrides `.env`).
loadEnvConfig(process.cwd());
