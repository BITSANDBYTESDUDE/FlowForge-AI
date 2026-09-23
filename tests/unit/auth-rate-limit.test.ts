import { describe, expect, it } from 'vitest';
import { getAuthRateLimitConfig, getBucketConfig } from '@/lib/rate-limit';

/**
 * Auth rate-limit tests.
 *
 * Better Auth's own limiter is what protects `/api/auth/*`, and its defaults
 * ignore our configuration entirely: disabled outside production, and a
 * hard-coded 3 requests / 10s on sign-in where it is enabled. These tests pin
 * the shape we hand the library, because the failure mode is silent — the app
 * keeps working while quietly enforcing limits nobody configured.
 *
 * `/get-session` exclusion is asserted explicitly. It is the easiest thing to
 * "tidy up" into the credential list and the worst to get wrong: that endpoint
 * runs on every page load, so including it locks a signed-in user out of the
 * app after a handful of navigations.
 *
 * Scope note: this pins the config we hand Better Auth, not that Better Auth
 * consumes it. The auth instance imports `next/headers`, so it cannot be
 * constructed in Vitest's node environment. The wiring itself is covered by
 * `scripts/smoke-api.ts`, which signs in as five different users over real HTTP
 * and fails on the first 429 — a check that broke before this config existed.
 */
describe('getAuthRateLimitConfig', () => {
  it('is enabled outside production', () => {
    // The library defaults this to production-only. Tests run under NODE_ENV
    // "test", so a true value here is the regression guard.
    expect(getAuthRateLimitConfig().enabled).toBe(true);
  });

  it('applies the configured limits rather than the library defaults', () => {
    const config = getAuthRateLimitConfig();
    const auth = getBucketConfig('auth');

    for (const rule of Object.values(config.customRules)) {
      expect(rule.max).toBe(auth.limit);
      expect(rule.window).toBe(auth.windowSeconds);
    }
  });

  it('limits the credential endpoints', () => {
    const { customRules } = getAuthRateLimitConfig();

    expect(customRules['/sign-in/*']).toBeDefined();
    expect(customRules['/sign-up/*']).toBeDefined();
    expect(customRules['/forget-password']).toBeDefined();
    expect(customRules['/reset-password']).toBeDefined();
    expect(customRules['/change-password']).toBeDefined();
    expect(customRules['/change-email']).toBeDefined();
  });

  it('does not limit session reads', () => {
    const { customRules } = getAuthRateLimitConfig();

    for (const path of Object.keys(customRules)) {
      expect(path).not.toContain('get-session');
      expect(path).not.toContain('sign-out');
    }
  });

  it('leaves the default window generous enough for ordinary browsing', () => {
    const config = getAuthRateLimitConfig();
    const api = getBucketConfig('api');

    // The default is what applies to any auth path not named above.
    expect(config.max).toBe(api.limit);
    expect(config.window).toBe(api.windowSeconds);
  });

  it('does not reuse one budget for credential and non-credential paths', () => {
    const config = getAuthRateLimitConfig();

    // If these collapsed to the same numbers, the two-tier split would be gone
    // and session reads would inherit the credential budget.
    expect(config.max).not.toBe(getBucketConfig('auth').limit);
  });
});
