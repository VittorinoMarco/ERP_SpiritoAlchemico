import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/public';

const getPbUrl = () =>
  env.PUBLIC_POCKETBASE_URL ?? 'https://spiritoalchemico.marcovittorino.com';

export const createPbClient = () => new PocketBase(getPbUrl());

// Client-side singleton (non usato sul server; sul server si usa createPbClient per request)
export const pb = createPbClient();

