import PocketBase from 'pocketbase';

export const PB_URL = 'https://erp.tuodominio.com';

export const createPbClient = () => new PocketBase(PB_URL);

// Client-side singleton (non usato sul server; sul server si usa createPbClient per request)
export const pb = createPbClient();

