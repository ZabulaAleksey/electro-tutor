/**
 * Public MVP visibility switches.
 * Implementations and legacy routes remain available; these flags only control
 * what the public student shell advertises by default.
 */
export const publicSurface = {
  showAuth: false,
  showContacts: false,
  showCommercial: false,
  showProgress: false,
} as const;
