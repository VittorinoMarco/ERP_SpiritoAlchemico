// App SPA (adapter-static con fallback): l'autenticazione PocketBase esiste solo nel browser,
// quindi niente SSR → nessun flash di contenuti protetti e nessun mismatch di hydration.
export const ssr = false;
