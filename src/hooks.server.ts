import type { Handle } from '@sveltejs/kit';
import { createPbClient } from '$lib/pocketbase';

export const handle: Handle = async ({ event, resolve }) => {
  const pb = createPbClient();

  pb.authStore.loadFromCookie(event.request.headers.get('cookie') ?? '');

  try {
    if (pb.authStore.isValid) {
      await pb.collection('users').authRefresh();
    }
  } catch {
    pb.authStore.clear();
  }

  event.locals.pb = pb;
  event.locals.user = (pb.authStore.model ?? null) as import('pocketbase').RecordModel | null;

  const response = await resolve(event);

  const cookie = pb.authStore.exportToCookie({
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/'
  });

  if (cookie) {
    response.headers.append('set-cookie', cookie);
  }

  return response;
};

