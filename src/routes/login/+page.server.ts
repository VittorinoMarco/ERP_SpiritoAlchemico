import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) {
    throw redirect(302, '/');
  }

  return {};
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const formData = await request.formData();
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    if (!email || !password) {
      return fail(400, {
        error: 'Email e password sono obbligatorie.',
        values: { email }
      });
    }

    try {
      await locals.pb.collection('users').authWithPassword(email, password);
    } catch {
      return fail(400, {
        error: 'Credenziali non valide.',
        values: { email }
      });
    }

    throw redirect(303, '/');
  }
};

