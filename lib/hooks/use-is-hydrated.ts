'use client';

import * as React from 'react';

/**
 * True once React has hydrated the client component in the browser.
 *
 * Server-rendered HTML is interactive-looking before hydration but its handlers
 * are not attached yet. For a plain form that is more than a cosmetic problem:
 * clicking submit in that window performs a native browser submission, which
 * navigates to the same URL with the form fields serialised into the query
 * string. On a sign-in or registration form that writes the password into the
 * URL, into history entries, and into the server access log.
 *
 * Gating the submit control on this flag closes that window. The form is inert
 * for the few hundred milliseconds before hydration instead of leaking.
 */
export function useIsHydrated(): boolean {
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}
