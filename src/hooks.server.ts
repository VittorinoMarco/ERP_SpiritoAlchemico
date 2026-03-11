import type { Handle } from '@sveltejs/kit';

// Con adapter-static non c'è server runtime: auth è gestita client-side
// L'hook viene eseguito solo durante il build per la prerenderizzazione
export const handle: Handle = async ({ event, resolve }) => {
  return resolve(event);
};
