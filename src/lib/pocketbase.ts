import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/public';

const getPbUrl = () =>
  env.PUBLIC_POCKETBASE_URL || 'https://spiritoalchemico.marcovittorino.com';

export const createPbClient = () => {
  const client = new PocketBase(getPbUrl());
  // Senza questo, due richieste simultanee sulla stessa collection (es. layout + pagina)
  // si annullano a vicenda ("autocancelled") e gli errori finiscono ingoiati dai .catch.
  client.autoCancellation(false);
  return client;
};

// Client-side singleton (non usato sul server; sul server si usa createPbClient per request)
export const pb = createPbClient();
